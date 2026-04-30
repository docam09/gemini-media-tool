import os
import uuid
import base64
import time
import asyncio
from datetime import datetime, timezone

from google import genai
from google.genai import types

from app.config import settings

MEDIA_DIR = settings.media_dir


def get_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


def _ensure_media_dirs():
    os.makedirs(os.path.join(MEDIA_DIR, "images"), exist_ok=True)
    os.makedirs(os.path.join(MEDIA_DIR, "videos"), exist_ok=True)


async def generate_images(
    prompt: str,
    model: str = "imagen-4.0-generate-001",
    num_images: int = 1,
    aspect_ratio: str = "1:1",
) -> list[dict]:
    _ensure_media_dirs()
    client = get_client()

    response = await asyncio.to_thread(
        client.models.generate_images,
        model=model,
        prompt=prompt,
        config=types.GenerateImagesConfig(
            number_of_images=num_images,
            aspect_ratio=aspect_ratio,
        ),
    )

    results = []
    for generated_image in response.generated_images:
        image_id = str(uuid.uuid4())
        filename = f"{image_id}.png"
        filepath = os.path.join(MEDIA_DIR, "images", filename)

        image_bytes = generated_image.image.image_bytes
        if isinstance(image_bytes, str):
            image_bytes = base64.b64decode(image_bytes)

        with open(filepath, "wb") as f:
            f.write(image_bytes)

        file_size = os.path.getsize(filepath)
        results.append({
            "id": image_id,
            "filename": filename,
            "file_size": file_size,
        })

    return results


async def generate_images_with_gemini(
    prompt: str,
    model: str = "gemini-2.5-flash-preview-image-generation",
) -> list[dict]:
    """Generate images using Gemini native image generation (Nano Banana)."""
    _ensure_media_dirs()
    client = get_client()

    response = await asyncio.to_thread(
        client.models.generate_content,
        model=model,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_modalities=["TEXT", "IMAGE"],
        ),
    )

    results = []
    for part in response.candidates[0].content.parts:
        if part.inline_data and part.inline_data.mime_type.startswith("image/"):
            image_id = str(uuid.uuid4())
            ext = part.inline_data.mime_type.split("/")[-1]
            if ext == "jpeg":
                ext = "jpg"
            filename = f"{image_id}.{ext}"
            filepath = os.path.join(MEDIA_DIR, "images", filename)

            image_bytes = part.inline_data.data
            if isinstance(image_bytes, str):
                image_bytes = base64.b64decode(image_bytes)

            with open(filepath, "wb") as f:
                f.write(image_bytes)

            file_size = os.path.getsize(filepath)
            results.append({
                "id": image_id,
                "filename": filename,
                "file_size": file_size,
            })

    return results


async def generate_video(
    prompt: str,
    model: str = "veo-3.1-generate-preview",
    aspect_ratio: str = "16:9",
) -> dict:
    _ensure_media_dirs()
    client = get_client()

    operation = await asyncio.to_thread(
        client.models.generate_videos,
        model=model,
        prompt=prompt,
        config=types.GenerateVideosConfig(
            aspect_ratio=aspect_ratio,
            person_generation="allow_all",
        ),
    )

    while not operation.done:
        await asyncio.sleep(10)
        operation = await asyncio.to_thread(
            client.operations.get, operation
        )

    generated_video = operation.response.generated_videos[0]
    video_id = str(uuid.uuid4())
    filename = f"{video_id}.mp4"
    filepath = os.path.join(MEDIA_DIR, "videos", filename)

    video_file = await asyncio.to_thread(
        client.files.download, file=generated_video.video
    )

    with open(filepath, "wb") as f:
        f.write(video_file)

    file_size = os.path.getsize(filepath)

    return {
        "id": video_id,
        "filename": filename,
        "file_size": file_size,
        "duration_seconds": 8,
        "resolution": "720p",
    }
