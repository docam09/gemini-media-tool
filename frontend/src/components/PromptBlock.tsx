import { CopyButton } from './CopyButton'

interface PromptBlockProps {
  title: string
  description?: string
  value: string
  language?: 'text' | 'vi'
  rows?: number
}

export function PromptBlock({
  title,
  description,
  value,
  language = 'text',
  rows = 6,
}: PromptBlockProps) {
  if (!value) return null
  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {description ? (
            <div className="text-xs text-muted-foreground">{description}</div>
          ) : null}
        </div>
        <CopyButton value={value} label="Copy" />
      </div>
      <textarea
        readOnly
        value={value}
        rows={rows}
        className="w-full resize-y rounded-md border bg-background p-2 font-mono text-xs leading-relaxed"
        spellCheck={false}
        lang={language === 'vi' ? 'vi' : 'en'}
      />
    </div>
  )
}
