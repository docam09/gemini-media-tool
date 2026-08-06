import { describe, expect, it } from 'vitest'

import { hasHangul, romanize, romanizeKorean } from './romanize'

/**
 * Reference pairs from the Revised Romanization rules. The interesting ones are
 * the sound-change cases, since romanization follows pronunciation rather than
 * spelling.
 */
const CASES: [string, string][] = [
  // Plain syllables and liaison onto ㅇ.
  ['서울', 'seoul'],
  ['잠실', 'jamsil'],
  ['한국어', 'hangugeo'],
  ['읽어', 'ilgeo'],
  ['맛있어요', 'masisseoyo'],
  // Nasal assimilation.
  ['한국말', 'hangungmal'],
  ['입니다', 'imnida'],
  ['감사합니다', 'gamsahamnida'],
  ['백마', 'baengma'],
  // Lateralisation and ㄹ before a nasal coda.
  ['신라', 'silla'],
  ['종로', 'jongno'],
  ['불량률', 'bullyangnyul'],
  // ㅎ aspiration and elision.
  ['좋고', 'joko'],
  ['좋아', 'joa'],
  ['괜찮아요', 'gwaenchanayo'],
  ['괜찮습니다', 'gwaenchansseumnida'],
  // ㅅ tensing after a stop coda.
  ['있습니다', 'isseumnida'],
  ['알겠습니다', 'algesseumnida'],
  // Palatalisation before 이.
  ['같이', 'gachi'],
  ['꽃이', 'kkochi'],
  // No sound change available: bare coda.
  ['꽃', 'kkot'],
  ['학교', 'hakgyo'],
  // Domain vocabulary the app actually produces.
  ['광속', 'gwangsok'],
  ['측정 장비', 'cheukjeong jangbi'],
  ['계산해 주세요', 'gyesanhae juseyo'],
]

describe('romanize', () => {
  it.each(CASES)('romanizes %s as %s', (hangul, expected) => {
    expect(romanize(hangul)).toBe(expected)
  })

  it('passes non-Hangul characters through unchanged', () => {
    expect(romanize('LED 로트는 2.3%')).toBe('LED roteuneun 2.3%')
  })

  it('resets sound changes across a non-Hangul boundary', () => {
    expect(romanize('밥 먹었어요')).toBe('bap meogeosseoyo')
  })

  it('returns an empty string for empty input', () => {
    expect(romanize('')).toBe('')
  })
})

describe('hasHangul', () => {
  it('detects Hangul syllables', () => {
    expect(hasHangul('안녕')).toBe(true)
    expect(hasHangul('xin chào')).toBe(false)
  })
})

describe('romanizeKorean', () => {
  it('skips text with no Hangul', () => {
    expect(romanizeKorean('Rất vui được gặp anh')).toBeNull()
  })

  it('romanizes Korean text', () => {
    expect(romanizeKorean('안녕하세요')).toBe('annyeonghaseyo')
  })
})
