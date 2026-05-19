export interface Project {
  id: number
  name: string
  description: string
  created_at: string
}

export interface CharacterSpec {
  [key: string]: string | undefined
}

export interface Character {
  id: number
  project_id: number
  name: string
  short_description: string
  spec_json: CharacterSpec
  consistency_anchor: string
  base_image_prompt: string
  created_at: string
}

export interface Product {
  id: number
  project_id: number
  name: string
  description: string
  shopee_url: string
  affiliate_url: string
  image_url: string
  created_at: string
}

export interface Video {
  id: number
  project_id: number
  character_id: number | null
  product_id: number | null
  title: string
  scene_idea: string
  image_prompt: string
  product_image_prompt: string
  video_prompt: string
  duration_seconds: number
  negative_prompt: string
  caption: string
  cta: string
  created_at: string
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  content: string
}

export interface GenerateCharacterResponse {
  name: string
  short_description: string
  spec_json: CharacterSpec
  consistency_anchor: string
  base_image_prompt: string
  character_id: number | null
}

export interface StoryboardPrompts {
  title: string
  scene_idea: string
  image_prompt: string
  product_image_prompt: string
  video_prompt: string
  negative_prompt: string
  caption: string
  cta: string
  duration_seconds: number
}

export interface GenerateStoryboardResponse {
  storyboard: StoryboardPrompts
  video_id: number | null
}

export interface GenerateVariantsResponse {
  variants: StoryboardPrompts[]
}
