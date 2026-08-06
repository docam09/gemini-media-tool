/**
 * Live two-way interpreter built on Soniox.
 *
 * Soniox streams transcription and translation over a single WebSocket in
 * `two_way` mode: it works out whether the speaker used Vietnamese or Korean
 * and emits translated tokens for the other language mid-sentence. So unlike
 * the Web Speech + Gemini path there is no fixed recogniser language and no
 * direction to flip — two people just talk.
 *
 * Tokens arrive tagged `original` or `translation` and are not aligned with
 * each other, so this module keeps the two streams separate and cuts them into
 * turns on Soniox's endpoint events (speaker stopped talking).
 */

import { SonioxClient, type RealtimeToken, type Recording } from '@soniox/client'

import type { LanguageCode } from './types'

/** One completed exchange: what was said, and what it became. */
export interface LiveTurn {
  sourceLang: LanguageCode
  targetLang: LanguageCode
  sourceText: string
  targetText: string
}

/** In-progress text, replaced on every update. */
export interface LiveDraft {
  sourceText: string
  targetText: string
  /** Language currently being spoken, once Soniox has identified it. */
  sourceLang: LanguageCode | null
}

export interface LiveCallbacks {
  /** Fires continuously while someone is speaking. */
  onDraft: (draft: LiveDraft) => void
  /** Fires once per finished utterance. */
  onTurn: (turn: LiveTurn) => void
  onError: (message: string) => void
  onStateChange?: (state: 'connecting' | 'listening' | 'stopped') => void
}

export interface LiveHandle {
  stop: () => Promise<void>
  cancel: () => void
  /** Mute the mic without dropping the session — used while our TTS plays. */
  pause: () => void
  resume: () => void
}

/** The session config our backend builds; passed to Soniox unchanged. */
export interface SonioxSessionConfig {
  model: string
  audio_format: 'auto'
  language_hints: string[]
  enable_language_identification: boolean
  enable_endpoint_detection: boolean
  max_endpoint_delay_ms: number
  translation: { type: 'two_way'; language_a: string; language_b: string }
  context: {
    general?: { key: string; value: string }[]
    text?: string
    terms?: string[]
    translation_terms?: { source: string; target: string }[]
  }
}

export interface SonioxSession {
  api_key: string
  websocket_url: string
  expires_in_seconds: number
  config: SonioxSessionConfig
}

/**
 * A turn is emitted this long after Soniox reports an endpoint. Translation
 * tokens for the tail of a sentence land after the endpoint event, so flushing
 * immediately would cut them off; each late token restarts the timer.
 */
const FLUSH_DELAY_MS = 500

function isLanguageCode(value: string | undefined): value is LanguageCode {
  return value === 'vi' || value === 'ko'
}

function other(lang: LanguageCode): LanguageCode {
  return lang === 'vi' ? 'ko' : 'vi'
}

function joinTokens(tokens: RealtimeToken[]): string {
  return tokens
    .map((token) => token.text)
    .join('')
    .trim()
}

/**
 * Splits the interleaved Soniox token stream into a current draft and completed
 * turns.
 *
 * Original and translation tokens arrive in the same messages, unaligned and
 * repeated until they go final, so this keeps four buckets: final/draft ×
 * original/translation. Kept separate from the WebSocket wiring so the turn
 * boundaries can be tested without a microphone.
 */
export class TurnAssembler {
  private finalOriginal: RealtimeToken[] = []
  private finalTranslation: RealtimeToken[] = []
  private draftOriginal: RealtimeToken[] = []
  private draftTranslation: RealtimeToken[] = []

  /** Feed one `result` message. Returns true if it added final translation text. */
  push(tokens: RealtimeToken[]): boolean {
    // Non-final tokens are re-sent in full on every message, so the draft
    // buckets are rebuilt rather than appended to.
    this.draftOriginal = []
    this.draftTranslation = []
    let addedFinalTranslation = false

    for (const token of tokens) {
      const isTranslation = token.translation_status === 'translation'
      if (token.is_final) {
        if (isTranslation) {
          this.finalTranslation.push(token)
          addedFinalTranslation = true
        } else {
          this.finalOriginal.push(token)
        }
      } else if (isTranslation) {
        this.draftTranslation.push(token)
      } else {
        this.draftOriginal.push(token)
      }
    }
    return addedFinalTranslation
  }

