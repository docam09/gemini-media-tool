"""Deployment entrypoint.

Serves the built frontend (frontend/dist) as static files AND exposes the
existing FastAPI app under the /api prefix so the frontend's `API_BASE = '/api'`
resolves same-origin on a single Render service.

Run (Render):
    uvicorn deploy_main:deploy_app --host 0.0.0.0 --port $PORT
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.main import app as api_app

# backend/deploy_main.py -> repo root -> frontend/dist
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

deploy_app = FastAPI(
    title="VN <-> KR Realtime Interpreter (deployed)",
    description="Single-service deployment: static frontend + /api backend.",
)

# All backend routes (healthz, translate, soniox/session, ...) under /api.
deploy_app.mount("/api", api_app)

if FRONTEND_DIST.is_dir():
    deploy_app.mount(
        "/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="static"
    )
else:
    @deploy_app.get("/")
    async def _missing_build():
        return {
            "error": "Frontend build not found. Run `npm run build` in frontend/ "
            "before starting the server."
        }
