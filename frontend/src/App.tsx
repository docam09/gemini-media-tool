import { useCallback, useEffect, useState } from 'react'
import { MessageSquare, ShoppingBag, Sparkles, UserCircle2, Video } from 'lucide-react'
import { Toaster } from 'sonner'

import { AffiliatePanel } from '@/components/AffiliatePanel'
import { CharacterStudio } from '@/components/CharacterStudio'
import { ChatPanel } from '@/components/ChatPanel'
import { Header } from '@/components/Header'
import { Sidebar } from '@/components/Sidebar'
import { StoryboardStudio } from '@/components/StoryboardStudio'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VideosPanel } from '@/components/VideosPanel'
import { api, getApiKey } from '@/lib/api'
import { getCurrentProjectId, setCurrentProjectId } from '@/lib/storage'
import type { Character, Product, Project, Video as VideoType } from '@/lib/types'

import './App.css'

type TabKey = 'chat' | 'characters' | 'storyboard' | 'videos' | 'affiliate'

function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null)
  const [characters, setCharacters] = useState<Character[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [videos, setVideos] = useState<VideoType[]>([])
  const [selectedCharacter, setSelectedCharacter] = useState<Character | null>(null)
  const [tab, setTab] = useState<TabKey>('chat')
  const [hasApiKey, setHasApiKey] = useState<boolean>(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshApiKeyFlag = useCallback(() => {
    setHasApiKey(Boolean(getApiKey()))
  }, [])

  useEffect(() => {
    refreshApiKeyFlag()
  }, [refreshApiKeyFlag])

  const loadProjects = useCallback(async () => {
    try {
      const list = await api.listProjects()
      setProjects(list)
      setLoadError(null)
      return list
    } catch (err) {
      setLoadError((err as Error).message)
      return []
    }
  }, [])

  const loadProjectChildren = useCallback(async (projectId: number) => {
    try {
      const [chars, prods, vids] = await Promise.all([
        api.listCharacters(projectId),
        api.listProducts(projectId),
        api.listVideos(projectId),
      ])
      setCharacters(chars)
      setProducts(prods)
      setVideos(vids)
    } catch (err) {
      setLoadError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const list = await loadProjects()
      const stored = getCurrentProjectId()
      let chosen: Project | null = null
      if (stored != null) {
        chosen = list.find((p) => p.id === stored) ?? null
      }
      if (!chosen && list.length > 0) {
        chosen = list[0]
      }
      if (chosen) {
        setActiveProjectId(chosen.id)
        setCurrentProjectId(chosen.id)
      }
    })()
  }, [loadProjects])

  useEffect(() => {
    if (activeProjectId == null) {
      setCharacters([])
      setProducts([])
      setVideos([])
      setSelectedCharacter(null)
      return
    }
    void loadProjectChildren(activeProjectId)
  }, [activeProjectId, loadProjectChildren])

  const handleSelectProject = (project: Project) => {
    setActiveProjectId(project.id)
    setCurrentProjectId(project.id)
    setSelectedCharacter(null)
  }

  const handleProjectCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev])
    setActiveProjectId(project.id)
    setCurrentProjectId(project.id)
    setSelectedCharacter(null)
  }

  const handleProjectDeleted = (projectId: number) => {
    setProjects((prev) => prev.filter((p) => p.id !== projectId))
    if (activeProjectId === projectId) {
      const next = projects.find((p) => p.id !== projectId) ?? null
      setActiveProjectId(next?.id ?? null)
      setCurrentProjectId(next?.id ?? null)
    }
  }

  const refreshChildren = () => {
    if (activeProjectId != null) void loadProjectChildren(activeProjectId)
  }

  const activeProject = projects.find((p) => p.id === activeProjectId) ?? null

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <Sidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelect={handleSelectProject}
        onCreated={handleProjectCreated}
        onDeleted={handleProjectDeleted}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          hasApiKey={hasApiKey}
          onApiKeyChange={refreshApiKeyFlag}
          projectName={activeProject?.name}
        />
        {loadError ? (
          <div className="border-b bg-destructive/10 px-6 py-2 text-xs text-destructive">
            Lỗi tải dữ liệu: {loadError}
          </div>
        ) : null}
        {!hasApiKey ? (
          <div className="border-b bg-amber-50 px-6 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            Chưa có Gemini API key. Bấm <strong>Cài đặt</strong> ở góc phải để nhập key (lấy miễn
            phí ở{' '}
            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              aistudio.google.com/apikey
            </a>
            ).
          </div>
        ) : null}
        {activeProjectId == null ? (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
            <div className="max-w-md space-y-3">
              <Sparkles className="mx-auto h-10 w-10 text-violet-500" />
              <h2 className="text-base font-semibold text-foreground">
                Tạo project đầu tiên ở thanh bên trái
              </h2>
              <p>
                Mỗi project là một chiến dịch quảng cáo: 1 nhân vật đồng nhất + nhiều sản phẩm +
                nhiều video 8s.
              </p>
            </div>
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as TabKey)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <TabsList className="mx-4 mt-3 grid w-fit grid-cols-5 gap-1">
              <TabsTrigger value="chat" className="gap-1">
                <MessageSquare className="h-3.5 w-3.5" />
                Chat
              </TabsTrigger>
              <TabsTrigger value="characters" className="gap-1">
                <UserCircle2 className="h-3.5 w-3.5" />
                Nhân vật
                {characters.length > 0 ? (
                  <span className="ml-1 text-xs text-muted-foreground">{characters.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="storyboard" className="gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                Storyboard
              </TabsTrigger>
              <TabsTrigger value="videos" className="gap-1">
                <Video className="h-3.5 w-3.5" />
                Video
                {videos.length > 0 ? (
                  <span className="ml-1 text-xs text-muted-foreground">{videos.length}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger value="affiliate" className="gap-1">
                <ShoppingBag className="h-3.5 w-3.5" />
                Affiliate
                {products.length > 0 ? (
                  <span className="ml-1 text-xs text-muted-foreground">{products.length}</span>
                ) : null}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="chat" className="min-h-0 flex-1">
              <ChatPanel projectId={activeProjectId} />
            </TabsContent>
            <TabsContent value="characters" className="min-h-0 flex-1">
              <CharacterStudio
                projectId={activeProjectId}
                characters={characters}
                onChanged={refreshChildren}
                selectedCharacter={selectedCharacter}
                onSelect={setSelectedCharacter}
              />
            </TabsContent>
            <TabsContent value="storyboard" className="min-h-0 flex-1">
              <StoryboardStudio
                projectId={activeProjectId}
                characters={characters}
                products={products}
                selectedCharacter={selectedCharacter}
                onCharacterPick={setSelectedCharacter}
                onVideoSaved={refreshChildren}
              />
            </TabsContent>
            <TabsContent value="videos" className="min-h-0 flex-1">
              <VideosPanel videos={videos} products={products} onChanged={refreshChildren} />
            </TabsContent>
            <TabsContent value="affiliate" className="min-h-0 flex-1">
              <AffiliatePanel
                projectId={activeProjectId}
                products={products}
                onChanged={refreshChildren}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
      <Toaster position="top-right" richColors />
    </div>
  )
}

export default App
