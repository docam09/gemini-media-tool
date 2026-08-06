/**
 * Revised Romanization of Hangul, computed locally.
 *
 * The backend used to ask Gemini for the romanization inside a JSON response.
 * That roughly doubled the output token count and pushed a one-sentence
 * translation from ~570ms to ~1.15s. Romanization is a deterministic function
 * of the Hangul, so we derive it in the browser instead: zero latency, zero
 * quota, and it works offline for the phrasebook.
 *
 * Romanization follows pronunciation, so syllable boundaries are resolved
 * before transliterating: liaison onto a following ㅇ, nasal assimilation
 * (한국말 → hangungmal), lateralisation (신라 → Silla) and ㅎ aspiration
 * (좋고 → joko).
 */

const SYLLABLE_START = 0xac00
const SYLLABLE_END = 0xd7a3
const MEDIAL_COUNT = 21
const FINAL_COUNT = 28

const INITIALS = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '',
  'j', 'jj', 'ch', 'k', 't', 'p', 'h',
] as const

const MEDIALS = [
  'a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae',
  'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i',
] as const

/** Final-consonant jamo names, index 0 meaning "no final". */
const FINAL_NAMES = [
  '', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls',
  'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't',
  'p', 'h',
] as const

type FinalName = (typeof FINAL_NAMES)[number]
type InitialName =
  | 'g' | 'kk' | 'n' | 'd' | 'tt' | 'r' | 'm' | 'b' | 'pp' | 's' | 'ss'
  | 'ieung' | 'j' | 'jj' | 'ch' | 'k' | 't' | 'p' | 'h'

const INITIAL_NAMES: InitialName[] = [
  'g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', 'ieung',
  'j', 'jj', 'ch', 'k', 't', 'p', 'h',
]

/** How each final is written when it stays in the coda position. */
const CODA: Record<FinalName, string> = {
  '': '', g: 'k', kk: 'k', gs: 'k', n: 'n', nj: 'n', nh: 'n', d: 't',
  l: 'l', lg: 'k', lm: 'm', lb: 'p', ls: 'l', lt: 'l', lp: 'p', lh: 'l',
  m: 'm', b: 'p', bs: 'p', s: 't', ss: 't', ng: 'ng', j: 't', ch: 't',
  k: 'k', t: 't', p: 'p', h: 't',
}

/**
 * Liaison: what stays in the coda and what moves to the next onset when the
 * following syllable starts with ㅇ. Compound finals split across the boundary
 * (읽어 → ilgeo).
 */
const LIAISON: Record<FinalName, { coda: string; onset: string }> = {
  '': { coda: '', onset: '' },
  g: { coda: '', onset: 'g' },
  kk: { coda: '', onset: 'kk' },
  gs: { coda: 'k', onset: 's' },
  n: { coda: '', onset: 'n' },
  nj: { coda: 'n', onset: 'j' },
  nh: { coda: 'n', onset: '' },
  d: { coda: '', onset: 'd' },
  l: { coda: '', onset: 'r' },
  lg: { coda: 'l', onset: 'g' },
  lm: { coda: 'l', onset: 'm' },
  lb: { coda: 'l', onset: 'b' },
  ls: { coda: 'l', onset: 's' },
  lt: { coda: 'l', onset: 't' },
  lp: { coda: 'l', onset: 'p' },
  lh: { coda: 'l', onset: '' },
  m: { coda: '', onset: 'm' },
  b: { coda: '', onset: 'b' },
  bs: { coda: 'p', onset: 's' },
  s: { coda: '', onset: 's' },
  ss: { coda: '', onset: 'ss' },
  ng: { coda: 'ng', onset: '' },
  j: { coda: '', onset: 'j' },
  ch: { coda: '', onset: 'ch' },
  k: { coda: '', onset: 'k' },
  t: { coda: '', onset: 't' },
  p: { coda: '', onset: 'p' },
  h: { coda: '', onset: '' },
}

/** Finals that assimilate to ㅇ / ㄴ / ㅁ before a nasal onset. */
const NASALISED_CODA: Partial<Record<FinalName, string>> = {
  g: 'ng', kk: 'ng', k: 'ng', gs: 'ng', lg: 'ng',
  d: 'n', s: 'n', ss: 'n', j: 'n', ch: 'n', t: 'n', h: 'n',
  b: 'm', p: 'm', bs: 'm', lp: 'm',
}

/** Onsets ㅎ turns into when it follows a stop, and vice versa. */
const ASPIRATED: Partial<Record<InitialName, string>> = {
  g: 'k', d: 't', j: 'ch', b: 'p',
}

/**
 * Finals that tense a following ㅅ, mapped to what is left in the coda:
 * the unreleased [t] stops disappear into the tensed onset, while the ㅎ
 * clusters keep their first consonant (괜찮습니다 → gwaenchansseumnida).
 */
