import { useEffect, useMemo, useState } from 'react'
import { Film, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { Character, Product, StoryboardPrompts } from '@/lib/types'

import { PromptBlock } from './PromptBlock'

interface StoryboardStudioProps {
  projectId: number
  characters: Character[]
  products: Product[]
  selectedCharacter: Character | null
  onCharacterPick: (character: Character | null) => void
  onVideoSaved: () => void
}

const DURATIONS = [4, 6, 8, 10, 12]

function StoryboardCard({
  storyboard,
  affiliateUrl,
}: {
  storyboard: StoryboardPrompts
  affiliateUrl?: string
}) {
  const ctaWithLink = useMemo(() => {
    if (!affiliateUrl) return storyboard.cta
    if (!storyboard.cta) return affiliateUrl
    if (storyboard.cta.includes('http')) return storyboard.cta
    return storyboard.cta.replace(/\[?link affiliate\]?/i, affiliateUrl) || `${storyboard.cta} ${affiliateUrl}`
  }, [storyboard.cta, affiliateUrl])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Film className="h-4 w-4 text-violet-500" />
          {storyboard.title || 'Storyboard'}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({storyboard.duration_seconds}s · 9:16)
          </span>
        </CardTitle>
        {storyboard.scene_idea ? (
          <p className="text-xs text-muted-foreground">{storyboard.scene_idea}</p>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        <PromptBlock
          title="1. Image Prompt (text-to-image)"
          description="Tạo ảnh nhân vật trong bối cảnh — chưa có sản phẩm."
          value={storyboard.image_prompt}
          rows={5}
        />
        <PromptBlock
          title="2. Product Image Prompt (image edit)"
          description="Chèn sản phẩm vào ảnh nhân vật. Dùng Gemini 2.5 Flash Image / Nano Banana / Flux Kontext."
          value={storyboard.product_image_prompt}
          rows={5}
        />
        <PromptBlock
          title={`3. Video Prompt (image-to-video, ${storyboard.duration_seconds}s)`}
          description="Cho Veo / Runway / Kling / Pika. Dán cùng ảnh tạo ở bước 2."
          value={storyboard.video_prompt}
          rows={6}
        />
        <PromptBlock
          title="Negative prompt"
          value={storyboard.negative_prompt}
          rows={2}
        />
        <PromptBlock
          title="Caption (tiếng Việt)"
          value={storyboard.caption}
          language="vi"
          rows={2}
        />
        <PromptBlock
          title="CTA Shopee Affiliate"
          description={affiliateUrl ? 'Đã gắn sẵn link affiliate.' : 'Chọn 1 sản phẩm có link để tự gắn.'}
          value={ctaWithLink}
          language="vi"
          rows={2}
        />
      </CardContent>
    </Card>
  )
}

export function StoryboardStudio({
  projectId,
  characters,
  products,
  selectedCharacter,
  onCharacterPick,
  onVideoSaved,
}: StoryboardStudioProps) {
  const [characterId, setCharacterId] = useState<number | null>(
    selectedCharacter?.id ?? characters[0]?.id ?? null,
  )
  const [productId, setProductId] = useState<number | null>(products[0]?.id ?? null)
  const [productName, setProductName] = useState('')
  const [productDescription, setProductDescription] = useState('')
  const [productImageDescription, setProductImageDescription] = useState('')
  const [sceneIdea, setSceneIdea] = useState('')
  const [audience, setAudience] = useState('')
  const [tone, setTone] = useState('')
  const [duration, setDuration] = useState(8)
  const [variantCount, setVariantCount] = useState(3)
  const [generating, setGenerating] = useState(false)
  const [generatingVariants, setGeneratingVariants] = useState(false)
  const [storyboard, setStoryboard] = useState<StoryboardPrompts | null>(null)
  const [variants, setVariants] = useState<StoryboardPrompts[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (selectedCharacter && selectedCharacter.id !== characterId) {
      setCharacterId(selectedCharacter.id)
    } else if (!selectedCharacter && characterId == null && characters[0]) {
      setCharacterId(characters[0].id)
    }
    if (selectedCharacter == null && characterId != null) {
      const found = characters.find((c) => c.id === characterId)
      if (!found) {
        setCharacterId(characters[0]?.id ?? null)
      }
    }
  }, [selectedCharacter, characters, characterId])

  useEffect(() => {
    if (productId != null) {
      const product = products.find((p) => p.id === productId)
      if (product) {
        if (!productName) setProductName(product.name)
        if (!productDescription) setProductDescription(product.description)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId])

  const currentProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId],
  )

  const affiliateUrl = currentProduct?.affiliate_url || currentProduct?.shopee_url || ''

  const canGenerate = characterId != null && productName.trim().length > 0

  const handleGenerate = async () => {
    if (!canGenerate || characterId == null) {
      toast.error('Chọn nhân vật và nhập tên sản phẩm')
      return
    }
    setGenerating(true)
    setStoryboard(null)
    try {
      const res = await api.generateStoryboard({
        project_id: projectId,
        character_id: characterId,
        product_name: productName.trim(),
        product_description: productDescription.trim(),
        product_image_description: productImageDescription.trim(),
        scene_idea: sceneIdea.trim(),
        target_audience: audience.trim(),
        tone: tone.trim(),
        duration_seconds: duration,
      })
      setStoryboard(res.storyboard)
      toast.success('Đã tạo storyboard')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateVariants = async () => {
    if (!canGenerate || characterId == null) {
      toast.error('Chọn nhân vật và nhập tên sản phẩm')
      return
    }
    setGeneratingVariants(true)
    setVariants([])
    try {
      const res = await api.generateVariants({
        project_id: projectId,
        character_id: characterId,
        product_name: productName.trim(),
        product_description: productDescription.trim(),
        product_image_description: productImageDescription.trim(),
        target_audience: audience.trim(),
        tone: tone.trim(),
        duration_seconds: duration,
        count: variantCount,
      })
      setVariants(res.variants)
      toast.success(`Đã tạo ${res.variants.length} biến thể`)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setGeneratingVariants(false)
    }
  }

  const handleSave = async (sb: StoryboardPrompts) => {
    setSaving(true)
    try {
      await api.createVideo({
        project_id: projectId,
        character_id: characterId ?? null,
        product_id: productId ?? null,
        title: sb.title,
        scene_idea: sb.scene_idea,
        image_prompt: sb.image_prompt,
        product_image_prompt: sb.product_image_prompt,
        video_prompt: sb.video_prompt,
        duration_seconds: sb.duration_seconds,
        negative_prompt: sb.negative_prompt,
        caption: sb.caption,
        cta: sb.cta,
      })
      onVideoSaved()
      toast.success('Đã lưu vào danh sách Video')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid h-full gap-4 overflow-hidden lg:grid-cols-[420px_1fr]">
      <ScrollArea className="h-full border-r">
        <div className="space-y-4 p-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Tham số storyboard</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nhân vật *</Label>
                <Select
                  value={characterId != null ? String(characterId) : ''}
                  onValueChange={(v) => {
                    const id = parseInt(v, 10)
                    setCharacterId(id)
                    const c = characters.find((x) => x.id === id) ?? null
                    onCharacterPick(c)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn nhân vật" />
                  </SelectTrigger>
                  <SelectContent>
                    {characters.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        Chưa có nhân vật. Sang tab "Nhân vật" để tạo.
                      </div>
                    ) : null}
                    {characters.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Sản phẩm (tuỳ chọn — để tự gắn link affiliate)</Label>
                <Select
                  value={productId != null ? String(productId) : 'none'}
                  onValueChange={(v) => setProductId(v === 'none' ? null : parseInt(v, 10))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Không chọn" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Không chọn —</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-name">Tên sản phẩm (sẽ xuất hiện trong prompt) *</Label>
                <Input
                  id="prod-name"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Vd: Serum Vitamin C The Ordinary 30ml"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-desc">Mô tả sản phẩm</Label>
                <Textarea
                  id="prod-desc"
                  rows={2}
                  value={productDescription}
                  onChange={(e) => setProductDescription(e.target.value)}
                  placeholder="Công dụng chính, USP, cảm giác khi dùng..."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prod-image">Mô tả ảnh sản phẩm (chai/lọ/box)</Label>
                <Textarea
                  id="prod-image"
                  rows={2}
                  value={productImageDescription}
                  onChange={(e) => setProductImageDescription(e.target.value)}
                  placeholder="Vd: chai thuỷ tinh nâu, nhãn trắng chữ đen, dung tích 30ml, có pipet."
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scene">Ý tưởng cảnh (tuỳ chọn)</Label>
                <Textarea
                  id="scene"
                  rows={2}
                  value={sceneIdea}
                  onChange={(e) => setSceneIdea(e.target.value)}
                  placeholder="Vd: Buổi sáng trong phòng tắm Hàn Quốc, nhân vật vừa thức dậy thoa serum lên má."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="audience">Đối tượng</Label>
                  <Input
                    id="audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                    placeholder="Nữ 22-35"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tone">Tone / Mood</Label>
                  <Input
                    id="tone"
                    value={tone}
                    onChange={(e) => setTone(e.target.value)}
                    placeholder="Trong trẻo, ASMR, cinematic..."
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Thời lượng video</Label>
                  <Select value={String(duration)} onValueChange={(v) => setDuration(parseInt(v, 10))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATIONS.map((d) => (
                        <SelectItem key={d} value={String(d)}>
                          {d} giây
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Số biến thể (cho nút Biến thể)</Label>
                  <Select
                    value={String(variantCount)}
                    onValueChange={(v) => setVariantCount(parseInt(v, 10))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 3, 4, 5, 6].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} biến thể
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                <Button
                  onClick={handleGenerate}
                  disabled={generating || !canGenerate}
                  className="flex-1"
                >
                  {generating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Tạo 1 storyboard
                </Button>
                <Button
                  onClick={handleGenerateVariants}
                  disabled={generatingVariants || !canGenerate}
                  variant="outline"
                  className="flex-1"
                >
                  {generatingVariants ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Wand2 className="mr-2 h-4 w-4" />
                  )}
                  Sinh {variantCount} biến thể
                </Button>
              </div>
              {!canGenerate ? (
                <p className="text-xs text-muted-foreground">
                  Cần chọn nhân vật và nhập tên sản phẩm để bật nút.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </ScrollArea>

      <ScrollArea className="h-full">
        <div className="space-y-4 p-4">
          {!storyboard && variants.length === 0 ? (
            <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
              Storyboard sẽ hiện ở đây. Mỗi storyboard có 3 prompt (image · image-edit · video 8s)
              + caption + CTA.
            </div>
          ) : null}

          {storyboard ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Kết quả</h3>
                <Button size="sm" onClick={() => handleSave(storyboard)} disabled={saving}>
                  Lưu vào Video
                </Button>
              </div>
              <StoryboardCard storyboard={storyboard} affiliateUrl={affiliateUrl} />
            </div>
          ) : null}

          {variants.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Biến thể ({variants.length})</h3>
              {variants.map((v, idx) => (
                <div key={idx} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium uppercase text-muted-foreground">
                      Variant #{idx + 1}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => handleSave(v)} disabled={saving}>
                      Lưu biến thể
                    </Button>
                  </div>
                  <StoryboardCard storyboard={v} affiliateUrl={affiliateUrl} />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </div>
  )
}
