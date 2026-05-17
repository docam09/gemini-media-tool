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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cài đặt</DialogTitle>
          <DialogDescription>
            Prompt Studio dùng API của Google Gemini để viết prompt cho bạn. Key được lưu trong
            trình duyệt của bạn (localStorage) và chỉ gửi tới backend qua header{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">X-Gemini-Api-Key</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label htmlFor="gemini-key" className="flex items-center gap-1">
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
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setReveal((v) => !v)}
              >
                {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Lấy key miễn phí ở{' '}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                aistudio.google.com/apikey
              </a>
              . Free tier dùng model <code>gemini-2.5-flash</code> đủ cho nhu cầu viết prompt.
            </p>
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            Backend KHÔNG lưu key. Mỗi request frontend gửi kèm key trong header. Nếu bạn không nhập
            key ở đây mà backend có biến môi trường <code>GEMINI_API_KEY</code> thì server sẽ dùng
            key của server.
          </p>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleClear} disabled={!key}>
            Xoá key
          </Button>
          <Button onClick={handleSave}>Lưu</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
