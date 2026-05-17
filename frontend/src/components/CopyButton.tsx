import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CopyButtonProps {
  value: string
  label?: string
  size?: 'sm' | 'default' | 'lg' | 'icon'
  variant?: 'default' | 'outline' | 'secondary' | 'ghost'
  disabled?: boolean
  className?: string
}

export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
  variant = 'outline',
  disabled,
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('Đã copy vào clipboard')
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Không thể copy. Hãy chọn tay rồi Ctrl+C.')
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleCopy}
      disabled={disabled || !value}
      className={cn('gap-1', className)}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {size !== 'icon' ? <span>{label}</span> : null}
    </Button>
  )
}
