import aiosqlite
import os
from datetime import datetime, timezone

DB_PATH = "./data/media_tool.db"


async def get_db() -> aiosqlite.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    return db


async def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript("""
            CREATE TABLE IF NOT EXISTS image_generations (
                id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                num_images INTEGER DEFAULT 1,
                aspect_ratio TEXT DEFAULT '1:1',
                style TEXT DEFAULT '',
                status TEXT DEFAULT 'completed',
                cost REAL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS generated_images (
                id TEXT PRIMARY KEY,
                generation_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                width INTEGER,
                height INTEGER,
                file_size INTEGER,
                created_at TEXT NOT NULL,
                FOREIGN KEY (generation_id) REFERENCES image_generations(id)
            );

            CREATE TABLE IF NOT EXISTS video_generations (
                id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                model TEXT NOT NULL,
                aspect_ratio TEXT DEFAULT '16:9',
                duration_seconds INTEGER,
                resolution TEXT,
                status TEXT DEFAULT 'processing',
                filename TEXT,
                cost REAL DEFAULT 0,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS prompt_history (
                id TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                type TEXT NOT NULL,
                model TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
        """)
        await db.commit()
