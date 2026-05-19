import { Film, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'
import type { Product, Video } from '@/lib/types'

import { CopyButton } from './CopyButton'
import { PromptBlock } from './PromptBlock'

interface VideosPanelProps {
  videos: Video[]
  products: Product[]
  onChanged: () => void
}

export function VideosPanel({ videos, products, onChanged }: VideosPanelProps) {
  const productById = new Map(products.map((p) => [p.id, p]))

  const handleDelete = async (video: Video) => {
    if (!window.confirm(`Xoá video "${video.title || 'không tên'}"?`)) return
    try {
      await api.deleteVideo(video.id)
      onChanged()
      toast.success('Đã xoá')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const exportAll = () => {
    const lines: string[] = []
    videos.forEach((v, i) => {
      const product = v.product_id ? productById.get(v.product_id) : null
      const aff = product?.affiliate_url || product?.shopee_url || ''
      lines.push(`============================================`)
      lines.push(`#${i + 1}. ${v.title || '(không tên)'} — ${v.duration_seconds}s`)
      lines.push(`Scene: ${v.scene_idea}`)
      lines.push(``)
      lines.push(`--- Image Prompt (text-to-image) ---`)
      lines.push(v.image_prompt)
      lines.push(``)
      lines.push(`--- Product Image Prompt (image-edit) ---`)
      lines.push(v.product_image_prompt)
      lines.push(``)
      lines.push(`--- Video Prompt (image-to-video, ${v.duration_seconds}s) ---`)
      lines.push(v.video_prompt)
      lines.push(``)
      if (v.negative_prompt) {
        lines.push(`--- Negative ---`)
        lines.push(v.negative_prompt)
        lines.push(``)
      }
      lines.push(`Caption: ${v.caption}`)
      lines.push(`CTA: ${v.cta}`)
      if (aff) lines.push(`Affiliate: ${aff}`)
      lines.push(``)
    })
    const text = lines.join('\n')
    void navigator.clipboard.writeText(text).then(
      () => toast.success('Đã copy toàn bộ storyboard'),
      () => toast.error('Không thể copy. Hãy dùng nút Copy từng phần.'),
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Video đã lưu ({videos.length})</h3>
          <Button size="sm" variant="outline" onClick={exportAll} disabled={videos.length === 0}>
            Copy tất cả
          </Button>
        </div>
        {videos.length === 0 ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            Chưa có video nào. Sang tab "Storyboard" để sinh và lưu.
          </div>
        ) : null}
        {videos.map((v) => {
          const product = v.product_id ? productById.get(v.product_id) : null
          const affiliate = product?.affiliate_url || product?.shopee_url || ''
          return (
            <Card key={v.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Film className="h-4 w-4 text-violet-500" />
                  {v.title || '(không tên)'}
                  <span className="text-xs font-normal text-muted-foreground">
                    {v.duration_seconds}s · 9:16
                  </span>
                </CardTitle>
                <button
                  type="button"
                  onClick={() => handleDelete(v)}
                  aria-label="Xoá"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </CardHeader>
              <CardContent className="space-y-3">
                {v.scene_idea ? (
                  <p className="text-xs text-muted-foreground">{v.scene_idea}</p>
                ) : null}
                {product ? (
                  <div className="rounded-md bg-muted/40 p-2 text-xs">
                    <div className="font-medium">Sản phẩm: {product.name}</div>
                    {affiliate ? (
                      <div className="flex items-center gap-2">
                        <span className="truncate text-muted-foreground">{affiliate}</span>
                        <CopyButton value={affiliate} label="Copy link" />
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <PromptBlock
                  title="1. Image Prompt"
                  value={v.image_prompt}
                  rows={4}
                />
                <PromptBlock
                  title="2. Product Image Prompt (image-edit)"
                  value={v.product_image_prompt}
                  rows={4}
                />
                <PromptBlock
                  title={`3. Video Prompt (${v.duration_seconds}s)`}
                  value={v.video_prompt}
                  rows={5}
                />
                {v.negative_prompt ? (
                  <PromptBlock
                    title="Negative prompt"
                    value={v.negative_prompt}
                    rows={2}
                  />
                ) : null}
                <Separator />
                <div className="grid gap-2 sm:grid-cols-2">
                  <PromptBlock title="Caption" value={v.caption} language="vi" rows={2} />
                  <PromptBlock title="CTA" value={v.cta} language="vi" rows={2} />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </ScrollArea>
  )
}
