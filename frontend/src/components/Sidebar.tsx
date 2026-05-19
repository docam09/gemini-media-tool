import { useEffect, useState } from 'react'
import { FolderPlus, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import type { Project } from '@/lib/types'
import { cn } from '@/lib/utils'

interface SidebarProps {
  projects: Project[]
  activeProjectId: number | null
  onSelect: (project: Project) => void
  onCreated: (project: Project) => void
  onDeleted: (projectId: number) => void
}

export function Sidebar({
  projects,
  activeProjectId,
  onSelect,
  onCreated,
  onDeleted,
}: SidebarProps) {
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!creating) setNewName('')
  }, [creating])

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Cần tên project')
      return
    }
    setBusy(true)
    try {
      const project = await api.createProject({ name: newName.trim() })
      onCreated(project)
      setCreating(false)
      toast.success(`Đã tạo "${project.name}"`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (project: Project) => {
    if (!window.confirm(`Xoá project "${project.name}"? Mọi nhân vật/video của project sẽ mất.`)) {
      return
    }
    try {
      await api.deleteProject(project.id)
      onDeleted(project.id)
      toast.success('Đã xoá')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-background">
      <div className="flex items-center gap-2 px-4 py-4">
        <Sparkles className="h-5 w-5 text-violet-500" />
        <div>
          <div className="text-sm font-semibold leading-tight">Prompt Studio</div>
          <div className="text-xs text-muted-foreground">Affiliate video prompt chatbot</div>
        </div>
      </div>
      <Separator />
      <div className="flex items-center justify-between px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Projects
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setCreating((v) => !v)}
          aria-label="Tạo project"
        >
          <FolderPlus className="h-4 w-4" />
        </Button>
      </div>
      {creating ? (
        <div className="space-y-2 px-4 pb-3">
          <Input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Vd: Mỹ phẩm A - Camella"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') setCreating(false)
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={busy} className="flex-1">
              Tạo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Huỷ
            </Button>
          </div>
        </div>
      ) : null}
      <ScrollArea className="flex-1">
        <div className="space-y-1 px-2 pb-4">
          {projects.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Chưa có project. Bấm + để tạo.
            </div>
          ) : null}
          {projects.map((p) => {
            const active = p.id === activeProjectId
            return (
              <div
                key={p.id}
                className={cn(
                  'group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100'
                    : 'hover:bg-muted',
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(p)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={p.name}
                >
                  <div className="truncate font-medium">{p.name}</div>
                  {p.description ? (
                    <div className="truncate text-xs text-muted-foreground">{p.description}</div>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(p)}
                  aria-label="Xoá project"
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </aside>
  )
}
