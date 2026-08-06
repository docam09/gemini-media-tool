import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  fetchHealth,
  fetchLanguages,
  fetchModels,
  fetchPresets,
  translateStream,
  verify,
} from './api'
import Phrasebook from './components/Phrasebook'
import { romanizeKorean } from './romanize'
import {
  cancelSpeech,
  isRecognitionSupported,
  isSynthesisSupported,
  listenOnce,
  speak,
  startConversation,
  warmUpSynthesis,
  type ConversationHandle,
} from './speech'
import type {
  HistoryEntry,
  LanguageCode,
  LanguageInfo,
  ModelInfo,
  PresetInfo,
  Style,
  Turn,
  VerifyResponse,
} from './types'

type Direction = 'vi-to-ko' | 'ko-to-vi'
type Tab = 'translate' | 'phrasebook'

const DIRECTIONS: {
  value: Direction
  source: LanguageCode
  target: LanguageCode
  label: string
}[] = [
  { value: 'vi-to-ko', source: 'vi', target: 'ko', label: 'Tiếng Việt → 한국어' },
  { value: 'ko-to-vi', source: 'ko', target: 'vi', label: '한국어 → Tiếng Việt' },
]

const STYLES: { value: Style; label: string }[] = [
  { value: 'casual', label: 'Thân mật' },
  { value: 'formal', label: 'Lịch sự' },
]

const PLACEHOLDERS: Record<LanguageCode, string> = {
  vi: 'Gõ tiếng Việt ở đây... (vd. "Tỷ lệ lỗi lô này là bao nhiêu?")',
  ko: '여기에 한국어를 입력하세요... (예: "납기는 언제 가능합니까?")',
}

/** How many previous turns of the same direction we send as context. */
const CONTEXT_TURNS = 4
const MAX_HISTORY = 50

/**
 * Back-translation always runs on the strongest model: a check is only worth
 * doing if it is more trustworthy than the translation it reviews.
 */
const VERIFY_MODEL = 'gemini-3.5-flash'

