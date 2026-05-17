"""Thin async repository functions over SQLite."""

from __future__ import annotations

import json
from typing import Any

import aiosqlite

from . import schemas


def _row_to_project(row: aiosqlite.Row) -> schemas.Project:
    return schemas.Project(
        id=row["id"],
        name=row["name"],
        description=row["description"],
        created_at=row["created_at"],
    )


def _row_to_character(row: aiosqlite.Row) -> schemas.Character:
    spec_raw = row["spec_json"] or "{}"
    try:
        spec = json.loads(spec_raw)
    except json.JSONDecodeError:
        spec = {}
    return schemas.Character(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        short_description=row["short_description"],
        spec_json=spec,
        consistency_anchor=row["consistency_anchor"],
        base_image_prompt=row["base_image_prompt"],
        created_at=row["created_at"],
    )


def _row_to_product(row: aiosqlite.Row) -> schemas.Product:
    return schemas.Product(
        id=row["id"],
        project_id=row["project_id"],
        name=row["name"],
        description=row["description"],
        shopee_url=row["shopee_url"],
        affiliate_url=row["affiliate_url"],
        image_url=row["image_url"],
        created_at=row["created_at"],
    )


def _row_to_video(row: aiosqlite.Row) -> schemas.Video:
    return schemas.Video(
        id=row["id"],
        project_id=row["project_id"],
        character_id=row["character_id"],
        product_id=row["product_id"],
        title=row["title"],
        scene_idea=row["scene_idea"],
        image_prompt=row["image_prompt"],
        product_image_prompt=row["product_image_prompt"],
        video_prompt=row["video_prompt"],
        duration_seconds=row["duration_seconds"],
        negative_prompt=row["negative_prompt"],
        caption=row["caption"],
        cta=row["cta"],
        created_at=row["created_at"],
    )


# ---------- Projects ----------


async def list_projects(db: aiosqlite.Connection) -> list[schemas.Project]:
    async with db.execute("SELECT * FROM projects ORDER BY id DESC") as cursor:
        rows = await cursor.fetchall()
    return [_row_to_project(r) for r in rows]


async def get_project(db: aiosqlite.Connection, project_id: int) -> schemas.Project | None:
    async with db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)) as cursor:
        row = await cursor.fetchone()
    return _row_to_project(row) if row else None


async def create_project(db: aiosqlite.Connection, data: schemas.ProjectCreate) -> schemas.Project:
    cursor = await db.execute(
        "INSERT INTO projects (name, description) VALUES (?, ?)",
        (data.name, data.description),
    )
    await db.commit()
    project = await get_project(db, cursor.lastrowid)
    assert project is not None
    return project


async def update_project(
    db: aiosqlite.Connection, project_id: int, data: schemas.ProjectUpdate
) -> schemas.Project | None:
    existing = await get_project(db, project_id)
    if existing is None:
        return None
    name = data.name if data.name is not None else existing.name
    description = data.description if data.description is not None else existing.description
    await db.execute(
        "UPDATE projects SET name = ?, description = ? WHERE id = ?",
        (name, description, project_id),
    )
    await db.commit()
    return await get_project(db, project_id)


async def delete_project(db: aiosqlite.Connection, project_id: int) -> bool:
    cursor = await db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    await db.commit()
    return cursor.rowcount > 0


# ---------- Characters ----------


async def list_characters(
    db: aiosqlite.Connection, project_id: int | None = None
) -> list[schemas.Character]:
    if project_id is None:
        query = "SELECT * FROM characters ORDER BY id DESC"
        params: tuple[Any, ...] = ()
    else:
        query = "SELECT * FROM characters WHERE project_id = ? ORDER BY id DESC"
        params = (project_id,)
    async with db.execute(query, params) as cursor:
        rows = await cursor.fetchall()
    return [_row_to_character(r) for r in rows]


async def get_character(db: aiosqlite.Connection, character_id: int) -> schemas.Character | None:
    async with db.execute("SELECT * FROM characters WHERE id = ?", (character_id,)) as cursor:
        row = await cursor.fetchone()
    return _row_to_character(row) if row else None


