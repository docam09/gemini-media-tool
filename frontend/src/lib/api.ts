const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface GenerationResponse {
  id: string;
  status: string;
  message: string;
}

export interface ImageGeneration {
  id: string;
  prompt: string;
  model: string;
  num_images: number;
  aspect_ratio: string;
  status: string;
  cost: number;
  created_at: string;
  images: { id: string; url: string; file_size: number }[];
}

export interface VideoGeneration {
  id: string;
  prompt: string;
  model: string;
  aspect_ratio: string;
  status: string;
  duration_seconds: number | null;
  resolution: string | null;
  video_url: string | null;
  cost: number;
  created_at: string;
}

export interface GalleryItem {
  id: string;
  type: "image" | "video";
  prompt: string;
  model: string;
  thumbnail_url?: string;
  media_url?: string;
  status: string;
  created_at: string;
}

export interface PromptHistoryItem {
  id: string;
  prompt: string;
  type: string;
  model: string;
  created_at: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  cost_per_image?: number;
  cost_per_second?: number;
}

export interface ModelsResponse {
  image_models: ModelInfo[];
  video_models: ModelInfo[];
}

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Loi khong xac dinh" }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  health: () => fetchAPI<{ status: string; api_key_set: boolean }>("/api/health"),

  getModels: () => fetchAPI<ModelsResponse>("/api/v1/models"),

  generateImages: (data: {
    prompt: string;
    model?: string;
    num_images?: number;
    aspect_ratio?: string;
    style?: string;
  }) => fetchAPI<GenerationResponse>("/api/v1/images/generate", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  getImageGeneration: (id: string) =>
    fetchAPI<ImageGeneration>(`/api/v1/images/${id}`),

  generateVideo: (data: {
    prompt: string;
    model?: string;
    aspect_ratio?: string;
  }) => fetchAPI<GenerationResponse>("/api/v1/videos/generate", {
    method: "POST",
    body: JSON.stringify(data),
  }),

  getVideoGeneration: (id: string) =>
    fetchAPI<VideoGeneration>(`/api/v1/videos/${id}`),

  getGallery: (page?: number) =>
    fetchAPI<{ items: GalleryItem[]; page: number; per_page: number }>(
      `/api/v1/gallery?page=${page || 1}`
    ),

  getHistory: (limit?: number, type?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (type) params.set("type", type);
    return fetchAPI<{ items: PromptHistoryItem[] }>(
      `/api/v1/history?${params.toString()}`
    );
  },

  getMediaUrl: (path: string) => `${API_BASE}${path}`,

  getDownloadUrl: (type: "image" | "video", id: string) =>
    `${API_BASE}/api/v1/download/${type}/${id}`,
};
