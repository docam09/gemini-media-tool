"""Team work-progress tracker.

A small, self-contained feature that lives alongside the translator. It tracks
the members of a team and the tasks assigned to them, and exposes a per-member
completion summary that the frontend renders as a chart.

Storage is a local SQLite file (stdlib ``sqlite3`` — no extra dependencies),
so the data survives server restarts without any external service.

Endpoints (mounted under ``/progress`` by ``app.main``):

* ``GET    /progress/members``            — list members with their stats
* ``POST   /progress/members``            — add a member
* ``DELETE /progress/members/{id}``       — remove a member (and their tasks)
* ``GET    /progress/tasks``              — list tasks (optionally by member)
* ``POST   /progress/tasks``              — add a task
* ``PATCH  /progress/tasks/{id}``         — update a task (status / progress / …)
* ``DELETE /progress/tasks/{id}``         — remove a task
* ``GET    /progress/summary``            — aggregate completion per member + team
"""

from __future__ import annotations

import os
import sqlite3
from contextlib import closing
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(prefix="/progress", tags=["progress"])

# Status values a task can move through. ``done`` always counts as 100%.
TaskStatus = Literal["todo", "in_progress", "done"]
STATUS_VALUES: tuple[str, ...] = ("todo", "in_progress", "done")

# DB path: override with PROGRESS_DB for tests; default sits next to the backend.
_DEFAULT_DB = Path(__file__).resolve().parent.parent / "progress.db"


def _db_path() -> str:
    return os.environ.get("PROGRESS_DB", str(_DEFAULT_DB))


def _connect() -> sqlite3.Connection:
    # ``timeout`` + ``busy_timeout`` let concurrent writers (multiple teammates
    # editing at once) wait briefly for the lock instead of failing outright.
    conn = sqlite3.connect(_db_path(), timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 5000")
    return conn


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def init_db() -> None:
    """Create tables on startup if they do not exist."""
    with closing(_connect()) as conn, conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS members (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT NOT NULL,
                role       TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                member_id  INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
                title      TEXT NOT NULL,
                status     TEXT NOT NULL DEFAULT 'todo',
                progress   INTEGER NOT NULL DEFAULT 0,
                due_date   TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )


# --------------------------------------------------------------------------- #
# Schemas
# --------------------------------------------------------------------------- #
class MemberCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    role: str = Field(default="", max_length=120)


class Member(BaseModel):
    id: int
    name: str
    role: str
    created_at: str
    # Derived stats so the frontend can render without a second round-trip.
    total_tasks: int = 0
    done_tasks: int = 0
    completion: float = 0.0  # 0..100, average progress across the member's tasks


class TaskCreate(BaseModel):
    member_id: int
    title: str = Field(..., min_length=1, max_length=200)
    status: TaskStatus = "todo"
    progress: int = Field(default=0, ge=0, le=100)
    due_date: str | None = Field(default=None, max_length=40)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    status: TaskStatus | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    due_date: str | None = Field(default=None, max_length=40)


class Task(BaseModel):
    id: int
    member_id: int
    title: str
    status: TaskStatus
    progress: int
    due_date: str | None
    created_at: str
    updated_at: str


class MemberSummary(BaseModel):
    id: int
    name: str
    role: str
    total_tasks: int
    done_tasks: int
    completion: float


class Summary(BaseModel):
    members: list[MemberSummary]
    team_completion: float
    total_tasks: int
    done_tasks: int


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _effective_progress(status: str, progress: int) -> int:
    """A ``done`` task counts as 100% regardless of the stored progress value."""
    return 100 if status == "done" else progress


def _member_with_stats(conn: sqlite3.Connection, row: sqlite3.Row) -> Member:
    tasks = conn.execute(
        "SELECT status, progress FROM tasks WHERE member_id = ?", (row["id"],)
    ).fetchall()
    total = len(tasks)
    done = sum(1 for t in tasks if t["status"] == "done")
    if total:
        avg = sum(_effective_progress(t["status"], t["progress"]) for t in tasks) / total
    else:
        avg = 0.0
    return Member(
        id=row["id"],
        name=row["name"],
        role=row["role"],
        created_at=row["created_at"],
        total_tasks=total,
        done_tasks=done,
        completion=round(avg, 1),
    )


def _get_member_row(conn: sqlite3.Connection, member_id: int) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM members WHERE id = ?", (member_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Member {member_id} not found")
    return row


