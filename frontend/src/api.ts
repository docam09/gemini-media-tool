import type {
  LanguageCode,
  LanguageInfo,
  ModelsResponse,
  Style,
  TranslateResponse,
} from './types'

const API_BASE = '/api'

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
  gemini_configured: boolean
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
}): Promise<TranslateResponse> {
  const res = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    // Clone the response so we can fall back to text() if the body isn't JSON.
    const cloned = res.clone()
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = `${detail} \u2014 ${body.detail}`
    } catch {
      try {
        const text = await cloned.text()
        if (text.trim()) detail = `${detail} \u2014 ${text.trim()}`
      } catch {
        // give up
      }
    }
    throw new Error(detail)
  }

  return (await res.json()) as TranslateResponse
}

export async function fetchDiag(): Promise<{
  ok: boolean
  stage?: string
  detail?: string
  model?: string
  sample?: string
}> {
  const res = await fetch(`${API_BASE}/diag`)
  return res.json()
}
