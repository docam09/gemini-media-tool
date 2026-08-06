import type { SonioxSession } from './live'
import type {
  LanguageCode,
  LanguageInfo,
  ModelsResponse,
  PresetsResponse,
  StreamDone,
  Style,
  TranslateResponse,
  Turn,
  VerifyResponse,
} from './types'

const API_BASE = '/api'

export interface TranslateParams {
  text: string
  source: LanguageCode
  target: LanguageCode
  style?: Style
  context?: string
  glossary?: string
  model?: string
  history?: Turn[]
}

function body(params: TranslateParams): string {
  return JSON.stringify({
    text: params.text,
    source: params.source,
    target: params.target,
    style: params.style ?? 'casual',
    context: params.context?.trim() || null,
    glossary: params.glossary?.trim() || null,
    model: params.model || null,
    history: params.history ?? [],
  })
}

/** Turn a failed response into an Error carrying the backend's detail message. */
async function toError(res: Response): Promise<Error> {
  let detail = `HTTP ${res.status}`
  // Clone the response so we can fall back to text() if the body isn't JSON.
  const cloned = res.clone()
  try {
    const parsed = (await res.json()) as { detail?: string }
    if (parsed.detail) detail = `${detail} \u2014 ${parsed.detail}`
  } catch {
    try {
      const text = await cloned.text()
      if (text.trim()) detail = `${detail} \u2014 ${text.trim()}`
    } catch {
      // give up
    }
  }
  return new Error(detail)
}

export async function fetchLanguages(): Promise<Record<LanguageCode, LanguageInfo>> {
  const res = await fetch(`${API_BASE}/languages`)
  if (!res.ok) throw await toError(res)
  const data = (await res.json()) as { languages: Record<LanguageCode, LanguageInfo> }
  return data.languages
}

export async function fetchHealth(): Promise<{
  status: string
  gemini_configured: boolean
  soniox_configured: boolean
  model: string
}> {
  const res = await fetch(`${API_BASE}/healthz`)
  if (!res.ok) throw await toError(res)
  return res.json()
}

export async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/models`)
  if (!res.ok) throw await toError(res)
  return res.json()
}

export async function fetchPresets(): Promise<PresetsResponse> {
  const res = await fetch(`${API_BASE}/presets`)
  if (!res.ok) throw await toError(res)
  return res.json()
}

export async function translate(
  params: TranslateParams,
  signal?: AbortSignal,
): Promise<TranslateResponse> {
  const res = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body(params),
    signal,
  })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as TranslateResponse
}

export interface StreamHandlers {
  onDelta: (text: string) => void
  onDone: (done: StreamDone) => void
}

/**
 * Stream a translation over Server-Sent Events.
 *
 * Deltas start arriving ~300ms in, so the user sees the sentence forming
 * instead of staring at a spinner for the full round trip. Pass an
 * `AbortSignal` to cancel a superseded request — with speech input a new
 * utterance can start before the previous one finishes.
 */
export async function translateStream(
  params: TranslateParams,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_BASE}/translate/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body(params),
    signal,
  })
  if (!res.ok) throw await toError(res)
  if (!res.body) throw new Error('Streaming is not supported by this browser')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line.
      let split = buffer.indexOf('\n\n')
      while (split !== -1) {
        const frame = buffer.slice(0, split)
        buffer = buffer.slice(split + 2)
        dispatch(frame, handlers)
        split = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}

function dispatch(frame: string, handlers: StreamHandlers): void {
  let event = 'message'
  const dataLines: string[] = []
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return

  const payload = JSON.parse(dataLines.join('\n')) as Record<string, unknown>
  if (event === 'delta') {
    handlers.onDelta(String(payload.text ?? ''))
  } else if (event === 'done') {
    handlers.onDone(payload as unknown as StreamDone)
  } else if (event === 'error') {
    throw new Error(String(payload.detail ?? 'Translation failed'))
  }
}

export async function verify(params: {
  text: string
  translation: string
  source: LanguageCode
  target: LanguageCode
  model?: string
}): Promise<VerifyResponse> {
  const res = await fetch(`${API_BASE}/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, model: params.model || null }),
  })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as VerifyResponse
}

/**
 * Ask the backend for a short-lived Soniox key plus the session config to use
 * with it. Called once per recording session, and again on reconnects, because
 * the key expires within a couple of minutes.
 */
export async function fetchSonioxSession(params: {
  preset?: string
  context?: string
  glossary?: string
}): Promise<SonioxSession> {
  const res = await fetch(`${API_BASE}/soniox/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preset: params.preset ?? null,
      context: params.context ?? null,
      glossary: params.glossary ?? null,
    }),
  })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as SonioxSession
}

export async function fetchDiag(): Promise<{
  ok: boolean
  stage?: string
  detail?: string
  model?: string
  sample?: string
  latency_ms?: number
}> {
  const res = await fetch(`${API_BASE}/diag`)
  return res.json()
}
