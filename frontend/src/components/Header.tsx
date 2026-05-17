import { Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import { SettingsDialog } from './SettingsDialog'

interface HeaderProps {
  hasApiKey: boolean
  onApiKeyChange: () => void
  projectName?: string
}

export function Header({ hasApiKey, onApiKeyChange, projectName }: HeaderProps) {
  return (
    <header className="flex items-center justify-between border-b bg-background px-6 py-3">
      <div className="flex items-center gap-3">
        <Sparkles className="h-5 w-5 text-violet-500" />
        <div>
          <div className="text-sm font-semibold leading-tight">Prompt Studio</div>
          <div className="text-xs text-muted-foreground">
            {projectName ? (
              <>Project: <span className="font-medium text-foreground">{projectName}</span></>
            ) : (
              'Viết prompt nhân vật đồng nhất + video 8s + affiliate Shopee'
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={hasApiKey ? 'default' : 'destructive'}>
          {hasApiKey ? 'Gemini key đã lưu' : 'Chưa có Gemini key'}
        </Badge>
        <SettingsDialog onSaved={onApiKeyChange} />
      </div>
    </header>
  )
}
