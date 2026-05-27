import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchHealth, fetchLanguages, fetchModels, translate } from './api'
import {
  cancelSpeech,
  isRecognitionSupported,
  isSynthesisSupported,
  listenOnce,
  speak,
} from './speech'
import type {
  HistoryEntry,
  LanguageCode,
  LanguageInfo,
  ModelInfo,
  Style,
} from './types'

type Direction = 'vi-to-ko' | 'ko-to-vi'

const DIRECTIONS: { value: Direction; source: LanguageCode; target: LanguageCode; label: string }[] =
  [
    { value: 'vi-to-ko', source: 'vi', target: 'ko', label: 'Tiếng Việt → 한국어' },
    { value: 'ko-to-vi', source: 'ko', target: 'vi', label: '한국어 → Tiếng Việt' },
  ]

const STYLES: { value: Style; label: string }[] = [
  { value: 'casual', label: 'Thân mật' },
  { value: 'formal', label: 'Lịch sự' },
]

const PLACEHOLDERS: Record<LanguageCode, string> = {
  vi: 'Gõ tiếng Việt ở đây... (vd. "Bạn đã ăn cơm chưa?")',
  ko: '여기에 한국어를 입력하세요... (예: "오늘 날씨 어때요?")',
}

const LS_KEYS = {
  context: 'vnkr.context',
  glossary: 'vnkr.glossary',
  model: 'vnkr.model',
  advancedOpen: 'vnkr.advancedOpen',
} as const

