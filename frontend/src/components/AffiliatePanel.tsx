import { useState } from 'react'
import { ExternalLink, Loader2, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/lib/api'
import type { Product } from '@/lib/types'

import { CopyButton } from './CopyButton'

interface AffiliatePanelProps {
  projectId: number
  products: Product[]
  onChanged: () => void
}

export function AffiliatePanel({ projectId, products, onChanged }: AffiliatePanelProps) {
  const [showForm, setShowForm] = useState(products.length === 0)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [shopeeUrl, setShopeeUrl] = useState('')
  const [affiliateUrl, setAffiliateUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [busy, setBusy] = useState(false)

  const resetForm = () => {
    setName('')
    setDescription('')
    setShopeeUrl('')
    setAffiliateUrl('')
    setImageUrl('')
  }

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error('Cần tên sản phẩm')
      return
    }
    setBusy(true)
    try {
      await api.createProduct({
        project_id: projectId,
        name: name.trim(),
        description: description.trim(),
        shopee_url: shopeeUrl.trim(),
        affiliate_url: affiliateUrl.trim(),
        image_url: imageUrl.trim(),
      })
      toast.success('Đã lưu sản phẩm')
      resetForm()
      setShowForm(false)
      onChanged()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const handleUpdate = async (
    product: Product,
    field: 'shopee_url' | 'affiliate_url',
    value: string,
  ) => {
    try {
      await api.updateProduct(product.id, { [field]: value })
      onChanged()
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Xoá sản phẩm "${product.name}"?`)) return
    try {
      await api.deleteProduct(product.id)
      onChanged()
      toast.success('Đã xoá')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Sản phẩm & link affiliate ({products.length})</h3>
            <p className="text-xs text-muted-foreground">
              Lưu link Shopee + affiliate để Storyboard tự gắn vào CTA.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm((v) => !v)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            {showForm ? 'Đóng' : 'Thêm sản phẩm'}
          </Button>
        </div>

        {showForm ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Thêm sản phẩm</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ap-name">Tên sản phẩm *</Label>
                  <Input
                    id="ap-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Vd: Serum Vitamin C The Ordinary 30ml"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ap-image">Ảnh sản phẩm (URL)</Label>
                  <Input
                    id="ap-image"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ap-desc">Mô tả ngắn</Label>
                <Textarea
                  id="ap-desc"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="USP, công dụng chính, cảm giác khi dùng..."
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ap-shopee">Shopee URL gốc</Label>
                  <Input
                    id="ap-shopee"
                    value={shopeeUrl}
                    onChange={(e) => setShopeeUrl(e.target.value)}
                    placeholder="https://shopee.vn/..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ap-aff">Affiliate URL (rút gọn)</Label>
                  <Input
                    id="ap-aff"
                    value={affiliateUrl}
                    onChange={(e) => setAffiliateUrl(e.target.value)}
                    placeholder="https://shope.ee/..."
                  />
                </div>
              </div>
              <Button onClick={handleAdd} disabled={busy} className="w-full">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Lưu sản phẩm
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {products.length === 0 && !showForm ? (
          <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
            Chưa có sản phẩm. Bấm "Thêm sản phẩm" để tạo.
          </div>
        ) : null}

        {products.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <ShoppingBag className="h-4 w-4 text-orange-500" />
                {p.name}
              </CardTitle>
              <button
                type="button"
                onClick={() => handleDelete(p)}
                aria-label="Xoá"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </CardHeader>
            <CardContent className="space-y-2">
              {p.description ? (
                <p className="text-xs text-muted-foreground">{p.description}</p>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs">Shopee URL</Label>
                <div className="flex gap-2">
                  <Input
                    defaultValue={p.shopee_url}
                    onBlur={(e) => {
                      if (e.target.value !== p.shopee_url) {
                        void handleUpdate(p, 'shopee_url', e.target.value)
                      }
                    }}
                    placeholder="https://shopee.vn/..."
                  />
                  {p.shopee_url ? (
                    <Button asChild variant="outline" size="icon">
                      <a href={p.shopee_url} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Affiliate URL (sẽ tự gắn vào CTA)</Label>
                <div className="flex gap-2">
                  <Input
                    defaultValue={p.affiliate_url}
                    onBlur={(e) => {
                      if (e.target.value !== p.affiliate_url) {
                        void handleUpdate(p, 'affiliate_url', e.target.value)
                      }
                    }}
                    placeholder="https://shope.ee/..."
                  />
                  {p.affiliate_url ? (
                    <CopyButton value={p.affiliate_url} label="Copy" />
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  )
}
