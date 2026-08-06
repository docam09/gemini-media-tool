import { useMemo, useState } from 'react'

import { PHRASE_GROUPS } from '../phrasebook'
import { romanize } from '../romanize'

interface Props {
  /** Speak a Korean phrase out loud. */
  onSpeak: (korean: string) => void
  /** Load a phrase into the translator as Vietnamese input. */
  onUse: (vietnamese: string, preset: string) => void
  synthesisSupported: boolean
}

/**
 * Offline phrasebook. Works with no network and no API key, which is the point:
 * it is the fallback when roaming dies at immigration or on the factory floor.
 */
export default function Phrasebook({ onSpeak, onUse, synthesisSupported }: Props) {
  const [activeGroup, setActiveGroup] = useState(PHRASE_GROUPS[0].id)
  const [query, setQuery] = useState('')

  const normalizedQuery = query.trim().toLowerCase()

  const visible = useMemo(() => {
    if (normalizedQuery) {
      return PHRASE_GROUPS.flatMap((group) =>
        group.phrases
          .filter(
            (phrase) =>
              phrase.vi.toLowerCase().includes(normalizedQuery) ||
              phrase.ko.includes(query.trim()) ||
              romanize(phrase.ko).toLowerCase().includes(normalizedQuery),
          )
          .map((phrase) => ({ ...phrase, groupId: group.id, preset: group.preset })),
      )
    }
    const group = PHRASE_GROUPS.find((g) => g.id === activeGroup) ?? PHRASE_GROUPS[0]
    return group.phrases.map((phrase) => ({
      ...phrase,
      groupId: group.id,
      preset: group.preset,
    }))
  }, [activeGroup, normalizedQuery, query])

  return (
    <section className="phrasebook">
      <input
        className="phrasebook__search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm câu (tiếng Việt, tiếng Hàn hoặc phiên âm)…"
      />

      {!normalizedQuery && (
        <div className="seg seg--wrap">
          {PHRASE_GROUPS.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`seg__btn ${activeGroup === group.id ? 'seg__btn--active' : ''}`}
              onClick={() => setActiveGroup(group.id)}
            >
              {group.label}
            </button>
          ))}
        </div>
      )}

      <ul className="phrasebook__list">
        {visible.map((phrase) => (
          <li key={`${phrase.groupId}-${phrase.ko}`} className="phrase">
            <div className="phrase__vi">{phrase.vi}</div>
            <div className="phrase__ko">{phrase.ko}</div>
            <div className="phrase__roman">{romanize(phrase.ko)}</div>
            <div className="phrase__actions">
              <button
                type="button"
                className="ghost ghost--sm"
                onClick={() => onSpeak(phrase.ko)}
                disabled={!synthesisSupported}
                title="Đọc câu tiếng Hàn"
              >
                🔊
              </button>
              <button
                type="button"
                className="ghost ghost--sm"
                onClick={() => onUse(phrase.vi, phrase.preset)}
                title="Mở trong trình dịch để sửa"
              >
                ✎
              </button>
            </div>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="phrasebook__empty">Không tìm thấy câu nào.</li>
        )}
      </ul>

      <p className="hint">
        Sổ tay này nằm sẵn trong ứng dụng — dùng được khi mất mạng hoặc hết dữ liệu roaming.
      </p>
    </section>
  )
}