function loadString(key: string): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function saveString(key: string, value: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // localStorage may be unavailable (e.g. Safari private mode)
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function App() {
  const [languages, setLanguages] = useState<Record<LanguageCode, LanguageInfo> | null>(null)
  const [direction, setDirection] = useState<Direction>('vi-to-ko')
  const [style, setStyle] = useState<Style>('casual')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [romanization, setRomanization] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [backendStatus, setBackendStatus] = useState<{
    geminiConfigured: boolean
    model: string
  } | null>(null)
  const [models, setModels] = useState<Record<string, ModelInfo>>({})
  const [selectedModel, setSelectedModel] = useState<string>(() => loadString(LS_KEYS.model))
  const [context, setContext] = useState<string>(() => loadString(LS_KEYS.context))
  const [glossary, setGlossary] = useState<string>(() => loadString(LS_KEYS.glossary))
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    () => loadString(LS_KEYS.advancedOpen) === '1',
  )

  const recognizerRef = useRef<{ stop: () => void } | null>(null)
  const recognitionSupported = useMemo(isRecognitionSupported, [])
  const synthesisSupported = useMemo(isSynthesisSupported, [])

  const { source, target } = useMemo(() => {
    const entry = DIRECTIONS.find((d) => d.value === direction)!
    return { source: entry.source, target: entry.target }
  }, [direction])

  useEffect(() => {
    let cancelled = false
    fetchLanguages()
      .then((langs) => {
        if (!cancelled) setLanguages(langs)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      })
    fetchHealth()
      .then((h) => {
        if (!cancelled) {
          setBackendStatus({ geminiConfigured: h.gemini_configured, model: h.model })
        }
      })
      .catch(() => {
        // health check failure is surfaced separately via translate errors
      })
    fetchModels()
      .then((res) => {
        if (cancelled) return
        setModels(res.models)
        // If nothing saved yet or saved value no longer valid, fall back to
        // the backend's default so the seg control highlights a real option.
        setSelectedModel((current) => (current && res.models[current] ? current : res.default))
      })
      .catch(() => {
        // /models is optional; selectedModel stays as-is
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    saveString(LS_KEYS.context, context)
  }, [context])
  useEffect(() => {
    saveString(LS_KEYS.glossary, glossary)
  }, [glossary])
  useEffect(() => {
    if (selectedModel) saveString(LS_KEYS.model, selectedModel)
  }, [selectedModel])
  useEffect(() => {
    saveString(LS_KEYS.advancedOpen, advancedOpen ? '1' : '0')
  }, [advancedOpen])

  const runTranslate = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setBusy(true)
      setError(null)
      setOutput('')
      setRomanization(null)
      setNote(null)
      try {
        const res = await translate({
          text: trimmed,
          source,
          target,
          style,
          context: context || undefined,
          glossary: glossary || undefined,
          model: selectedModel || undefined,
        })
        setOutput(res.translation)
        setRomanization(res.romanization)
        setNote(res.note)
        setHistory((prev) =>
          [
            {
              id: newId(),
              source,
              target,
              input: trimmed,
              output: res.translation,
              romanization: res.romanization,
              note: res.note,
              createdAt: Date.now(),
            },
            ...prev,
          ].slice(0, 30),
        )
        if (autoSpeak && languages) {
          void speak(res.translation, languages[target].bcp47)
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setBusy(false)
      }
    },
    [autoSpeak, context, glossary, languages, selectedModel, source, style, target],
  )

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      void runTranslate(input)
    },
    [input, runTranslate],
  )

  const toggleListening = useCallback(() => {
    if (!recognitionSupported || !languages) return
    if (listening) {
      recognizerRef.current?.stop()
      // Don't null out the ref / state yet — wait for onend so any interim
      // text can still get translated as the final transcript.
      return
    }
    setError(null)
    setInterim('')
    setInput('')
    cancelSpeech()
    let gotAnything = false
    const handle = listenOnce(languages[source].bcp47, {
      onInterim: (t) => {
        if (t) gotAnything = true
        setInterim(t)
      },
      onFinal: (t) => {
        gotAnything = true
        setInput(t)
        setInterim('')
        void runTranslate(t)
      },
      onError: (msg) => {
        setError(msg)
        setListening(false)
        setInterim('')
        recognizerRef.current = null
      },
      onEnd: () => {
        setListening(false)
        setInterim('')
        recognizerRef.current = null
        if (!gotAnything) {
          setError(
            'Không bắt được giọng nói. Kiểm tra micro đang bật và Chrome đã được cấp quyền micro cho localhost.',
          )
        }
      },
    })
    if (handle) {
      recognizerRef.current = handle
      setListening(true)
    } else {
      setError('Không khởi động được nhận dạng giọng nói.')
    }
  }, [languages, listening, recognitionSupported, runTranslate, source])

  const swap = useCallback(() => {
    setDirection((d) => (d === 'vi-to-ko' ? 'ko-to-vi' : 'vi-to-ko'))
    setInput(output)
    setOutput('')
    setRomanization(null)
    setNote(null)
    setError(null)
  }, [output])

  const replaySource = useCallback(() => {
    if (!languages || !input.trim()) return
    void speak(input, languages[source].bcp47)
  }, [input, languages, source])

  const replayTarget = useCallback(() => {
    if (!languages || !output.trim()) return
    void speak(output, languages[target].bcp47)
  }, [languages, output, target])

  return (
    <main className="app">
      <header className="app__header">
        <h1>🗣️ Việt ↔ Hàn</h1>
        <p className="subtitle">Dịch hội thoại hằng ngày theo thời gian thực — chạy local</p>
      </header>

      {backendStatus && !backendStatus.geminiConfigured && (
        <div className="banner banner--warn">
          Backend chưa có <code>GEMINI_API_KEY</code>. Đặt biến môi trường rồi khởi động lại server.
        </div>
      )}

      <section className="controls">
        <div className="controls__row">
          <label className="field">
            <span>Hướng dịch</span>
            <div className="seg">
              {DIRECTIONS.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  className={`seg__btn ${direction === d.value ? 'seg__btn--active' : ''}`}
                  onClick={() => setDirection(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </label>
          <button type="button" className="swap" onClick={swap} aria-label="Đảo hướng dịch">
            ↕
          </button>
        </div>

        <div className="controls__row">
          <label className="field">
            <span>Phong cách</span>
            <div className="seg">
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className={`seg__btn ${style === s.value ? 'seg__btn--active' : ''}`}
                  onClick={() => setStyle(s.value)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={autoSpeak}
              onChange={(e) => setAutoSpeak(e.target.checked)}
              disabled={!synthesisSupported}
            />
            <span>Tự đọc kết quả</span>
          </label>
        </div>

        {Object.keys(models).length > 0 && (
          <div className="controls__row">
            <label className="field">
              <span>Model</span>
              <div className="seg">
                {Object.entries(models).map(([id, info]) => (
                  <button
                    key={id}
                    type="button"
                    className={`seg__btn ${selectedModel === id ? 'seg__btn--active' : ''}`}
                    onClick={() => setSelectedModel(id)}
                    title={info.description}
                  >
                    {info.label}
                  </button>
                ))}
              </div>
            </label>
            <button
              type="button"
              className="ghost ghost--sm"
              onClick={() => setAdvancedOpen((v) => !v)}
              aria-expanded={advancedOpen}
            >
              {advancedOpen ? '− Nâng cao' : '+ Nâng cao'}
            </button>
          </div>
        )}

        {advancedOpen && (
          <div className="advanced">
            <label className="field field--block">
              <span>Bối cảnh / lĩnh vực</span>
              <textarea
                className="advanced__input"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder='Vd. "Phòng kế toán tài chính tại công ty Hàn Quốc, trao đổi về báo cáo tài chính và kiểm toán nội bộ."'
                rows={2}
                maxLength={2000}
                spellCheck={false}
              />
              <small className="hint">
                Gemini sẽ ưu tiên dùng thuật ngữ phù hợp với bối cảnh này.
              </small>
            </label>
            <label className="field field--block">
              <span>Từ điển công ty (mỗi dòng 1 cặp)</span>
              <textarea
                className="advanced__input advanced__input--mono"
                value={glossary}
                onChange={(e) => setGlossary(e.target.value)}
                placeholder={
                  'công nợ = 매입채무\nkhấu hao = 감가상각\nhóa đơn GTGT = 부가가치세 세금계산서'
                }
                rows={4}
                maxLength={4000}
                spellCheck={false}
              />
              <small className="hint">
                Gemini sẽ cố gắng dùng đúng những cặp từ bạn quy định ở đây. Lưu tự động trong trình duyệt.
              </small>
            </label>
          </div>
        )}
      </section>

      <form className="pane" onSubmit={handleSubmit}>
        <div className="pane__head">
          <span className="pane__lang">{source === 'vi' ? 'Tiếng Việt' : '한국어'}</span>
          <div className="pane__actions">
            <button
              type="button"
              className={`mic ${listening ? 'mic--on' : ''}`}
              onClick={toggleListening}
              disabled={!recognitionSupported}
              title={
                recognitionSupported
                  ? 'Nhấn để nói'
                  : 'Trình duyệt không hỗ trợ nhận dạng giọng nói (dùng Chrome)'
              }
            >
              {listening ? '⏹ Dừng' : '🎤 Nói'}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={replaySource}
              disabled={!synthesisSupported || !input.trim()}
            >
              🔊 Đọc
            </button>
          </div>
        </div>
        <textarea
          className="pane__text"
          value={listening && interim ? interim : input}
          placeholder={PLACEHOLDERS[source]}
          onChange={(e) => setInput(e.target.value)}
          rows={4}
          spellCheck={false}
        />
        <div className="pane__footer">
          <span className="hint">
            {listening
              ? '⏺ Đang nghe... nói xong nhấn Dừng để dịch.'
              : 'Enter hoặc nhấn Dịch để gửi'}
          </span>
          <button type="submit" className="primary" disabled={busy || !input.trim()}>
            {busy ? 'Đang dịch...' : 'Dịch →'}
          </button>
        </div>
      </form>

      <section className="pane pane--out">
        <div className="pane__head">
          <span className="pane__lang">{target === 'vi' ? 'Tiếng Việt' : '한국어'}</span>
          <div className="pane__actions">
            <button
              type="button"
              className="ghost"
              onClick={replayTarget}
              disabled={!synthesisSupported || !output.trim()}
            >
              🔊 Đọc lại
            </button>
          </div>
        </div>
        <div className="pane__text pane__text--out" aria-live="polite">
          {output || <span className="placeholder">Kết quả dịch sẽ xuất hiện ở đây.</span>}
        </div>
        {romanization && (
          <div className="romanization" aria-label="Phiên âm">
            <em>{romanization}</em>
          </div>
        )}
        {note && <div className="note">💡 {note}</div>}
        {error && <div className="error">{error}</div>}
      </section>

      {history.length > 0 && (
        <section className="history">
          <div className="history__head">
            <h2>Lịch sử</h2>
            <button type="button" className="ghost" onClick={() => setHistory([])}>
              Xóa
            </button>
          </div>
          <ul>
            {history.map((h) => (
              <li key={h.id} className="history__item">
                <div className="history__row">
                  <span className="history__lang">{h.source === 'vi' ? 'VI' : 'KO'}</span>
                  <span className="history__text">{h.input}</span>
                </div>
                <div className="history__row history__row--out">
                  <span className="history__lang">{h.target === 'vi' ? 'VI' : 'KO'}</span>
                  <span className="history__text">{h.output}</span>
                  {languages && (
                    <button
                      type="button"
                      className="ghost ghost--sm"
                      onClick={() => void speak(h.output, languages[h.target].bcp47)}
                      disabled={!synthesisSupported}
                    >
                      🔊
                    </button>
                  )}
                </div>
                {h.romanization && <div className="history__roman">{h.romanization}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="footer">
        {backendStatus && (
          <span>
            Model: <code>{backendStatus.model}</code>
          </span>
        )}
        {!recognitionSupported && (
          <span className="footer__warn">
            Trình duyệt này không hỗ trợ nhận dạng giọng nói. Hãy dùng Chrome/Edge.
          </span>
        )}
      </footer>
    </main>
  )
}
