import os
import uuid
import traceback
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.config import settings
from app.database import init_db, get_db
from app.models import (
    ImageGenerateRequest,
    VideoGenerateRequest,
    GenerationResponse,
    ImageGenerationResult,
    VideoGenerationResult,
    PromptHistoryItem,
    GalleryItem,
)
from app import services


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    os.makedirs(os.path.join(settings.media_dir, "images"), exist_ok=True)
    os.makedirs(os.path.join(settings.media_dir, "videos"), exist_ok=True)
    yield


app = FastAPI(
    title="Gemini Media Tool",
    description="Tool tao hinh anh va video su dung Gemini API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(os.path.join(settings.media_dir, "images"), exist_ok=True)
os.makedirs(os.path.join(settings.media_dir, "videos"), exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "api_key_set": bool(settings.gemini_api_key)}


# ─── Image Generation ────────────────────────────────────────────────────────

@app.post("/api/v1/images/generate", response_model=GenerationResponse)
async def generate_images(req: ImageGenerateRequest, background_tasks: BackgroundTasks):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY chua duoc cau hinh")

    generation_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    db = await get_db()
    await db.execute(
        "INSERT INTO image_generations (id, prompt, model, num_images, aspect_ratio, style, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (generation_id, req.prompt, req.model, req.num_images, req.aspect_ratio, req.style, "processing", now),
    )
    await db.execute(
        "INSERT INTO prompt_history (id, prompt, type, model, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), req.prompt, "image", req.model, now),
    )
    await db.commit()
    await db.close()

    background_tasks.add_task(_process_image_generation, generation_id, req)

    return GenerationResponse(id=generation_id, status="processing", message="Dang tao hinh anh...")


async def _process_image_generation(generation_id: str, req: ImageGenerateRequest):
    db = await get_db()
    try:
        is_gemini_native = req.model.startswith("gemini-")
        if is_gemini_native:
            results = await services.generate_images_with_gemini(
                prompt=req.prompt,
                model=req.model,
            )
        else:
            results = await services.generate_images(
                prompt=req.prompt,
                model=req.model,
                num_images=req.num_images,
                aspect_ratio=req.aspect_ratio,
            )

        now = datetime.now(timezone.utc).isoformat()
        for img in results:
            await db.execute(
                "INSERT INTO generated_images (id, generation_id, filename, file_size, created_at) VALUES (?, ?, ?, ?, ?)",
                (img["id"], generation_id, img["filename"], img["file_size"], now),
            )

        cost = _calculate_image_cost(req.model, len(results))
        await db.execute(
            "UPDATE image_generations SET status = 'completed', cost = ? WHERE id = ?",
            (cost, generation_id),
        )
        await db.commit()
    except Exception as e:
        traceback.print_exc()
        await db.execute(
            "UPDATE image_generations SET status = 'failed' WHERE id = ?",
            (generation_id,),
        )
        await db.commit()
    finally:
        await db.close()


def _calculate_image_cost(model: str, num_images: int) -> float:
    costs = {
        "imagen-4.0-generate-001": 0.04,
        "imagen-4.0-fast-001": 0.02,
        "imagen-4.0-ultra-001": 0.06,
    }
    per_image = costs.get(model, 0.01)
    return per_image * num_images


# ─── Video Generation ─────────────────────────────────────────────────────────

@app.post("/api/v1/videos/generate", response_model=GenerationResponse)
async def generate_video(req: VideoGenerateRequest, background_tasks: BackgroundTasks):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY chua duoc cau hinh")

    video_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    db = await get_db()
    await db.execute(
        "INSERT INTO video_generations (id, prompt, model, aspect_ratio, status, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (video_id, req.prompt, req.model, req.aspect_ratio, "processing", now),
    )
    await db.execute(
        "INSERT INTO prompt_history (id, prompt, type, model, created_at) VALUES (?, ?, ?, ?, ?)",
        (str(uuid.uuid4()), req.prompt, "video", req.model, now),
    )
    await db.commit()
    await db.close()

    background_tasks.add_task(_process_video_generation, video_id, req)

    return GenerationResponse(id=video_id, status="processing", message="Dang tao video... (co the mat 1-3 phut)")


async def _process_video_generation(video_id: str, req: VideoGenerateRequest):
    db = await get_db()
    try:
        result = await services.generate_video(
            prompt=req.prompt,
            model=req.model,
            aspect_ratio=req.aspect_ratio,
        )

        cost = _calculate_video_cost(req.model, result.get("duration_seconds", 8))
        await db.execute(
            "UPDATE video_generations SET status = 'completed', filename = ?, duration_seconds = ?, resolution = ?, cost = ? WHERE id = ?",
            (result["filename"], result["duration_seconds"], result["resolution"], cost, video_id),
        )
        await db.commit()
    except Exception as e:
        traceback.print_exc()
        await db.execute(
            "UPDATE video_generations SET status = 'failed' WHERE id = ?",
            (video_id,),
        )
        await db.commit()
    finally:
        await db.close()


def _calculate_video_cost(model: str, duration: int) -> float:
    costs_per_sec = {
        "veo-3.1-generate-preview": 0.40,
        "veo-3.1-fast-preview": 0.15,
    }
    per_sec = costs_per_sec.get(model, 0.20)
    return per_sec * duration


# ─── Status Endpoints ─────────────────────────────────────────────────────────

@app.get("/api/v1/images/{generation_id}")
async def get_image_generation(generation_id: str):
    db = await get_db()
    row = await db.execute(
        "SELECT * FROM image_generations WHERE id = ?", (generation_id,)
    )
    gen = await row.fetchone()
    if not gen:
        await db.close()
        raise HTTPException(status_code=404, detail="Khong tim thay")

    images_cursor = await db.execute(
        "SELECT * FROM generated_images WHERE generation_id = ?", (generation_id,)
    )
    images = await images_cursor.fetchall()
    await db.close()

    return {
        "id": gen["id"],
        "prompt": gen["prompt"],
        "model": gen["model"],
        "num_images": gen["num_images"],
        "aspect_ratio": gen["aspect_ratio"],
        "status": gen["status"],
        "cost": gen["cost"],
        "created_at": gen["created_at"],
        "images": [
            {
                "id": img["id"],
                "url": f"/media/images/{img['filename']}",
                "file_size": img["file_size"],
            }
            for img in images
        ],
    }


@app.get("/api/v1/videos/{video_id}")
async def get_video_generation(video_id: str):
    db = await get_db()
    row = await db.execute(
        "SELECT * FROM video_generations WHERE id = ?", (video_id,)
    )
    gen = await row.fetchone()
    await db.close()

    if not gen:
        raise HTTPException(status_code=404, detail="Khong tim thay")

    video_url = None
    if gen["filename"]:
        video_url = f"/media/videos/{gen['filename']}"

    return {
        "id": gen["id"],
        "prompt": gen["prompt"],
        "model": gen["model"],
        "aspect_ratio": gen["aspect_ratio"],
        "status": gen["status"],
        "duration_seconds": gen["duration_seconds"],
        "resolution": gen["resolution"],
        "video_url": video_url,
        "cost": gen["cost"],
        "created_at": gen["created_at"],
    }


# ─── Gallery ──────────────────────────────────────────────────────────────────

@app.get("/api/v1/gallery")
async def get_gallery(page: int = 1, per_page: int = 20):
    db = await get_db()
    offset = (page - 1) * per_page

    items = []

    # Images
    cursor = await db.execute(
        """SELECT ig.id, ig.prompt, ig.model, ig.status, ig.created_at,
                  gi.filename as thumbnail
           FROM image_generations ig
           LEFT JOIN generated_images gi ON gi.generation_id = ig.id
           GROUP BY ig.id
           ORDER BY ig.created_at DESC
           LIMIT ? OFFSET ?""",
        (per_page, offset),
    )
    for row in await cursor.fetchall():
        thumbnail_url = None
        if row["thumbnail"]:
            thumbnail_url = f"/media/images/{row['thumbnail']}"
        items.append({
            "id": row["id"],
            "type": "image",
            "prompt": row["prompt"],
            "model": row["model"],
            "thumbnail_url": thumbnail_url,
            "status": row["status"],
            "created_at": row["created_at"],
        })

    # Videos
    cursor = await db.execute(
        """SELECT id, prompt, model, status, filename, created_at
           FROM video_generations
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?""",
        (per_page, offset),
    )
    for row in await cursor.fetchall():
        video_url = None
        if row["filename"]:
            video_url = f"/media/videos/{row['filename']}"
        items.append({
            "id": row["id"],
            "type": "video",
            "prompt": row["prompt"],
            "model": row["model"],
            "media_url": video_url,
            "status": row["status"],
            "created_at": row["created_at"],
        })

    await db.close()

    items.sort(key=lambda x: x["created_at"], reverse=True)
    return {"items": items[:per_page], "page": page, "per_page": per_page}


# ─── Prompt History ───────────────────────────────────────────────────────────

@app.get("/api/v1/history")
async def get_prompt_history(limit: int = 50, type: str = ""):
    db = await get_db()
    if type:
        cursor = await db.execute(
            "SELECT * FROM prompt_history WHERE type = ? ORDER BY created_at DESC LIMIT ?",
            (type, limit),
        )
    else:
        cursor = await db.execute(
            "SELECT * FROM prompt_history ORDER BY created_at DESC LIMIT ?",
            (limit,),
        )
    rows = await cursor.fetchall()
    await db.close()

    return {
        "items": [
            {
                "id": row["id"],
                "prompt": row["prompt"],
                "type": row["type"],
                "model": row["model"],
                "created_at": row["created_at"],
            }
            for row in rows
        ]
    }


# ─── Download ─────────────────────────────────────────────────────────────────

@app.get("/api/v1/download/image/{image_id}")
async def download_image(image_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT filename FROM generated_images WHERE id = ?", (image_id,)
    )
    row = await cursor.fetchone()
    await db.close()

    if not row:
        raise HTTPException(status_code=404, detail="Khong tim thay")

    filepath = os.path.join(settings.media_dir, "images", row["filename"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File khong ton tai")

    return FileResponse(filepath, filename=row["filename"], media_type="image/png")


@app.get("/api/v1/download/video/{video_id}")
async def download_video(video_id: str):
    db = await get_db()
    cursor = await db.execute(
        "SELECT filename FROM video_generations WHERE id = ?", (video_id,)
    )
    row = await cursor.fetchone()
    await db.close()

    if not row or not row["filename"]:
        raise HTTPException(status_code=404, detail="Khong tim thay hoac video chua san sang")

    filepath = os.path.join(settings.media_dir, "videos", row["filename"])
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File khong ton tai")

    return FileResponse(filepath, filename=row["filename"], media_type="video/mp4")


# ─── Models List ──────────────────────────────────────────────────────────────

@app.get("/api/v1/models")
async def list_models():
    return {
        "image_models": [
            {
                "id": "imagen-4.0-generate-001",
                "name": "Imagen 4.0 Generate",
                "description": "Chat luong cao, da dang phong cach",
                "cost_per_image": 0.04,
            },
            {
                "id": "imagen-4.0-fast-001",
                "name": "Imagen 4.0 Fast",
                "description": "Toc do nhanh, gia re",
                "cost_per_image": 0.02,
            },
            {
                "id": "imagen-4.0-ultra-001",
                "name": "Imagen 4.0 Ultra",
                "description": "Chat luong cao nhat",
                "cost_per_image": 0.06,
            },
            {
                "id": "gemini-2.5-flash-preview-image-generation",
                "name": "Nano Banana (Gemini 2.5 Flash)",
                "description": "Sinh anh native, ho tro chinh sua",
                "cost_per_image": 0.01,
            },
        ],
        "video_models": [
            {
                "id": "veo-3.1-generate-preview",
                "name": "Veo 3.1 Generate",
                "description": "Chat luong cao, 720p-4K, am thanh native",
                "cost_per_second": 0.40,
            },
            {
                "id": "veo-3.1-fast-preview",
                "name": "Veo 3.1 Fast",
                "description": "Nhanh hon, gia re hon",
                "cost_per_second": 0.15,
            },
        ],
    }
