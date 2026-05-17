import type {
  Character,
  ChatTurn,
  GenerateCharacterResponse,
  GenerateStoryboardResponse,
  GenerateVariantsResponse,
  Product,
  Project,
  Video,
} from './types'

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'
export const API_BASE = RAW_BASE.replace(/\/$/, '')

const API_KEY_STORAGE = 'pstudio.gemini_api_key'

export function getApiKey(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(API_KEY_STORAGE) ?? ''
}

export function setApiKey(key: string): void {
  if (typeof window === 'undefined') return
  if (key) {
    window.localStorage.setItem(API_KEY_STORAGE, key)
  } else {
    window.localStorage.removeItem(API_KEY_STORAGE)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  headers.set('Content-Type', 'application/json')
  const key = getApiKey()
  if (key) {
    headers.set('X-Gemini-Api-Key', key)
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const data = await res.json()
      if (typeof data?.detail === 'string') {
        detail = data.detail
      } else if (data?.detail) {
        detail = JSON.stringify(data.detail)
      }
    } catch {
      // ignore
    }
    throw new Error(detail)
  }
  if (res.status === 204) {
    return undefined as T
  }
  return (await res.json()) as T
}

export const api = {
  // Projects
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (data: { name: string; description?: string }) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify(data) }),
  updateProject: (id: number, data: { name?: string; description?: string }) =>
    request<Project>(`/api/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: number) =>
    request<{ deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  // Characters
  listCharacters: (projectId?: number) =>
    request<Character[]>(
      projectId ? `/api/characters?project_id=${projectId}` : '/api/characters',
    ),
  createCharacter: (data: {
    project_id: number
    name: string
    short_description?: string
    spec_json?: Record<string, unknown>
    consistency_anchor?: string
    base_image_prompt?: string
  }) => request<Character>('/api/characters', { method: 'POST', body: JSON.stringify(data) }),
  deleteCharacter: (id: number) =>
    request<{ deleted: boolean }>(`/api/characters/${id}`, { method: 'DELETE' }),

  // Products
  listProducts: (projectId?: number) =>
    request<Product[]>(
      projectId ? `/api/products?project_id=${projectId}` : '/api/products',
    ),
  createProduct: (data: {
    project_id: number
    name: string
    description?: string
    shopee_url?: string
    affiliate_url?: string
    image_url?: string
  }) => request<Product>('/api/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (
    id: number,
    data: {
      name?: string
      description?: string
      shopee_url?: string
      affiliate_url?: string
      image_url?: string
    },
  ) => request<Product>(`/api/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProduct: (id: number) =>
    request<{ deleted: boolean }>(`/api/products/${id}`, { method: 'DELETE' }),

  // Videos
  listVideos: (projectId?: number) =>
    request<Video[]>(projectId ? `/api/videos?project_id=${projectId}` : '/api/videos'),
  createVideo: (data: {
    project_id: number
    character_id?: number | null
    product_id?: number | null
    title?: string
    scene_idea?: string
    image_prompt?: string
    product_image_prompt?: string
    video_prompt?: string
    duration_seconds?: number
    negative_prompt?: string
    caption?: string
    cta?: string
  }) => request<Video>('/api/videos', { method: 'POST', body: JSON.stringify(data) }),
  deleteVideo: (id: number) =>
    request<{ deleted: boolean }>(`/api/videos/${id}`, { method: 'DELETE' }),

  // Chat
  chat: (data: {
    project_id?: number | null
    history: ChatTurn[]
    message: string
    system_hint?: string
  }) => request<{ reply: string }>('/api/chat', { method: 'POST', body: JSON.stringify(data) }),

  // AI Generation
  generateCharacter: (data: {
    project_id?: number | null
    description: string
    target_audience?: string
    style?: string
    save?: boolean
    character_name?: string
  }) =>
    request<GenerateCharacterResponse>('/api/generate/character', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  generateStoryboard: (data: {
    project_id?: number | null
    character_id?: number | null
    character?: GenerateCharacterResponse | null
    product_name: string
    product_description?: string
    product_image_description?: string
    scene_idea?: string
    target_audience?: string
    tone?: string
    duration_seconds?: number
    save?: boolean
  }) =>
    request<GenerateStoryboardResponse>('/api/generate/storyboard', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  generateVariants: (data: {
    project_id?: number | null
    character_id?: number | null
    character?: GenerateCharacterResponse | null
    product_name: string
    product_description?: string
    product_image_description?: string
    target_audience?: string
    tone?: string
    duration_seconds?: number
    count?: number
  }) =>
    request<GenerateVariantsResponse>('/api/generate/variants', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
