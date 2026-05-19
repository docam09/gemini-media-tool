import { useEffect, useRef, useState } from 'react'
import { Loader2, Send, Sparkles, Trash2, User } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { ChatTurn } from '@/lib/types'
import { cn } from '@/lib/utils'

import { CopyButton } from './CopyButton'

interface ChatPanelProps {
  projectId: number | null
}

const STORAGE_PREFIX = 'pstudio.chat.'

function loadHistory(projectId: number | null): ChatTurn[] {
  if (typeof window === 'undefined') return []
  const key = STORAGE_PREFIX + (projectId ?? 'global')
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    return JSON.parse(raw) as ChatTurn[]
  } catch {
    return []
  }
}

function saveHistory(projectId: number | null, history: ChatTurn[]): void {
  if (typeof window === 'undefined') return
  const key = STORAGE_PREFIX + (projectId ?? 'global')
  window.localStorage.setItem(key, JSON.stringify(history.slice(-40)))
}

const QUICK_PROMPTS = [
  'Hướng dẫn cách giữ nhân vật đồng nhất khi tạo nhiều video Veo / Kling',
  'Viết prompt Veo 3 cho cảnh review son tint, 8s, 9:16, lifestyle Hàn Quốc',
  'Gợi ý 5 cảnh quay khác nhau cho cùng 1 sản phẩm máy massage cổ',
  'Viết caption + CTA Shopee cho video review serum cấp ẩm',
]

export function ChatPanel({ projectId }: ChatPanelProps) {
  const [history, setHistory] = useState<ChatTurn[]>(() => loadHistory(projectId))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setHistory(loadHistory(projectId))
  }, [projectId])

  useEffect(() => {
    saveHistory(projectId, history)
    requestAnimationFrame(() => {
      const el = scrollRef.current
      if (el) el.scrollTop = el.scrollHeight
    })
  }, [projectId, history])

  const send = async (message: string) => {
    const trimmed = message.trim()
    if (!trimmed || loading) return
    const next: ChatTurn[] = [...history, { role: 'user', content: trimmed }]
    setHistory(next)
    setInput('')
    setLoading(true)
    try {
      const res = await api.chat({
        project_id: projectId ?? undefined,
        history,
        message: trimmed,
      })
      setHistory([...next, { role: 'assistant', content: res.reply }])
    } catch (err) {
      setHistory([
        ...next,
        {
          role: 'assistant',
          content: `Lỗi: ${(err as Error).message}. Kiểm tra Gemini API key trong Cài đặt.`,
        },
      ])
      toast.error((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void send(input)
  }

  const handleClear = () => {
    setHistory([])
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <div className="text-sm font-semibold">Chat với Prompt Studio</div>
          <div className="text-xs text-muted-foreground">
            Hỏi tự do về cách viết prompt, nhân vật, kịch bản, model nào nên dùng...
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClear} disabled={history.length === 0}>
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Xoá chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div ref={scrollRef} className="space-y-4 px-4 py-4">
          {history.length === 0 ? (
            <div className="space-y-3 rounded-lg border bg-muted/40 p-4 text-sm">
              <div className="font-medium">Bắt đầu nhanh:</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {QUICK_PROMPTS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="rounded-md border bg-background p-3 text-left text-xs leading-relaxed transition-colors hover:bg-muted"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {history.map((turn, idx) => (
            <div
              key={idx}
              className={cn(
                'flex gap-3',
                turn.role === 'user' ? 'flex-row-reverse' : 'flex-row',
              )}
            >
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  turn.role === 'user'
                    ? 'bg-violet-500 text-white'
                    : 'bg-muted text-foreground',
                )}
              >
                {turn.role === 'user' ? (
                  <User className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </div>
              <div
                className={cn(
                  'max-w-[80%] space-y-2 rounded-lg px-3 py-2 text-sm leading-relaxed',
                  turn.role === 'user'
                    ? 'bg-violet-500 text-white'
                    : 'bg-muted text-foreground',
                )}
              >
                <div className="whitespace-pre-wrap break-words">{turn.content}</div>
                {turn.role === 'assistant' ? (
                  <div className="flex justify-end">
                    <CopyButton value={turn.content} label="Copy" variant="ghost" />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Đang nghĩ...
            </div>
          ) : null}
        </div>
      </ScrollArea>
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 border-t bg-background px-4 py-3"
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Nhập câu hỏi hoặc yêu cầu viết prompt..."
          rows={2}
          className="min-h-[44px] flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(input)
            }
          }}
        />
        <Button type="submit" disabled={loading || !input.trim()} className="gap-1">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Gửi
        </Button>
      </form>
    </div>
  )
}
