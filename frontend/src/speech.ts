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
  rec.continuous = false
  rec.interimResults = true
  rec.maxAlternatives = 1
  return rec
}

export interface RecognitionCallbacks {
  onInterim?: (transcript: string) => void
  onFinal: (transcript: string) => void
  onError?: (message: string) => void
  onEnd?: () => void
}

export function listenOnce(lang: string, callbacks: RecognitionCallbacks): {
  stop: () => void
} | null {
  const rec = createRecognizer(lang)
  if (!rec) return null

  let finalText = ''

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
    if (interim && callbacks.onInterim) {
      callbacks.onInterim(interim)
    }
  }

  rec.onerror = (event) => {
    callbacks.onError?.(event.error || 'Unknown speech recognition error')
  }

  rec.onend = () => {
    if (finalText.trim()) {
      callbacks.onFinal(finalText.trim())
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
