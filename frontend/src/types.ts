export type LanguageCode = 'vi' | 'ko'

export type Style = 'casual' | 'formal'

export interface LanguageInfo {
  name: string
  bcp47: string
}

export interface TranslateResponse {
  translation: string
  source: LanguageCode
  target: LanguageCode
  romanization: string | null
  note: string | null
}

export interface HistoryEntry {
  id: string
  source: LanguageCode
  target: LanguageCode
  input: string
  output: string
  romanization: string | null
  note: string | null
  createdAt: number
}
