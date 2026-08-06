import type { RealtimeToken } from '@soniox/client'
import { describe, expect, it } from 'vitest'

import { TurnAssembler } from './live'

function original(text: string, language: string, is_final = true): RealtimeToken {
  return { text, confidence: 1, is_final, language, translation_status: 'original' }
}

function translated(text: string, source_language: string, is_final = true): RealtimeToken {
  return {
    text,
    confidence: 1,
    is_final,
    source_language,
    translation_status: 'translation',
  }
}

describe('TurnAssembler', () => {
  it('keeps the spoken text and its translation apart', () => {
    const assembler = new TurnAssembler()
    assembler.push([original('Chào ', 'vi'), translated('안녕', 'vi')])
    assembler.push([original('anh.', 'vi'), translated('하세요.', 'vi')])

    expect(assembler.draft()).toEqual({
      sourceText: 'Chào anh.',
      targetText: '안녕하세요.',
      sourceLang: 'vi',
    })
  })

  it('emits a turn with the direction Soniox detected', () => {
    const assembler = new TurnAssembler()
    assembler.push([original('불량률은 ', 'ko'), original('몇 퍼센트입니까?', 'ko')])
    assembler.push([translated('Tỷ lệ lỗi là bao nhiêu phần trăm?', 'ko')])

    expect(assembler.flush()).toEqual({
      sourceLang: 'ko',
      targetLang: 'vi',
      sourceText: '불량률은 몇 퍼센트입니까?',
      targetText: 'Tỷ lệ lỗi là bao nhiêu phần trăm?',
    })
  })

  it("falls back to the translation's source language when originals lack one", () => {
    const assembler = new TurnAssembler()
    assembler.push([
      { text: 'Xin chào', confidence: 1, is_final: true, translation_status: 'original' },
      translated('안녕하세요', 'vi'),
    ])

    expect(assembler.flush()?.sourceLang).toBe('vi')
  })

  it('replaces non-final tokens instead of accumulating them', () => {
    const assembler = new TurnAssembler()
    assembler.push([original('Lô ', 'vi'), original('nà', 'vi', false)])
    assembler.push([original('này ', 'vi', false), original('bao nhiêu', 'vi', false)])

    expect(assembler.draft().sourceText).toBe('Lô này bao nhiêu')
  })

  it('reports whether a message finalised translation text', () => {
    const assembler = new TurnAssembler()
    expect(assembler.push([original('Xin chào', 'vi')])).toBe(false)
    expect(assembler.push([translated('안녕', 'vi', false)])).toBe(false)
    expect(assembler.push([translated('안녕하세요', 'vi')])).toBe(true)
  })

  it('swallows the empty turns Soniox reports for pauses in silence', () => {
    const assembler = new TurnAssembler()
    expect(assembler.flush()).toBeNull()

    // Speech recognised but no translation yet: not a usable turn either.
    assembler.push([original('Xin chào', 'vi')])
    expect(assembler.flush()).toBeNull()
  })

  it('starts clean after a turn so the next one is not glued to it', () => {
    const assembler = new TurnAssembler()
    assembler.push([original('Xin chào', 'vi'), translated('안녕하세요', 'vi')])
    assembler.flush()

    assembler.push([original('감사합니다', 'ko'), translated('Xin cảm ơn', 'ko')])
    expect(assembler.flush()).toEqual({
      sourceLang: 'ko',
      targetLang: 'vi',
      sourceText: '감사합니다',
      targetText: 'Xin cảm ơn',
    })
  })

  it('drops only the draft when a session restarts without a transcript reset', () => {
    const assembler = new TurnAssembler()
    assembler.push([original('Xin ', 'vi'), original('chào', 'vi', false)])
    assembler.dropDraft()

    expect(assembler.draft().sourceText).toBe('Xin')
  })

  it('clears everything on a transcript reset', () => {
    const assembler = new TurnAssembler()
    assembler.push([original('Xin chào', 'vi'), translated('안녕하세요', 'vi')])
    assembler.reset()

    expect(assembler.draft()).toEqual({ sourceText: '', targetText: '', sourceLang: null })
    expect(assembler.flush()).toBeNull()
  })

  it('ignores languages outside the configured pair', () => {
    const assembler = new TurnAssembler()
    assembler.push([original('Hello there', 'en'), translated('Xin chào', 'en')])

    expect(assembler.draft().sourceLang).toBeNull()
    expect(assembler.flush()).toBeNull()
  })
})