# --------------------------------------------------------------------------- #
# Members
# --------------------------------------------------------------------------- #
@router.get("/members", response_model=list[Member])
def list_members() -> list[Member]:
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT * FROM members ORDER BY created_at, id").fetchall()
        return [_member_with_stats(conn, row) for row in rows]


@router.post("/members", response_model=Member, status_code=201)
def create_member(payload: MemberCreate) -> Member:
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="name must not be blank")
    with closing(_connect()) as conn, conn:
        cur = conn.execute(
            "INSERT INTO members (name, role, created_at) VALUES (?, ?, ?)",
            (name, payload.role.strip(), _now()),
        )
        row = conn.execute("SELECT * FROM members WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _member_with_stats(conn, row)


@router.delete("/members/{member_id}", status_code=204)
def delete_member(member_id: int) -> None:
    with closing(_connect()) as conn, conn:
        _get_member_row(conn, member_id)
        conn.execute("DELETE FROM members WHERE id = ?", (member_id,))


# --------------------------------------------------------------------------- #
# Tasks
# --------------------------------------------------------------------------- #
def _row_to_task(row: sqlite3.Row) -> Task:
    return Task(
        id=row["id"],
        member_id=row["member_id"],
        title=row["title"],
        status=row["status"],
        progress=row["progress"],
        due_date=row["due_date"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


@router.get("/tasks", response_model=list[Task])
def list_tasks(member_id: int | None = None) -> list[Task]:
    with closing(_connect()) as conn:
        if member_id is None:
            rows = conn.execute("SELECT * FROM tasks ORDER BY created_at, id").fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM tasks WHERE member_id = ? ORDER BY created_at, id",
                (member_id,),
            ).fetchall()
        return [_row_to_task(row) for row in rows]


@router.post("/tasks", response_model=Task, status_code=201)
def create_task(payload: TaskCreate) -> Task:
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="title must not be blank")
    with closing(_connect()) as conn, conn:
        _get_member_row(conn, payload.member_id)  # 404 if member is unknown
        now = _now()
        progress = _effective_progress(payload.status, payload.progress)
        cur = conn.execute(
            """
            INSERT INTO tasks (member_id, title, status, progress, due_date, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (payload.member_id, title, payload.status, progress, payload.due_date, now, now),
        )
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (cur.lastrowid,)).fetchone()
        return _row_to_task(row)


@router.patch("/tasks/{task_id}", response_model=Task)
def update_task(task_id: int, payload: TaskUpdate) -> Task:
    with closing(_connect()) as conn, conn:
        row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

        title = row["title"] if payload.title is None else payload.title.strip()
        status = row["status"] if payload.status is None else payload.status
        progress = row["progress"] if payload.progress is None else payload.progress
        due_date = row["due_date"] if payload.due_date is None else payload.due_date

        # Keep status and progress consistent: marking done forces 100%, and
        # dragging progress to 100 implies the task is done.
        if payload.status == "done":
            progress = 100
        elif payload.progress == 100 and payload.status is None:
            status = "done"
        elif payload.status in ("todo", "in_progress") and payload.progress is None:
            progress = min(progress, 99)

        conn.execute(
            """
            UPDATE tasks
            SET title = ?, status = ?, progress = ?, due_date = ?, updated_at = ?
            WHERE id = ?
            """,
            (title, status, progress, due_date, _now(), task_id),
        )
        updated = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
        return _row_to_task(updated)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int) -> None:
    with closing(_connect()) as conn, conn:
        row = conn.execute("SELECT id FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))


# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #
@router.get("/summary", response_model=Summary)
def summary() -> Summary:
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT * FROM members ORDER BY created_at, id").fetchall()
        members = [_member_with_stats(conn, row) for row in rows]

    member_summaries = [
        MemberSummary(
            id=m.id,
            name=m.name,
            role=m.role,
            total_tasks=m.total_tasks,
            done_tasks=m.done_tasks,
            completion=m.completion,
        )
        for m in members
    ]
    total_tasks = sum(m.total_tasks for m in members)
    done_tasks = sum(m.done_tasks for m in members)
    # Team completion is the average of per-member completion, so a member with
    # no tasks counts as 0% rather than being ignored.
    if members:
        team = round(sum(m.completion for m in members) / len(members), 1)
    else:
        team = 0.0

    return Summary(
        members=member_summaries,
        team_completion=team,
        total_tasks=total_tasks,
        done_tasks=done_tasks,
    )