const TENSES_S: Partial<Record<FinalName, string>> = {
  d: '', s: '', ss: '', j: '', ch: '', t: '', h: '', nh: 'n', lh: 'l',
}

interface Syllable {
  onset: InitialName
  vowel: string
  final: FinalName
}

function decompose(char: string): Syllable | null {
  const code = char.codePointAt(0)
  if (code === undefined || code < SYLLABLE_START || code > SYLLABLE_END) return null
  const offset = code - SYLLABLE_START
  const initialIndex = Math.floor(offset / (MEDIAL_COUNT * FINAL_COUNT))
  const medialIndex = Math.floor((offset % (MEDIAL_COUNT * FINAL_COUNT)) / FINAL_COUNT)
  const finalIndex = offset % FINAL_COUNT
  return {
    onset: INITIAL_NAMES[initialIndex],
    vowel: MEDIALS[medialIndex],
    final: FINAL_NAMES[finalIndex],
  }
}

function onsetSpelling(onset: InitialName): string {
  return onset === 'ieung' ? '' : INITIALS[INITIAL_NAMES.indexOf(onset)]
}

/** Resolve the coda / onset pair across a syllable boundary. */
function resolveBoundary(
  final: FinalName,
  next: Syllable,
): { coda: string; onset: string } {
  const nextOnset = next.onset

  if (nextOnset === 'ieung') {
    const liaison = LIAISON[final]
    // ㄷ/ㅌ + 이 palatalise (같이 → gachi, 굳이 → guji).
    if (next.vowel === 'i') {
      if (final === 'd') return { coda: '', onset: 'j' }
      if (final === 't') return { coda: '', onset: 'ch' }
    }
    return liaison
  }

  if (final === '') return { coda: '', onset: onsetSpelling(nextOnset) }

  if (final === 'h') {
    const aspirated = ASPIRATED[nextOnset]
    if (aspirated) return { coda: '', onset: aspirated }
    if (nextOnset === 'n') return { coda: 'n', onset: 'n' }
  }

  if (nextOnset === 'h') {
    if (final === 'g' || final === 'd' || final === 'b' || final === 'j') {
      return { coda: '', onset: ASPIRATED[final] as string }
    }
    if (final === 's' || final === 'ss' || final === 't') return { coda: '', onset: 't' }
  }

  // A stop coda tenses a following ㅅ, and the tensed onset absorbs it
  // (있습니다 → isseumnida rather than a literal itseumnida).
  const tensedCoda = TENSES_S[final]
  if (nextOnset === 's' && tensedCoda !== undefined) {
    return { coda: tensedCoda, onset: 'ss' }
  }

  if (nextOnset === 'n' || nextOnset === 'm') {
    if (final === 'l') return { coda: 'l', onset: nextOnset === 'n' ? 'l' : 'm' }
    const nasal = NASALISED_CODA[final]
    if (nasal) return { coda: nasal, onset: onsetSpelling(nextOnset) }
  }

  if (nextOnset === 'r') {
    if (final === 'n' || final === 'l' || final === 'lh') return { coda: 'l', onset: 'l' }
    if (final === 'm' || final === 'ng') return { coda: CODA[final], onset: 'n' }
    const nasal = NASALISED_CODA[final]
    if (nasal) return { coda: nasal, onset: 'n' }
  }

  return { coda: CODA[final], onset: onsetSpelling(nextOnset) }
}

/**
 * Romanize a mixed string. Non-Hangul characters (Latin, digits, punctuation)
 * pass through unchanged, so "LED 로트" becomes "LED roteu".
 */
export function romanize(text: string): string {
  if (!text) return ''
  const chars = Array.from(text)
  const out: string[] = []
  // The onset of syllable N+1 is decided while resolving the boundary after
  // syllable N, so it is carried forward one step.
  let carriedOnset: string | null = null

  for (let i = 0; i < chars.length; i += 1) {
    const syllable = decompose(chars[i])
    if (!syllable) {
      out.push(chars[i])
      carriedOnset = null
      continue
    }

    const nextSyllable = i + 1 < chars.length ? decompose(chars[i + 1]) : null
    const boundary = nextSyllable
      ? resolveBoundary(syllable.final, nextSyllable)
      : { coda: CODA[syllable.final], onset: null }

    const onset = carriedOnset ?? onsetSpelling(syllable.onset)
    out.push(onset + syllable.vowel + boundary.coda)
    carriedOnset = boundary.onset
  }

  return out.join('')
}

export function hasHangul(text: string): boolean {
  return /[\uac00-\ud7a3]/.test(text)
}

/** Romanization only when it helps — i.e. when the text actually is Korean. */
export function romanizeKorean(text: string): string | null {
  if (!hasHangul(text)) return null
  const result = romanize(text).trim()
  return result || null
}
