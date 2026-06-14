/**
 * Minimal wrappers around the browser Web Speech API.
 *
 * - `createRecognizer` returns a SpeechRecognition instance (or null when the
 *   browser doesn't support it). We use interim results for a more "live" UX.
 * - `speak` picks a voice matching the requested BCP-47 locale and plays it
 *   through the SpeechSynthesis engine.
 *
 * Both APIs only work in Chromium-based browsers reliably as of 2025; Safari
 * has partial support and Firefox does not implement SpeechRecognition. We
 * report unsupported features so the UI can degrade to text-only.
 */

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

interface SpeechRecognitionResult {
  isFinal: boolean
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message?: string
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((ev: SpeechRecognitionEvent) => void) | null
  onerror: ((ev: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  onstart: (() => void) | null
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike
}

interface WindowWithSpeech extends Window {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export function isRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false
  const w = window as WindowWithSpeech
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export function isSynthesisSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

export function createRecognizer(lang: string): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null
  const w = window as WindowWithSpeech
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return null
  const rec = new Ctor()
  rec.lang = lang
  // Continuous mode lets the user fully control when listening stops.
  // Chrome's auto end-of-speech detection can be flaky for short tonal
  // utterances (e.g. Vietnamese), and an explicit stop button is clearer UX.
  rec.continuous = true
  rec.interimResults = true
  rec.maxAlternatives = 1
  return rec
}

export interface RecognitionCallbacks {
  onInterim?: (transcript: string) => void
  onFinal: (transcript: string) => void
  onError?: (message: string) => void
  onEnd?: () => void
  onStart?: () => void
}

const ERROR_MESSAGES: Record<string, string> = {
  'no-speech': 'Không nghe thấy gì. Kiểm tra micro và nói to hơn.',
  'audio-capture': 'Không truy cập được micro. Kiểm tra micro đang cắm/bật.',
  'not-allowed': 'Trình duyệt đã chặn quyền micro. Cho phép localhost trong cài đặt site.',
  'service-not-allowed':
    'Dịch vụ nhận dạng giọng nói bị chặn. Thử kiểm tra kết nối mạng.',
  network: 'Lỗi mạng khi gọi dịch vụ nhận dạng giọng nói của Google.',
  aborted: 'Bị hủy.',
  'language-not-supported':
    'Ngôn ngữ này không được hỗ trợ bởi trình duyệt.',
}

function friendlyError(code: string): string {
  return ERROR_MESSAGES[code] ?? `Speech recognition: ${code}`
}

export function listenOnce(lang: string, callbacks: RecognitionCallbacks): {
  stop: () => void
} | null {
  const rec = createRecognizer(lang)
  if (!rec) return null

  let finalText = ''
  let lastInterim = ''
  let stopped = false

  rec.onstart = () => {
    callbacks.onStart?.()
  }

  rec.onresult = (event) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i]
      const transcript = result[0]?.transcript ?? ''
      if (result.isFinal) {
        finalText += transcript
      } else {
        interim += transcript
      }
    }
    lastInterim = interim
    if (callbacks.onInterim) {
      callbacks.onInterim(interim)
    }
  }

  rec.onerror = (event) => {
    // 'no-speech' and 'aborted' are not fatal — they fire when the user stops
    // without saying anything, or when we abort programmatically. Don't surface
    // these as errors unless we also got no text at all.
    if (event.error === 'aborted') return
    callbacks.onError?.(friendlyError(event.error))
  }

  rec.onend = () => {
    // If continuous mode didn't return a final result but interim text is
    // populated, use the interim text as the final transcript so the user's
    // utterance doesn't get lost (this can happen on some Chrome builds).
    const combined = (finalText || lastInterim).trim()
    if (combined) {
      callbacks.onFinal(combined)
    }
    callbacks.onEnd?.()
  }

  try {
    rec.start()
  } catch (err) {
    callbacks.onError?.(err instanceof Error ? err.message : String(err))
    return null
  }

  return {
    stop: () => {
      if (stopped) return
      stopped = true
      try {
        rec.stop()
      } catch {
        // already stopped
      }
    },
  }
}

let _voicesCache: SpeechSynthesisVoice[] | null = null

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (!isSynthesisSupported()) {
      resolve([])
      return
    }
    const existing = window.speechSynthesis.getVoices()
    if (existing.length > 0) {
      _voicesCache = existing
      resolve(existing)
      return
    }
    const handler = () => {
      const voices = window.speechSynthesis.getVoices()
      _voicesCache = voices
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(voices)
    }
    window.speechSynthesis.addEventListener('voiceschanged', handler)
    // Safety timeout — some browsers never fire voiceschanged
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handler)
      resolve(window.speechSynthesis.getVoices())
    }, 1500)
  })
}

function pickVoice(voices: SpeechSynthesisVoice[], lang: string): SpeechSynthesisVoice | null {
  const exact = voices.find((v) => v.lang === lang)
  if (exact) return exact
  const prefix = lang.split('-')[0]
  return voices.find((v) => v.lang.startsWith(prefix)) ?? null
}

export async function speak(text: string, lang: string): Promise<void> {
  if (!text.trim() || !isSynthesisSupported()) return
  const voices = _voicesCache ?? (await loadVoices())
  const voice = pickVoice(voices, lang)
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = lang
  if (voice) utter.voice = voice
  utter.rate = 1
  utter.pitch = 1
  // Cancel any in-progress speech so rapid translations don't pile up.
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utter)
}

export function cancelSpeech(): void {
  if (isSynthesisSupported()) {
    window.speechSynthesis.cancel()
  }
}
