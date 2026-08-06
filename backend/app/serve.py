"""Single-process production entrypoint: the API plus the built frontend.

Locally the Vite dev server proxies ``/api`` to this backend. In production
there is no dev server, so the same paths have to exist on one origin — the
frontend must be same-origin anyway, because ``getUserMedia`` only works over
HTTPS and the browser holds a short-lived Soniox key.

Run with ``uvicorn app.serve:app`` after building the frontend into
``backend/static``.
"""

from __future__ import annotations

import base64
import os
import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles

from app.main import app as api

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(title="VN<->KR interpreter", docs_url=None, redoc_url=None)


def _password() -> str | None:
    """Optional gate: anyone with the URL spends the owner's API quota."""
    return os.getenv("APP_PASSWORD", "").strip() or None


@app.middleware("http")
async def require_password(request: Request, call_next):
    expected = _password()
    if expected is None:
        return await call_next(request)

    header = request.headers.get("authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() == "basic":
        try:
            _, _, supplied = base64.b64decode(token).decode().partition(":")
        except ValueError:
            supplied = ""
        # Any username is accepted: there is one shared password, and asking a
        # user to also remember a username buys nothing.
        if secrets.compare_digest(supplied, expected):
            return await call_next(request)

    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="VN<->KR interpreter"'},
    )


app.mount("/api", api)

if STATIC_DIR.is_dir():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
