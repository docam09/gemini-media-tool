from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


# ---------- Projects ----------


class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class Project(BaseModel):
    id: int
    name: str
    description: str
    created_at: str


# ---------- Characters ----------


class CharacterCreate(BaseModel):
    project_id: int
    name: str
    short_description: str = ""
    spec_json: dict[str, Any] = Field(default_factory=dict)
    consistency_anchor: str = ""
    base_image_prompt: str = ""


class CharacterUpdate(BaseModel):
    name: str | None = None
    short_description: str | None = None
    spec_json: dict[str, Any] | None = None
    consistency_anchor: str | None = None
    base_image_prompt: str | None = None


class Character(BaseModel):
    id: int
    project_id: int
    name: str
    short_description: str
    spec_json: dict[str, Any]
    consistency_anchor: str
    base_image_prompt: str
    created_at: str


# ---------- Products ----------


class ProductCreate(BaseModel):
    project_id: int
    name: str
    description: str = ""
    shopee_url: str = ""
    affiliate_url: str = ""
    image_url: str = ""


class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    shopee_url: str | None = None
    affiliate_url: str | None = None
    image_url: str | None = None


class Product(BaseModel):
    id: int
    project_id: int
    name: str
    description: str
    shopee_url: str
    affiliate_url: str
    image_url: str
    created_at: str


# ---------- Videos ----------


class VideoCreate(BaseModel):
    project_id: int
    character_id: int | None = None
    product_id: int | None = None
    title: str = ""
    scene_idea: str = ""
    image_prompt: str = ""
    product_image_prompt: str = ""
    video_prompt: str = ""
    duration_seconds: int = 8
    negative_prompt: str = ""
    caption: str = ""
    cta: str = ""


class VideoUpdate(BaseModel):
    character_id: int | None = None
    product_id: int | None = None
    title: str | None = None
    scene_idea: str | None = None
    image_prompt: str | None = None
    product_image_prompt: str | None = None
    video_prompt: str | None = None
    duration_seconds: int | None = None
    negative_prompt: str | None = None
    caption: str | None = None
    cta: str | None = None


class Video(BaseModel):
    id: int
    project_id: int
    character_id: int | None
    product_id: int | None
    title: str
    scene_idea: str
    image_prompt: str
    product_image_prompt: str
    video_prompt: str
    duration_seconds: int
    negative_prompt: str
    caption: str
    cta: str
    created_at: str


# ---------- Chat ----------


class ChatTurn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    project_id: int | None = None
    history: list[ChatTurn] = Field(default_factory=list)
    message: str
    system_hint: str | None = None


class ChatResponse(BaseModel):
    reply: str


# ---------- AI Generation ----------


class GenerateCharacterRequest(BaseModel):
    project_id: int | None = None
    description: str
    target_audience: str = ""
    style: str = ""
    save: bool = False
    character_name: str | None = None


class GenerateCharacterResponse(BaseModel):
    name: str
    short_description: str
    spec_json: dict[str, Any]
    consistency_anchor: str
    base_image_prompt: str
    character_id: int | None = None


class GenerateStoryboardRequest(BaseModel):
    project_id: int | None = None
    character: GenerateCharacterResponse | None = None
    character_id: int | None = None
    product_name: str
    product_description: str = ""
    product_image_description: str = ""
    scene_idea: str = ""
    target_audience: str = ""
    tone: str = ""
    duration_seconds: int = 8
    save: bool = False


class StoryboardPrompts(BaseModel):
    title: str
    scene_idea: str
    image_prompt: str
    product_image_prompt: str
    video_prompt: str
    negative_prompt: str
    caption: str
    cta: str
    duration_seconds: int


class GenerateStoryboardResponse(BaseModel):
    storyboard: StoryboardPrompts
    video_id: int | None = None


class GenerateVariantsRequest(BaseModel):
    project_id: int | None = None
    character_id: int | None = None
    character: GenerateCharacterResponse | None = None
    product_name: str
    product_description: str = ""
    product_image_description: str = ""
    target_audience: str = ""
    tone: str = ""
    duration_seconds: int = 8
    count: int = 3


class GenerateVariantsResponse(BaseModel):
    variants: list[StoryboardPrompts]
