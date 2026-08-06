export type LanguageCode = 'vi' | 'ko'

export type Style = 'casual' | 'formal'

export interface LanguageInfo {
  name: string
  bcp47: string
}

/** One previously translated utterance, sent back as conversational context. */
export interface Turn {
  source_text: string
  target_text: string
}

export interface TranslateResponse {
  translation: string
  source: LanguageCode
  target: LanguageCode
  note: string | null
  model: string
  cached: boolean
  latency_ms: number
}

export interface StreamDone {
  translation: string
  model: string
  cached: boolean
  first_delta_ms?: number
  latency_ms: number
}

export interface VerifyResponse {
  back_translation: string
  note: string | null
  model: string
  latency_ms: number
}

export interface ModelInfo {
  label: string
  description: string
}

export interface ModelsResponse {
  default: string
  models: Record<string, ModelInfo>
}

export interface PresetInfo {
  label: string
  description: string
  context: string
  glossary: string
}

export interface PresetsResponse {
  default: string
  presets: Record<string, PresetInfo>
}

export interface HistoryEntry {
  id: string
  source: LanguageCode
  target: LanguageCode
  input: string
  output: string
  /** Derived locally by `romanize`, so it is always present for Korean output. */
  romanization: string | null
  note: string | null
  createdAt: number
  latencyMs: number | null
  cached: boolean
}
