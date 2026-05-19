import { useEffect, useState } from 'react'
import { Eye, EyeOff, KeyRound, Settings as SettingsIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { getApiKey, setApiKey } from '@/lib/api'

interface SettingsDialogProps {
  onSaved?: () => void
}

export function SettingsDialog({ onSaved }: SettingsDialogProps) {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [reveal, setReveal] = useState(false)

  useEffect(() => {
    if (open) {
      setKey(getApiKey())
      setReveal(false)
    }
  }, [open])

  const handleSave = () => {
    setApiKey(key.trim())
    toast.success('Đã lưu Gemini API key vào trình duyệt')
    onSaved?.()
    setOpen(false)
  }

  const handleClear = () => {
    setApiKey('')
    setKey('')
    toast.success('Đã xoá API key khỏi trình duyệt')
    onSaved?.()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <SettingsIcon className="h-4 w-4" />
          Cài đặt
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md border-slate-200 bg-white text-slate-950 shadow-2xl dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50">
        <DialogHeader>
          <DialogTitle>Cài đặt</DialogTitle>
          <DialogDescription className="text-slate-600 dark:text-slate-300">
            Prompt Studio dùng API của Google Gemini để viết prompt cho bạn. Key được lưu trong
            trình duyệt của bạn (localStorage) và chỉ gửi tới backend qua header{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-900 dark:bg-slate-800 dark:text-slate-100">X-Gemini-Api-Key</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="gemini-key" className="flex items-center gap-1 text-slate-900 dark:text-slate-100">
              <KeyRound className="h-3.5 w-3.5" /> Gemini API key
            </Label>
            <div className="flex gap-2">
              <Input
                id="gemini-key"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                type={reveal ? 'text' : 'password'}
                placeholder="AIza..."
                autoComplete="off"
                className="border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:placeholder:text-slate-500 dark:focus-visible:ring-slate-500"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setReveal((v) => !v)}
                className="text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50"
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Lấy key miễn phí ở{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                aistudio.google.com/apikey
              </a>
              . Free tier dùng model <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-900 dark:bg-slate-800 dark:text-slate-100">gemini-2.5-flash</code> đủ cho nhu cầu viết prompt.
            </p>
          </div>
          <Separator />
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Backend KHÔNG lưu key. Mỗi request frontend gửi kèm key trong header. Nếu bạn không nhập
            key ở đây mà backend có biến môi trường <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-900 dark:bg-slate-800 dark:text-slate-100">GEMINI_API_KEY</code> thì server sẽ dùng
            key của server.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleClear} disabled={!key} className="text-slate-600 hover:bg-slate-100 hover:text-slate-950 disabled:text-slate-400 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-50 dark:disabled:text-slate-600">
            Xoá key
          </Button>
          <Button onClick={handleSave} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200">Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