const LS_KEYS = {
  context: 'vnkr.context',
  glossary: 'vnkr.glossary',
  model: 'vnkr.model',
  advancedOpen: 'vnkr.advancedOpen',
  preset: 'vnkr.preset',
  style: 'vnkr.style',
  direction: 'vnkr.direction',
  autoSwap: 'vnkr.autoSwap',
  speechRate: 'vnkr.speechRate',
  history: 'vnkr.history',
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

function loadHistory(): HistoryEntry[] {
  const raw = loadString(LS_KEYS.history)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as HistoryEntry[]
    return Array.isArray(parsed) ? parsed.slice(0, MAX_HISTORY) : []
  } catch {
    return []
  }
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function App() {
  const [tab, setTab] = useState<Tab>('translate')
  const [languages, setLanguages] = useState<Record<LanguageCode, LanguageInfo> | null>(null)
  const [direction, setDirection] = useState<Direction>(
    () => (loadString(LS_KEYS.direction) as Direction) || 'vi-to-ko',
  )
  const [style, setStyle] = useState<Style>(
    () => (loadString(LS_KEYS.style) as Style) || 'formal',
  )
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [conversing, setConversing] = useState(false)
  const [interim, setInterim] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory)
  const [autoSpeak, setAutoSpeak] = useState(true)
  const [autoSwap, setAutoSwap] = useState(() => loadString(LS_KEYS.autoSwap) !== '0')
  const [speechRate, setSpeechRate] = useState(() => {
    const stored = Number.parseFloat(loadString(LS_KEYS.speechRate))
    return Number.isFinite(stored) && stored > 0 ? stored : 1
  })
  const [stats, setStats] = useState<{ latencyMs: number; cached: boolean } | null>(null)
  const [backendStatus, setBackendStatus] = useState<{
    geminiConfigured: boolean
    model: string
  } | null>(null)
  const [models, setModels] = useState<Record<string, ModelInfo>>({})
  const [selectedModel, setSelectedModel] = useState<string>(() => loadString(LS_KEYS.model))
  const [presets, setPresets] = useState<Record<string, PresetInfo>>({})
  const [presetKey, setPresetKey] = useState<string>(() => loadString(LS_KEYS.preset) || 'none')
  const [context, setContext] = useState<string>(() => loadString(LS_KEYS.context))
  const [glossary, setGlossary] = useState<string>(() => loadString(LS_KEYS.glossary))
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    () => loadString(LS_KEYS.advancedOpen) === '1',
  )
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null)

  const recognizerRef = useRef<{ stop: () => void } | null>(null)
  const conversationRef = useRef<ConversationHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const queueRef = useRef<string[]>([])
  const drainingRef = useRef(false)
  const recognitionSupported = useMemo(isRecognitionSupported, [])
  const synthesisSupported = useMemo(isSynthesisSupported, [])

  const { source, target } = useMemo(() => {
    const entry = DIRECTIONS.find((d) => d.value === direction) ?? DIRECTIONS[0]
    return { source: entry.source, target: entry.target }
  }, [direction])

  const romanization = useMemo(() => romanizeKorean(output), [output])

  // The speech callbacks and the translation queue outlive any single render, so
  // they read the current settings through a ref instead of a stale closure.
  const settingsRef = useRef({
    source,
    target,
    style,
    context,
    glossary,
    selectedModel,
    autoSpeak,
    autoSwap,
    speechRate,
    languages,
    history,
  })
  settingsRef.current = {
    source,
    target,
    style,
    context,
    glossary,
    selectedModel,
    autoSpeak,
    autoSwap,
    speechRate,
    languages,
    history,
  }

  useEffect(() => {
    let cancelled = false
    fetchLanguages()
      .then((langs) => {
        if (!cancelled) setLanguages(langs)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
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
        // If nothing saved yet or the saved value is no longer valid, fall back
        // to the backend default so the segmented control highlights a real one.
        setSelectedModel((current) => (current && res.models[current] ? current : res.default))
      })
      .catch(() => {
        // /models is optional; selectedModel stays as-is
      })
    fetchPresets()
      .then((res) => {
        if (!cancelled) setPresets(res.presets)
      })
      .catch(() => {
        // presets are optional; the manual context/glossary fields still work
      })
    return () => {
      cancelled = true
      abortRef.current?.abort()
      conversationRef.current?.stop()
    }
  }, [])

  useEffect(() => saveString(LS_KEYS.context, context), [context])
  useEffect(() => saveString(LS_KEYS.glossary, glossary), [glossary])
  useEffect(() => saveString(LS_KEYS.preset, presetKey), [presetKey])
  useEffect(() => saveString(LS_KEYS.style, style), [style])
  useEffect(() => saveString(LS_KEYS.direction, direction), [direction])
  useEffect(() => saveString(LS_KEYS.autoSwap, autoSwap ? '1' : '0'), [autoSwap])
  useEffect(() => saveString(LS_KEYS.speechRate, String(speechRate)), [speechRate])
  useEffect(() => {
    if (selectedModel) saveString(LS_KEYS.model, selectedModel)
  }, [selectedModel])
  useEffect(() => {
    saveString(LS_KEYS.advancedOpen, advancedOpen ? '1' : '0')
  }, [advancedOpen])
  useEffect(() => {
    saveString(LS_KEYS.history, JSON.stringify(history.slice(0, MAX_HISTORY)))
  }, [history])

  /** Recent turns in the current direction, oldest first. */
  const contextTurns = useCallback((from: LanguageCode, to: LanguageCode): Turn[] => {
    return settingsRef.current.history
      .filter((entry) => entry.source === from && entry.target === to)
      .slice(0, CONTEXT_TURNS)
      .reverse()
      .map((entry) => ({ source_text: entry.input, target_text: entry.output }))
  }, [])

  const flipDirection = useCallback(() => {
    setDirection((current) => {
      const next: Direction = current === 'vi-to-ko' ? 'ko-to-vi' : 'vi-to-ko'
      const entry = DIRECTIONS.find((d) => d.value === next)
      const langs = settingsRef.current.languages
      if (entry && langs) conversationRef.current?.setLang(langs[entry.source].bcp47)
      return next
    })
  }, [])

  const translateOne = useCallback(
    async (text: string): Promise<void> => {
      const trimmed = text.trim()
      if (!trimmed) return
      const settings = settingsRef.current

      // A new utterance supersedes whatever is still in flight.
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setBusy(true)
      setError(null)
      setOutput('')
      setNote(null)
      setStats(null)
      setVerifyResult(null)

      let finalText = ''
      try {
        await translateStream(
          {
            text: trimmed,
            source: settings.source,
            target: settings.target,
            style: settings.style,
            context: settings.context || undefined,
            glossary: settings.glossary || undefined,
            model: settings.selectedModel || undefined,
            history: contextTurns(settings.source, settings.target),
          },
          {
            onDelta: (delta) => setOutput((prev) => prev + delta),
            onDone: (done) => {
              finalText = done.translation
              // The streamed deltas can contain artefacts the backend strips
              // from the final text, so trust the `done` payload.
              setOutput(done.translation)
              setStats({ latencyMs: done.latency_ms, cached: done.cached })
            },
          },
          controller.signal,
        )
      } catch (err: unknown) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : String(err))
        setBusy(false)
        return
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setBusy(false)
      }

      if (!finalText) return

      setHistory((prev) =>
        [
          {
            id: newId(),
            source: settings.source,
            target: settings.target,
            input: trimmed,
            output: finalText,
            romanization: romanizeKorean(finalText),
            note: null,
            createdAt: Date.now(),
            latencyMs: null,
            cached: false,
          },
          ...prev,
        ].slice(0, MAX_HISTORY),
      )

      if (settings.autoSpeak && settings.languages) {
        // Hold the microphone shut while our own audio plays, otherwise
        // conversation mode transcribes the translation back as new input.
        conversationRef.current?.pause()
        await speak(finalText, settings.languages[settings.target].bcp47, {
          rate: settings.speechRate,
        })
        conversationRef.current?.resume()
      }

      if (conversationRef.current && settingsRef.current.autoSwap) {
        flipDirection()
      }
    },
    [contextTurns, flipDirection],
  )

  /**
   * Serialise translations. In conversation mode utterances can arrive while the
   * previous one is still being spoken; queueing keeps the transcript and the
   * audio in order instead of interleaving them.
   */
  const enqueue = useCallback(
    (text: string) => {
      queueRef.current.push(text)
      if (drainingRef.current) return
      drainingRef.current = true
      void (async () => {
        try {
          for (;;) {
            const next = queueRef.current.shift()
            if (next === undefined) break
            setInput(next)
            await translateOne(next)
          }
        } finally {
          drainingRef.current = false
        }
      })()
    },
    [translateOne],
  )

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault()
      enqueue(input)
    },
    [enqueue, input],
  )

  const stopEverything = useCallback(() => {
    conversationRef.current?.stop()
    conversationRef.current = null
    recognizerRef.current?.stop()
    recognizerRef.current = null
    abortRef.current?.abort()
    queueRef.current = []
    cancelSpeech()
    setConversing(false)
    setListening(false)
    setInterim('')
    setBusy(false)
  }, [])

  /** Push-to-talk: one utterance, translated when the user stops. */
  const toggleListening = useCallback(() => {
    if (!recognitionSupported || !languages) return
    if (listening) {
      recognizerRef.current?.stop()
      return
    }
    setError(null)
    setInterim('')
    setInput('')
    cancelSpeech()
    warmUpSynthesis()
    const handle = listenOnce(languages[source].bcp47, {
      onInterim: setInterim,
      onFinal: (text) => {
        setInterim('')
        enqueue(text)
      },
      onError: (message) => {
        setError(message)
        setListening(false)
        setInterim('')
        recognizerRef.current = null
      },
      onEnd: () => {
        setListening(false)
        setInterim('')
        recognizerRef.current = null
      },
    })
    if (handle) {
      recognizerRef.current = handle
      setListening(true)
    } else {
      setError('Không khởi động được nhận dạng giọng nói.')
    }
  }, [enqueue, languages, listening, recognitionSupported, source])

  /** Hands-free mode: open microphone, each finished utterance translated at once. */
  const toggleConversation = useCallback(() => {
    if (!recognitionSupported || !languages) return
    if (conversing) {
      stopEverything()
      return
    }
    setError(null)
    setInterim('')
    warmUpSynthesis()
    const handle = startConversation(languages[source].bcp47, {
      onInterim: setInterim,
      onSegment: (segment) => {
        setInterim('')
        enqueue(segment)
      },
      onError: setError,
      onEnd: () => {
        setConversing(false)
        setInterim('')
      },
    })
    if (handle) {
      conversationRef.current = handle
      setConversing(true)
    } else {
      setError('Không khởi động được chế độ hội thoại.')
    }
  }, [conversing, enqueue, languages, recognitionSupported, source, stopEverything])

  const applyPreset = useCallback(
    (key: string) => {
      setPresetKey(key)
      const preset = presets[key]
      if (!preset) return
      setContext(preset.context)
      setGlossary(preset.glossary)
    },
    [presets],
  )

  const swap = useCallback(() => {
    flipDirection()
    setInput(output)
    setOutput('')
    setNote(null)
    setStats(null)
    setVerifyResult(null)
    setError(null)
  }, [flipDirection, output])

  const runVerify = useCallback(async () => {
    if (!input.trim() || !output.trim()) return
    setVerifying(true)
    setVerifyResult(null)
    try {
      const result = await verify({
        text: input.trim(),
        translation: output.trim(),
        source,
        target,
        model: VERIFY_MODEL,
      })
      setVerifyResult(result)
      setNote(result.note)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setVerifying(false)
    }
  }, [input, output, source, target])

  const replay = useCallback(
    (text: string, lang: LanguageCode) => {
      if (!languages || !text.trim()) return
      void speak(text, languages[lang].bcp47, { rate: speechRate })
    },
    [languages, speechRate],
  )

  const usePhrase = useCallback(
    (vietnamese: string, preset: string) => {
      setTab('translate')
      setDirection('vi-to-ko')
      if (presets[preset]) applyPreset(preset)
      setInput(vietnamese)
      setOutput('')
    },
    [applyPreset, presets],
  )

  return (
    <main className="app">
      <header className="app__header">
        <h1>🗣️ Việt ↔ Hàn</h1>
        <p className="subtitle">Phiên dịch thời gian thực — công tác Hàn Quốc</p>
        <div className="seg seg--tabs">
          <button
            type="button"
            className={`seg__btn ${tab === 'translate' ? 'seg__btn--active' : ''}`}
            onClick={() => setTab('translate')}
          >
            Dịch
          </button>
          <button
            type="button"
            className={`seg__btn ${tab === 'phrasebook' ? 'seg__btn--active' : ''}`}
            onClick={() => setTab('phrasebook')}
          >
            Sổ tay (offline)
          </button>
        </div>
      </header>

      {backendStatus && !backendStatus.geminiConfigured && (
        <div className="banner banner--warn">
          Backend chưa có <code>GEMINI_API_KEY</code>. Đặt biến môi trường rồi khởi động lại
          server. Sổ tay offline vẫn dùng được.
        </div>
      )}

      {tab === 'phrasebook' ? (
        <Phrasebook
          onSpeak={(korean) => replay(korean, 'ko')}
          onUse={usePhrase}
          synthesisSupported={synthesisSupported}
        />
      ) : (
        <>
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

            {Object.keys(presets).length > 0 && (
              <label className="field field--block">
                <span>Bối cảnh</span>
                <div className="seg seg--wrap">
                  {Object.entries(presets).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      className={`seg__btn ${presetKey === key ? 'seg__btn--active' : ''}`}
                      onClick={() => applyPreset(key)}
                      title={preset.description}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </label>
            )}

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
                  onChange={(event) => setAutoSpeak(event.target.checked)}
                  disabled={!synthesisSupported}
                />
                <span>Tự đọc</span>
              </label>
            </div>

            {Object.keys(models).length > 0 && (
              <div className="controls__row">
                <label className="field">
                  <span>Tốc độ / độ chính xác</span>
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
                  onClick={() => setAdvancedOpen((value) => !value)}
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
                    onChange={(event) => setContext(event.target.value)}
                    placeholder='Vd. "Họp kỹ thuật về lỗi quang thông của lô LED tại nhà máy Ansan."'
                    rows={3}
                    maxLength={2000}
                    spellCheck={false}
                  />
                  <small className="hint">
                    Gemini sẽ ưu tiên thuật ngữ phù hợp với bối cảnh này.
                  </small>
                </label>
                <label className="field field--block">
                  <span>Từ điển riêng (mỗi dòng 1 cặp)</span>
                  <textarea
                    className="advanced__input advanced__input--mono"
                    value={glossary}
                    onChange={(event) => setGlossary(event.target.value)}
                    placeholder={'quang thông = 광속\ntỷ lệ lỗi = 불량률\nnăng suất = 수율'}
                    rows={5}
                    maxLength={4000}
                    spellCheck={false}
                  />
                  <small className="hint">
                    Bắt buộc dùng đúng những cặp từ này. Lưu tự động trong trình duyệt.
                  </small>
                </label>
                <label className="field field--block">
                  <span>Tốc độ đọc: {speechRate.toFixed(1)}×</span>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.1}
                    value={speechRate}
                    onChange={(event) => setSpeechRate(Number(event.target.value))}
                  />
                </label>
              </div>
            )}
          </section>

          <div className="hands-free">
            <button
              type="button"
              className={`hands-free__btn ${conversing ? 'hands-free__btn--on' : ''}`}
              onClick={toggleConversation}
              disabled={!recognitionSupported}
              title={
                recognitionSupported
                  ? 'Mic mở liên tục, dịch ngay sau mỗi câu'
                  : 'Trình duyệt không hỗ trợ nhận dạng giọng nói (dùng Chrome)'
              }
            >
              {conversing ? '⏹ Dừng hội thoại' : '♾️ Hội thoại rảnh tay'}
            </button>
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoSwap}
                onChange={(event) => setAutoSwap(event.target.checked)}
              />
              <span>Tự đổi chiều sau mỗi lượt</span>
            </label>
          </div>

          <form className="pane" onSubmit={handleSubmit}>
            <div className="pane__head">
              <span className="pane__lang">{source === 'vi' ? 'Tiếng Việt' : '한국어'}</span>
              <div className="pane__actions">
                <button
                  type="button"
                  className={`mic ${listening ? 'mic--on' : ''}`}
                  onClick={toggleListening}
                  disabled={!recognitionSupported || conversing}
                  title={
                    recognitionSupported
                      ? 'Nhấn để nói một câu'
                      : 'Trình duyệt không hỗ trợ nhận dạng giọng nói (dùng Chrome)'
                  }
                >
                  {listening ? '⏹ Dừng' : '🎤 Nói'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => replay(input, source)}
                  disabled={!synthesisSupported || !input.trim()}
                >
                  🔊
                </button>
              </div>
            </div>
            <textarea
              className="pane__text"
              value={interim || input}
              placeholder={PLACEHOLDERS[source]}
              onChange={(event) => setInput(event.target.value)}
              rows={3}
              spellCheck={false}
            />
            <div className="pane__footer">
              <span className="hint">
                {conversing
                  ? '⏺ Mic đang mở — cứ nói, mỗi câu sẽ được dịch ngay.'
                  : listening
                    ? '⏺ Đang nghe... nói xong nhấn Dừng.'
                    : 'Nhấn Dịch để gửi'}
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
                {stats && (
                  <span className="badge" title="Thời gian phản hồi">
                    {stats.cached ? 'đã lưu · 0ms' : `${stats.latencyMs}ms`}
                  </span>
                )}
                <button
                  type="button"
                  className="ghost"
                  onClick={runVerify}
                  disabled={verifying || busy || !output.trim()}
                  title="Dịch ngược lại bằng model mạnh nhất để kiểm tra nghĩa"
                >
                  {verifying ? '…' : '✓ Kiểm tra'}
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => replay(output, target)}
                  disabled={!synthesisSupported || !output.trim()}
                >
                  🔊
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
            {verifyResult && (
              <div className="verify">
                <strong>Dịch ngược:</strong> {verifyResult.back_translation}
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
                {history.map((entry) => (
                  <li key={entry.id} className="history__item">
                    <div className="history__row">
                      <span className="history__lang">
                        {entry.source === 'vi' ? 'VI' : 'KO'}
                      </span>
                      <span className="history__text">{entry.input}</span>
                    </div>
                    <div className="history__row history__row--out">
                      <span className="history__lang">
                        {entry.target === 'vi' ? 'VI' : 'KO'}
                      </span>
                      <span className="history__text">{entry.output}</span>
                      <button
                        type="button"
                        className="ghost ghost--sm"
                        onClick={() => replay(entry.output, entry.target)}
                        disabled={!synthesisSupported}
                      >
                        🔊
                      </button>
                    </div>
                    {entry.romanization && (
                      <div className="history__roman">{entry.romanization}</div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <footer className="footer">
        {backendStatus && (
          <span>
            Model: <code>{selectedModel || backendStatus.model}</code>
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
