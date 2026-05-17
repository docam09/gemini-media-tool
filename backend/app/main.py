from __future__ import annotations

import json
from contextlib import asynccontextmanager
from typing import Annotated, AsyncIterator

import aiosqlite
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import gemini_client, prompts, repository, schemas
from .database import get_db, init_db


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    await init_db()
    yield


app = FastAPI(title="Prompt Studio API", lifespan=lifespan)

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)


async def db_dep() -> AsyncIterator[aiosqlite.Connection]:
    db = await get_db()
    try:
        yield db
    finally:
        await db.close()


DBDep = Annotated[aiosqlite.Connection, Depends(db_dep)]
ApiKeyHeader = Annotated[str | None, Header(alias="X-Gemini-Api-Key")]


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


# ---------------- Projects ----------------


@app.get("/api/projects", response_model=list[schemas.Project])
async def api_list_projects(db: DBDep) -> list[schemas.Project]:
    return await repository.list_projects(db)


@app.post("/api/projects", response_model=schemas.Project)
async def api_create_project(payload: schemas.ProjectCreate, db: DBDep) -> schemas.Project:
    return await repository.create_project(db, payload)


@app.get("/api/projects/{project_id}", response_model=schemas.Project)
async def api_get_project(project_id: int, db: DBDep) -> schemas.Project:
    project = await repository.get_project(db, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project không tồn tại")
    return project


@app.patch("/api/projects/{project_id}", response_model=schemas.Project)
async def api_update_project(
    project_id: int, payload: schemas.ProjectUpdate, db: DBDep
) -> schemas.Project:
    project = await repository.update_project(db, project_id, payload)
    if project is None:
        raise HTTPException(status_code=404, detail="Project không tồn tại")
    return project


@app.delete("/api/projects/{project_id}")
async def api_delete_project(project_id: int, db: DBDep) -> dict[str, bool]:
    ok = await repository.delete_project(db, project_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Project không tồn tại")
    return {"deleted": True}


# ---------------- Characters ----------------


@app.get("/api/characters", response_model=list[schemas.Character])
async def api_list_characters(
    db: DBDep, project_id: int | None = None
) -> list[schemas.Character]:
    return await repository.list_characters(db, project_id)


@app.post("/api/characters", response_model=schemas.Character)
async def api_create_character(
    payload: schemas.CharacterCreate, db: DBDep
) -> schemas.Character:
    return await repository.create_character(db, payload)


@app.patch("/api/characters/{character_id}", response_model=schemas.Character)
async def api_update_character(
    character_id: int, payload: schemas.CharacterUpdate, db: DBDep
) -> schemas.Character:
    character = await repository.update_character(db, character_id, payload)
    if character is None:
        raise HTTPException(status_code=404, detail="Character không tồn tại")
    return character


@app.delete("/api/characters/{character_id}")
async def api_delete_character(character_id: int, db: DBDep) -> dict[str, bool]:
    ok = await repository.delete_character(db, character_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Character không tồn tại")
    return {"deleted": True}


# ---------------- Products ----------------


@app.get("/api/products", response_model=list[schemas.Product])
async def api_list_products(
    db: DBDep, project_id: int | None = None
) -> list[schemas.Product]:
    return await repository.list_products(db, project_id)


@app.post("/api/products", response_model=schemas.Product)
async def api_create_product(payload: schemas.ProductCreate, db: DBDep) -> schemas.Product:
    return await repository.create_product(db, payload)


@app.patch("/api/products/{product_id}", response_model=schemas.Product)
async def api_update_product(
    product_id: int, payload: schemas.ProductUpdate, db: DBDep
) -> schemas.Product:
    product = await repository.update_product(db, product_id, payload)
    if product is None:
        raise HTTPException(status_code=404, detail="Sản phẩm không tồn tại")
    return product


@app.delete("/api/products/{product_id}")
async def api_delete_product(product_id: int, db: DBDep) -> dict[str, bool]:
    ok = await repository.delete_product(db, product_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Sản phẩm không tồn tại")
    return {"deleted": True}


# ---------------- Videos ----------------


@app.get("/api/videos", response_model=list[schemas.Video])
async def api_list_videos(
    db: DBDep, project_id: int | None = None
) -> list[schemas.Video]:
    return await repository.list_videos(db, project_id)


@app.post("/api/videos", response_model=schemas.Video)
async def api_create_video(payload: schemas.VideoCreate, db: DBDep) -> schemas.Video:
    return await repository.create_video(db, payload)


@app.patch("/api/videos/{video_id}", response_model=schemas.Video)
async def api_update_video(
    video_id: int, payload: schemas.VideoUpdate, db: DBDep
) -> schemas.Video:
    video = await repository.update_video(db, video_id, payload)
    if video is None:
        raise HTTPException(status_code=404, detail="Video không tồn tại")
    return video


@app.delete("/api/videos/{video_id}")
async def api_delete_video(video_id: int, db: DBDep) -> dict[str, bool]:
    ok = await repository.delete_video(db, video_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Video không tồn tại")
    return {"deleted": True}


# ---------------- Chat ----------------


@app.post("/api/chat", response_model=schemas.ChatResponse)
async def api_chat(payload: schemas.ChatRequest, x_gemini_api_key: ApiKeyHeader = None) -> schemas.ChatResponse:
    system = prompts.CHAT_SYSTEM_PROMPT
    if payload.system_hint:
        system = system + "\n\nHỗ trợ thêm: " + payload.system_hint
    history = [t.model_dump() for t in payload.history]
    reply = await gemini_client.generate_text(
        api_key=x_gemini_api_key,
        system_prompt=system,
        history=history,
        user_message=payload.message,
    )
    return schemas.ChatResponse(reply=reply)


# ---------------- AI Generation ----------------


def _build_character_user_prompt(req: schemas.GenerateCharacterRequest) -> str:
    parts = [f"MÔ TẢ NHÂN VẬT NGƯỜI DÙNG CUNG CẤP:\n{req.description}"]
    if req.target_audience:
        parts.append(f"\nĐỐI TƯỢNG MỤC TIÊU: {req.target_audience}")
    if req.style:
        parts.append(f"\nPHONG CÁCH MONG MUỐN: {req.style}")
    parts.append(
        "\nHãy mở rộng thành Character Spec đầy đủ theo schema yêu cầu. "
        "Nếu thông tin còn thiếu thì SUY LUẬN hợp lý và ghi chi tiết để đảm bảo nhân vật "
        "có thể được tạo lại đồng nhất giữa các lần generate khác nhau."
    )
    return "\n".join(parts)


@app.post("/api/generate/character", response_model=schemas.GenerateCharacterResponse)
async def api_generate_character(
    payload: schemas.GenerateCharacterRequest,
    db: DBDep,
    x_gemini_api_key: ApiKeyHeader = None,
) -> schemas.GenerateCharacterResponse:
    data = await gemini_client.generate_json(
        api_key=x_gemini_api_key,
        system_prompt=prompts.CHARACTER_SYSTEM_PROMPT,
        user_prompt=_build_character_user_prompt(payload),
        temperature=0.75,
    )

    spec = data.get("spec") or {}
    if not isinstance(spec, dict):
        spec = {}
    result = schemas.GenerateCharacterResponse(
        name=str(data.get("name") or payload.character_name or "Untitled Character"),
        short_description=str(data.get("short_description") or ""),
        spec_json=spec,
        consistency_anchor=str(data.get("consistency_anchor") or ""),
        base_image_prompt=str(data.get("base_image_prompt") or ""),
    )

    if payload.save:
        if payload.project_id is None:
            raise HTTPException(status_code=400, detail="Cần project_id để lưu character")
        created = await repository.create_character(
            db,
            schemas.CharacterCreate(
                project_id=payload.project_id,
                name=payload.character_name or result.name,
                short_description=result.short_description,
                spec_json=result.spec_json,
                consistency_anchor=result.consistency_anchor,
                base_image_prompt=result.base_image_prompt,
            ),
        )
        result.character_id = created.id

    return result


async def _resolve_character_anchor(
    db: aiosqlite.Connection,
    *,
    character_id: int | None,
    character: schemas.GenerateCharacterResponse | None,
) -> tuple[str, dict, str]:
    """Returns (consistency_anchor, spec, character_name)."""
    if character_id is not None:
        existing = await repository.get_character(db, character_id)
        if existing is None:
            raise HTTPException(status_code=404, detail="Character không tồn tại")
        return existing.consistency_anchor, existing.spec_json, existing.name
    if character is not None:
        return character.consistency_anchor, character.spec_json, character.name
    raise HTTPException(
        status_code=400,
        detail="Cần character_id hoặc payload character đã sinh trước đó",
    )


def _build_storyboard_user_prompt(
    req: schemas.GenerateStoryboardRequest,
    consistency_anchor: str,
    character_spec: dict,
    character_name: str,
) -> str:
    lines = [
        f"CHARACTER NAME: {character_name}",
        f"CONSISTENCY ANCHOR (PHẢI DÁN VÀO ĐẦU MỌI PROMPT):\n{consistency_anchor}",
        f"CHARACTER SPEC (json):\n{json.dumps(character_spec, ensure_ascii=False)}",
        "",
        f"PRODUCT NAME: {req.product_name}",
    ]
    if req.product_description:
        lines.append(f"PRODUCT DESCRIPTION: {req.product_description}")
    if req.product_image_description:
        lines.append(
            f"PRODUCT IMAGE DESCRIPTION (mô tả ảnh sản phẩm sẽ chèn vào): "
            f"{req.product_image_description}"
        )
    if req.scene_idea:
        lines.append(f"SCENE IDEA / YÊU CẦU TỪ NGƯỜI DÙNG: {req.scene_idea}")
    if req.target_audience:
        lines.append(f"TARGET AUDIENCE: {req.target_audience}")
    if req.tone:
        lines.append(f"TONE / MOOD: {req.tone}")
    lines.append(f"VIDEO DURATION: {req.duration_seconds} giây")
    lines.append("")
    lines.append(
        "Hãy sinh JSON storyboard duy nhất theo schema. Mỗi prompt tiếng Anh phải BẮT ĐẦU "
        "bằng consistency_anchor. Caption + CTA viết tiếng Việt có dấu, đậm chất "
        "TikTok/Reels affiliate Shopee."
    )
    return "\n".join(lines)


@app.post("/api/generate/storyboard", response_model=schemas.GenerateStoryboardResponse)
async def api_generate_storyboard(
    payload: schemas.GenerateStoryboardRequest,
    db: DBDep,
    x_gemini_api_key: ApiKeyHeader = None,
) -> schemas.GenerateStoryboardResponse:
    anchor, spec, char_name = await _resolve_character_anchor(
        db, character_id=payload.character_id, character=payload.character
    )
    system_prompt = prompts.STORYBOARD_SYSTEM_PROMPT.format(duration=payload.duration_seconds)
    data = await gemini_client.generate_json(
        api_key=x_gemini_api_key,
        system_prompt=system_prompt,
        user_prompt=_build_storyboard_user_prompt(payload, anchor, spec, char_name),
        temperature=0.8,
    )

    storyboard = schemas.StoryboardPrompts(
        title=str(data.get("title") or ""),
        scene_idea=str(data.get("scene_idea") or payload.scene_idea or ""),
        image_prompt=str(data.get("image_prompt") or ""),
        product_image_prompt=str(data.get("product_image_prompt") or ""),
        video_prompt=str(data.get("video_prompt") or ""),
        negative_prompt=str(data.get("negative_prompt") or ""),
        caption=str(data.get("caption") or ""),
        cta=str(data.get("cta") or ""),
        duration_seconds=payload.duration_seconds,
    )

    video_id: int | None = None
    if payload.save:
        if payload.project_id is None:
            raise HTTPException(status_code=400, detail="Cần project_id để lưu video")
        video = await repository.create_video(
            db,
            schemas.VideoCreate(
                project_id=payload.project_id,
                character_id=payload.character_id,
                product_id=None,
                title=storyboard.title,
                scene_idea=storyboard.scene_idea,
                image_prompt=storyboard.image_prompt,
                product_image_prompt=storyboard.product_image_prompt,
                video_prompt=storyboard.video_prompt,
                duration_seconds=storyboard.duration_seconds,
                negative_prompt=storyboard.negative_prompt,
                caption=storyboard.caption,
                cta=storyboard.cta,
            ),
        )
        video_id = video.id

    return schemas.GenerateStoryboardResponse(storyboard=storyboard, video_id=video_id)


@app.post("/api/generate/variants", response_model=schemas.GenerateVariantsResponse)
async def api_generate_variants(
    payload: schemas.GenerateVariantsRequest,
    db: DBDep,
    x_gemini_api_key: ApiKeyHeader = None,
) -> schemas.GenerateVariantsResponse:
    anchor, spec, char_name = await _resolve_character_anchor(
        db, character_id=payload.character_id, character=payload.character
    )
    count = max(1, min(payload.count, 6))
    system_prompt = (
        prompts.STORYBOARD_SYSTEM_PROMPT.format(duration=payload.duration_seconds)
        + "\n\n"
        + prompts.VARIANTS_SYSTEM_PROMPT.format(count=count)
    )
    request = schemas.GenerateStoryboardRequest(
        project_id=payload.project_id,
        character_id=payload.character_id,
        character=payload.character,
        product_name=payload.product_name,
        product_description=payload.product_description,
        product_image_description=payload.product_image_description,
        scene_idea="",
        target_audience=payload.target_audience,
        tone=payload.tone,
        duration_seconds=payload.duration_seconds,
        save=False,
    )
    user_prompt = (
        _build_storyboard_user_prompt(request, anchor, spec, char_name)
        + f"\n\nHãy sinh CHÍNH XÁC {count} biến thể khác nhau rõ rệt về scenario."
    )
    data = await gemini_client.generate_json(
        api_key=x_gemini_api_key,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        temperature=0.9,
    )
    raw_variants = data.get("variants") or []
    if not isinstance(raw_variants, list):
        raw_variants = []
    variants: list[schemas.StoryboardPrompts] = []
    for item in raw_variants:
        if not isinstance(item, dict):
            continue
        variants.append(
            schemas.StoryboardPrompts(
                title=str(item.get("title") or ""),
                scene_idea=str(item.get("scene_idea") or ""),
                image_prompt=str(item.get("image_prompt") or ""),
                product_image_prompt=str(item.get("product_image_prompt") or ""),
                video_prompt=str(item.get("video_prompt") or ""),
                negative_prompt=str(item.get("negative_prompt") or ""),
                caption=str(item.get("caption") or ""),
                cta=str(item.get("cta") or ""),
                duration_seconds=payload.duration_seconds,
            )
        )
    return schemas.GenerateVariantsResponse(variants=variants)