  draft(): LiveDraft {
    const original = [...this.finalOriginal, ...this.draftOriginal]
    const translation = [...this.finalTranslation, ...this.draftTranslation]
    return {
      sourceText: joinTokens(original),
      targetText: joinTokens(translation),
      sourceLang: detectLanguage(original, translation),
    }
  }

  /** Drop everything not yet finalised (e.g. after a session restart). */
  dropDraft(): void {
    this.draftOriginal = []
    this.draftTranslation = []
  }

  reset(): void {
    this.finalOriginal = []
    this.finalTranslation = []
    this.dropDraft()
  }

  /**
   * Close the current turn.
   *
   * Returns null for the empty turns Soniox reports whenever it detects a pause
   * in what turned out to be silence — those must not reach the history.
   */
  flush(): LiveTurn | null {
    const sourceText = joinTokens(this.finalOriginal)
    const targetText = joinTokens(this.finalTranslation)
    const sourceLang = detectLanguage(this.finalOriginal, this.finalTranslation)
    this.reset()

    if (!sourceText || !targetText || !sourceLang) return null
    return { sourceLang, targetLang: other(sourceLang), sourceText, targetText }
  }
}

/**
 * Which language was being spoken. Language identification tags the original
 * tokens; when it hasn't decided yet, the translation tokens still say which
 * language they came *from*.
 */
function detectLanguage(
  original: RealtimeToken[],
  translation: RealtimeToken[],
): LanguageCode | null {
  for (const token of original) {
    if (isLanguageCode(token.language)) return token.language
  }
  for (const token of translation) {
    if (isLanguageCode(token.source_language)) return token.source_language
  }
  return null
}

/**
 * Start streaming the microphone to Soniox.
 *
 * `getSession` must return a fresh temporary key from our backend — the
 * long-lived key never reaches the browser.
 */
export function startLiveInterpreter(
  getSession: () => Promise<SonioxSession>,
  callbacks: LiveCallbacks,
): LiveHandle {
  const assembler = new TurnAssembler()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const emitDraft = () => callbacks.onDraft(assembler.draft())

  const flush = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    const turn = assembler.flush()
    emitDraft()
    if (turn) callbacks.onTurn(turn)
  }

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(flush, FLUSH_DELAY_MS)
  }

  let recording: Recording | null = null

  void (async () => {
    let session: SonioxSession
    try {
      callbacks.onStateChange?.('connecting')
      session = await getSession()
    } catch (err: unknown) {
      callbacks.onStateChange?.('stopped')
      callbacks.onError(err instanceof Error ? err.message : String(err))
      return
    }
    if (stopped) return

    // Temporary keys are short-lived, so the SDK must be able to fetch a fresh
    // one when it reconnects. The key we already hold covers the first attempt.
    let primed: SonioxSession | null = session
    const client = new SonioxClient({
      config: async () => {
        const current = primed ?? (await getSession())
        primed = null
        return { api_key: current.api_key, stt_ws_url: current.websocket_url }
      },
    })

    recording = client.realtime.record(session.config)

    recording.on('connected', () => callbacks.onStateChange?.('listening'))
    recording.on('finished', () => callbacks.onStateChange?.('stopped'))
    recording.on('error', (error) => {
      callbacks.onError(error instanceof Error ? error.message : String(error))
    })
    recording.on('endpoint', scheduleFlush)
    recording.on('session_restart', (event) => {
      if (event.reset_transcript) assembler.reset()
      else assembler.dropDraft()
      emitDraft()
    })
    recording.on('result', (result) => {
      const addedFinalTranslation = assembler.push(result.tokens)
      emitDraft()
      // Trailing translation tokens keep arriving after the endpoint fires;
      // push the flush out so the turn isn't truncated mid-word.
      if (addedFinalTranslation && flushTimer) scheduleFlush()
    })
  })()

  return {
    stop: async () => {
      stopped = true
      if (flushTimer) clearTimeout(flushTimer)
      try {
        await recording?.stop()
      } finally {
        flush()
        callbacks.onStateChange?.('stopped')
      }
    },
    cancel: () => {
      stopped = true
      if (flushTimer) clearTimeout(flushTimer)
      recording?.cancel()
      callbacks.onStateChange?.('stopped')
    },
    pause: () => recording?.pause(),
    resume: () => recording?.resume(),
  }
}
