from pydantic import BaseModel, Field
from typing import Optional


class ImageGenerateRequest(BaseModel):
    prompt: str
    model: str = "imagen-4.0-generate-001"
    num_images: int = Field(default=1, ge=1, le=4)
    aspect_ratio: str = "1:1"
    style: str = ""


class ImageEditRequest(BaseModel):
    prompt: str
    image_url: str
    model: str = "gemini-2.5-flash-preview-image-generation"


class VideoGenerateRequest(BaseModel):
    prompt: str
    model: str = "veo-3.1-generate-preview"
    aspect_ratio: str = "16:9"


class GenerationResponse(BaseModel):
    id: str
    status: str
    message: str = ""


class ImageGenerationResult(BaseModel):
    id: str
    prompt: str
    model: str
    num_images: int
    aspect_ratio: str
    status: str
    images: list[dict]
    cost: float
    created_at: str


class VideoGenerationResult(BaseModel):
    id: str
    prompt: str
    model: str
    aspect_ratio: str
    status: str
    duration_seconds: Optional[int] = None
    resolution: Optional[str] = None
    video_url: Optional[str] = None
    cost: float
    created_at: str


class PromptHistoryItem(BaseModel):
    id: str
    prompt: str
    type: str
    model: str
    created_at: str


class GalleryItem(BaseModel):
    id: str
    type: str
    prompt: str
    model: str
    thumbnail_url: Optional[str] = None
    media_url: Optional[str] = None
    status: str
    created_at: str