async def create_character(
    db: aiosqlite.Connection, data: schemas.CharacterCreate
) -> schemas.Character:
    cursor = await db.execute(
        """
        INSERT INTO characters
          (project_id, name, short_description, spec_json, consistency_anchor, base_image_prompt)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            data.project_id,
            data.name,
            data.short_description,
            json.dumps(data.spec_json, ensure_ascii=False),
            data.consistency_anchor,
            data.base_image_prompt,
        ),
    )
    await db.commit()
    character = await get_character(db, cursor.lastrowid)
    assert character is not None
    return character


async def update_character(
    db: aiosqlite.Connection, character_id: int, data: schemas.CharacterUpdate
) -> schemas.Character | None:
    existing = await get_character(db, character_id)
    if existing is None:
        return None
    name = data.name if data.name is not None else existing.name
    short_description = (
        data.short_description if data.short_description is not None else existing.short_description
    )
    spec_json = data.spec_json if data.spec_json is not None else existing.spec_json
    consistency_anchor = (
        data.consistency_anchor
        if data.consistency_anchor is not None
        else existing.consistency_anchor
    )
    base_image_prompt = (
        data.base_image_prompt
        if data.base_image_prompt is not None
        else existing.base_image_prompt
    )
    await db.execute(
        """
        UPDATE characters
        SET name = ?, short_description = ?, spec_json = ?,
            consistency_anchor = ?, base_image_prompt = ?
        WHERE id = ?
        """,
        (
            name,
            short_description,
            json.dumps(spec_json, ensure_ascii=False),
            consistency_anchor,
            base_image_prompt,
            character_id,
        ),
    )
    await db.commit()
    return await get_character(db, character_id)


async def delete_character(db: aiosqlite.Connection, character_id: int) -> bool:
    cursor = await db.execute("DELETE FROM characters WHERE id = ?", (character_id,))
    await db.commit()
    return cursor.rowcount > 0


# ---------- Products ----------


async def list_products(
    db: aiosqlite.Connection, project_id: int | None = None
) -> list[schemas.Product]:
    if project_id is None:
        query = "SELECT * FROM products ORDER BY id DESC"
        params: tuple[Any, ...] = ()
    else:
        query = "SELECT * FROM products WHERE project_id = ? ORDER BY id DESC"
        params = (project_id,)
    async with db.execute(query, params) as cursor:
        rows = await cursor.fetchall()
    return [_row_to_product(r) for r in rows]


async def get_product(db: aiosqlite.Connection, product_id: int) -> schemas.Product | None:
    async with db.execute("SELECT * FROM products WHERE id = ?", (product_id,)) as cursor:
        row = await cursor.fetchone()
    return _row_to_product(row) if row else None


async def create_product(
    db: aiosqlite.Connection, data: schemas.ProductCreate
) -> schemas.Product:
    cursor = await db.execute(
        """
        INSERT INTO products
          (project_id, name, description, shopee_url, affiliate_url, image_url)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            data.project_id,
            data.name,
            data.description,
            data.shopee_url,
            data.affiliate_url,
            data.image_url,
        ),
    )
    await db.commit()
    product = await get_product(db, cursor.lastrowid)
    assert product is not None
    return product


async def update_product(
    db: aiosqlite.Connection, product_id: int, data: schemas.ProductUpdate
) -> schemas.Product | None:
    existing = await get_product(db, product_id)
    if existing is None:
        return None
    name = data.name if data.name is not None else existing.name
    description = data.description if data.description is not None else existing.description
    shopee_url = data.shopee_url if data.shopee_url is not None else existing.shopee_url
    affiliate_url = (
        data.affiliate_url if data.affiliate_url is not None else existing.affiliate_url
    )
    image_url = data.image_url if data.image_url is not None else existing.image_url
    await db.execute(
        """
        UPDATE products
        SET name = ?, description = ?, shopee_url = ?, affiliate_url = ?, image_url = ?
        WHERE id = ?
        """,
        (name, description, shopee_url, affiliate_url, image_url, product_id),
    )
    await db.commit()
    return await get_product(db, product_id)


async def delete_product(db: aiosqlite.Connection, product_id: int) -> bool:
    cursor = await db.execute("DELETE FROM products WHERE id = ?", (product_id,))
    await db.commit()
    return cursor.rowcount > 0


# ---------- Videos ----------


async def list_videos(
    db: aiosqlite.Connection, project_id: int | None = None
) -> list[schemas.Video]:
    if project_id is None:
        query = "SELECT * FROM videos ORDER BY id DESC"
        params: tuple[Any, ...] = ()
    else:
        query = "SELECT * FROM videos WHERE project_id = ? ORDER BY id DESC"
        params = (project_id,)
    async with db.execute(query, params) as cursor:
        rows = await cursor.fetchall()
    return [_row_to_video(r) for r in rows]


async def get_video(db: aiosqlite.Connection, video_id: int) -> schemas.Video | None:
    async with db.execute("SELECT * FROM videos WHERE id = ?", (video_id,)) as cursor:
        row = await cursor.fetchone()
    return _row_to_video(row) if row else None


async def create_video(db: aiosqlite.Connection, data: schemas.VideoCreate) -> schemas.Video:
    cursor = await db.execute(
        """
        INSERT INTO videos (
            project_id, character_id, product_id, title, scene_idea,
            image_prompt, product_image_prompt, video_prompt,
            duration_seconds, negative_prompt, caption, cta
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            data.project_id,
            data.character_id,
            data.product_id,
            data.title,
            data.scene_idea,
            data.image_prompt,
            data.product_image_prompt,
            data.video_prompt,
            data.duration_seconds,
            data.negative_prompt,
            data.caption,
            data.cta,
        ),
    )
    await db.commit()
    video = await get_video(db, cursor.lastrowid)
    assert video is not None
    return video


async def update_video(
    db: aiosqlite.Connection, video_id: int, data: schemas.VideoUpdate
) -> schemas.Video | None:
    existing = await get_video(db, video_id)
    if existing is None:
        return None
    fields: dict[str, Any] = data.model_dump(exclude_none=True)
    if not fields:
        return existing
    set_clause = ", ".join(f"{k} = ?" for k in fields.keys())
    params = list(fields.values()) + [video_id]
    await db.execute(f"UPDATE videos SET {set_clause} WHERE id = ?", params)
    await db.commit()
    return await get_video(db, video_id)


async def delete_video(db: aiosqlite.Connection, video_id: int) -> bool:
    cursor = await db.execute("DELETE FROM videos WHERE id = ?", (video_id,))
    await db.commit()
    return cursor.rowcount > 0
