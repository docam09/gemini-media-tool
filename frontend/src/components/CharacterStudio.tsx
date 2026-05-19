import { useEffect, useState } from 'react'
import { Loader2, Sparkles, Trash2, UserCircle2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { Character, GenerateCharacterResponse } from '@/lib/types'

import { CopyButton } from './CopyButton'
import { PromptBlock } from './PromptBlock'

interface CharacterStudioProps {
  projectId: number
  characters: Character[]
  onChanged: () => void
  selectedCharacter: Character | null
  onSelect: (character: Character | null) => void
}

const EXAMPLE_DESC =
  'Nữ KOL Việt 25 tuổi, da trắng hồng, tóc dài đen xoăn nhẹ, gương mặt baby face, mũi cao thanh, mắt to long lanh, mặc áo phông trắng + jeans, vibe Hàn Quốc trong trẻo, cười tự nhiên.'

export function CharacterStudio({
  projectId,
  characters,
  onChanged,
  selectedCharacter,
  onSelect,
}: CharacterStudioProps) {
  const [description, setDescription] = useState('')
  const [name, setName] = useState('')
  const [targetAudience, setTargetAudience] = useState('')
  const [style, setStyle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [preview, setPreview] = useState<GenerateCharacterResponse | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPreview(null)
  }, [projectId])

  const handleGenerate = async () => {
    if (!description.trim()) {
      toast.error('Cần mô tả nhân vật')
      return
    }
    setGenerating(true)
    setPreview(null)
    try {
      const res = await api.generateCharacter({
        project_id: projectId,
        description: description.trim(),
        target_audience: targetAudience.trim(),
        style: style.trim(),
        character_name: name.trim() || undefined,
      })
      setPreview(res)
      toast.success('Đã sinh Character Spec')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleSave = async () => {
    if (!preview) return
    setSaving(true)
    try {
      const character = await api.createCharacter({
        project_id: projectId,
        name: name.trim() || preview.name,
        short_description: preview.short_description,
        spec_json: preview.spec_json,
        consistency_anchor: preview.consistency_anchor,
        base_image_prompt: preview.base_image_prompt,
      })
      toast.success(`Đã lưu nhân vật "${character.name}"`)
      setPreview(null)
      setDescription('')
      setName('')
      setTargetAudience('')
      setStyle('')
      onSelect(character)
      onChanged()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (character: Character) => {
    if (!window.confirm(`Xoá nhân vật "${character.name}"?`)) return
    try {
      await api.deleteCharacter(character.id)
      if (selectedCharacter?.id === character.id) {
        onSelect(null)
      }
      onChanged()
      toast.success('Đã xoá')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <div className="grid h-full gap-4 overflow-hidden lg:grid-cols-[1fr_1fr]">
      <ScrollArea className="h-full">
        <div className="space-y-4 p-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-violet-500" />
                Tạo nhân vật mới
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="char-name">Tên nhân vật (tuỳ chọn)</Label>
                <Input
                  id="char-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Vd: Camella, Anna 25, KOL Hà Nội..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="char-desc">Mô tả ngắn (càng chi tiết càng đồng nhất) *</Label>
                <Textarea
                  id="char-desc"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={EXAMPLE_DESC}
                />
                <p className="text-xs text-muted-foreground">
                  Nên ghi: tuổi, giới tính, da, tóc, mắt, dáng, vibe, trang phục mặc định, dấu nhận
                  biết. AI sẽ tự bổ sung phần còn thiếu.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="char-target">Đối tượng quảng cáo</Label>
                  <Input
                    id="char-target"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Vd: nữ 22-35, Shopee, làm đẹp"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="char-style">Phong cách video</Label>
                  <Input
                    id="char-style"
                    value={style}
                    onChange={(e) => setStyle(e.target.value)}
                    placeholder="Vd: lifestyle Hàn, cinematic, vlog tự nhiên"
                  />
                </div>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || !description.trim()}
                className="w-full"
              >
                {generating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                {generating ? 'Đang sinh Character Spec...' : 'Sinh Character Spec'}
              </Button>
            </CardContent>
          </Card>

          {preview ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Preview: {preview.name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{preview.short_description}</p>
                <PromptBlock
                  title="Consistency Anchor"
                  description="Dán vào ĐẦU mọi prompt sau này để giữ nhân vật đồng nhất."
                  value={preview.consistency_anchor}
                  rows={4}
                />
                <PromptBlock
                  title="Base Image Prompt (text-to-image)"
                  description="Prompt tạo ảnh chân dung tham chiếu, dùng cho Imagen / Midjourney / Nano Banana."
                  value={preview.base_image_prompt}
                  rows={6}
                />
                <div className="rounded-md border bg-muted/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="text-sm font-semibold">Character Spec (JSON)</div>
                    <CopyButton
                      value={JSON.stringify(preview.spec_json, null, 2)}
                      label="Copy JSON"
                    />
                  </div>
                  <pre className="max-h-60 overflow-auto rounded bg-background p-2 text-xs">
                    {JSON.stringify(preview.spec_json, null, 2)}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Lưu vào project
                  </Button>
                  <Button variant="ghost" onClick={() => setPreview(null)}>
                    Bỏ
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </ScrollArea>

      <ScrollArea className="h-full border-l">
        <div className="space-y-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Nhân vật đã lưu ({characters.length})</h3>
          </div>
          {characters.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
              Chưa có nhân vật. Hãy sinh và lưu một nhân vật để dùng cho mọi video tiếp theo.
            </div>
          ) : null}
          {characters.map((c) => {
            const isActive = selectedCharacter?.id === c.id
            return (
              <Card
                key={c.id}
                className={isActive ? 'border-violet-400 ring-2 ring-violet-200' : undefined}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                  <button
                    type="button"
                    onClick={() => onSelect(isActive ? null : c)}
                    className="flex flex-1 items-start gap-2 text-left"
                  >
                    <UserCircle2 className="mt-0.5 h-5 w-5 text-violet-500" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{c.name}</div>
                      <div className="line-clamp-2 text-xs text-muted-foreground">
                        {c.short_description || '—'}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(c)}
                    aria-label="Xoá"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isActive ? 'default' : 'outline'}
                      onClick={() => onSelect(isActive ? null : c)}
                    >
                      {isActive ? 'Đang chọn' : 'Chọn cho storyboard'}
                    </Button>
                    <CopyButton value={c.consistency_anchor} label="Copy Anchor" />
                    <CopyButton value={c.base_image_prompt} label="Copy Image Prompt" />
                  </div>
                  {isActive ? (
                    <>
                      <Separator />
                      <PromptBlock
                        title="Consistency Anchor"
                        value={c.consistency_anchor}
                        rows={3}
                      />
                      <PromptBlock
                        title="Base Image Prompt"
                        value={c.base_image_prompt}
                        rows={5}
                      />
                    </>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
