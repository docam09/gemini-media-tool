import type {
  LanguageCode,
  LanguageInfo,
  ModelsResponse,
  Style,
  TranslateResponse,
} from './types'

// Defaults to same-origin "/api". For a deployed backend on a different
// origin, set VITE_API_BASE_URL at build time.
const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '/api'

function authHeaders(apiKey?: string): HeadersInit {
  return apiKey ? { 'X-Gemini-Api-Key': apiKey } : {}
}

export async function fetchLanguages(): Promise<Record<LanguageCode, LanguageInfo>> {
  const res = await fetch(`${API_BASE}/languages`)
  if (!res.ok) {
    throw new Error(`Failed to load languages: ${res.status}`)
  }
  const data = (await res.json()) as { languages: Record<LanguageCode, LanguageInfo> }
  return data.languages
}

export async function fetchHealth(): Promise<{
  status: string
  server_key_configured: boolean
  model: string
}> {
  const res = await fetch(`${API_BASE}/healthz`)
  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`)
  }
  return res.json()
}

export async function fetchModels(): Promise<ModelsResponse> {
  const res = await fetch(`${API_BASE}/models`)
  if (!res.ok) {
    throw new Error(`Failed to load models: ${res.status}`)
  }
  return res.json()
}

export async function translate(params: {
  text: string
  source: LanguageCode
  target: LanguageCode
  style?: Style
  context?: string
  glossary?: string
  model?: string
  apiKey?: string
}): Promise<TranslateResponse> {
  const res = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(params.apiKey),
    },
    body: JSON.stringify({
      text: params.text,
      source: params.source,
      target: params.target,
      style: params.style ?? 'casual',
      context: params.context?.trim() || null,
      glossary: params.glossary?.trim() || null,
      model: params.model || null,
    }),
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    const cloned = res.clone()
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = `${detail} — ${body.detail}`
    } catch {
      try {
        const text = await cloned.text()
        if (text.trim()) detail = `${detail} — ${text.trim()}`
      } catch {
        // give up
      }
    }
    throw new Error(detail)
  }

  return (await res.json()) as TranslateResponse
}

export async function fetchDiag(apiKey?: string): Promise<{
  ok: boolean
  stage?: string
  detail?: string
  model?: string
  sample?: string
}> {
  const res = await fetch(`${API_BASE}/diag`, {
    headers: authHeaders(apiKey),
  })
  return res.json()
}
