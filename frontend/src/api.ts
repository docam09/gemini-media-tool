import type { LanguageCode, LanguageInfo, Style, TranslateResponse } from './types'

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

export async function translate(params: {
  text: string
  source: LanguageCode
  target: LanguageCode
  style?: Style
}): Promise<TranslateResponse> {
  const res = await fetch(`${API_BASE}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: params.text,
      source: params.source,
      target: params.target,
      style: params.style ?? 'casual',
    }),
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: string }
      if (body.detail) detail = body.detail
    } catch {
      // ignore JSON parse errors and fall back to status code
    }
    throw new Error(detail)
  }

  return (await res.json()) as TranslateResponse
}
