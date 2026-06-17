"""FastAPI backend for the Vietnamese <-> Korean realtime translator.

Exposes a small HTTP surface used by the frontend:

* ``GET /healthz``       — liveness probe
* ``POST /translate``    — translate text between Vietnamese and Korean via Gemini
* ``GET /languages``     — list of supported language pairs / BCP-47 codes used by
                           the browser Web Speech API on the frontend
* ``GET /models``        — list of allowed Gemini models with labels for the picker
* ``GET /diag``          — end-to-end probe (tries a real Gemini call)

API key resolution order (first non-empty value wins):
  1. ``X-Gemini-Api-Key`` request header  — sent by the frontend when the user
     has entered their own key in the UI.
  2. ``GEMINI_API_KEY`` environment variable — server-side key, optional.
"""

from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Annotated, Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.gemini import GeminiTranslator, TranslationError

load_dotenv()

logger = logging.getLogger("vn_kr_translator")
logging.basicConfig(level=logging.INFO)

LanguageCode = Literal["vi", "ko"]

BCP47: dict[str, str] = {
    "vi": "vi-VN",
    "ko": "ko-KR",
}

HUMAN_NAME: dict[str, str] = {
    "vi": "Vietnamese",
    "ko": "Korean",
}

ALLOWED_MODELS: dict[str, dict[str, str]] = {
    "gemini-2.5-flash": {
        "label": "Flash",
        "description": "Nhanh, chất lượng tốt — mặc định cho hội thoại hằng ngày.",
    },
    "gemini-2.5-flash-lite": {
        "label": "Flash-Lite",
        "description": "Nhanh nhất, hạn mức free cao hơn; chất lượng hơi kém hơn Flash.",
    },
    "gemini-2.5-pro": {
        "label": "Pro",
        "description": "Chất lượng cao nhất ổn định; chậm hơn, hạn mức free thấp hơn.",
    },
}


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    source: LanguageCode
    target: LanguageCode
    style: Literal["casual", "formal"] = "casual"
    context: str | None = Field(default=None, max_length=2000)
    glossary: str | None = Field(default=None, max_length=4000)
    model: str | None = None


class TranslateResponse(BaseModel):
    translation: str
    source: LanguageCode
    target: LanguageCode
    romanization: str | None = None
    note: str | None = None
    model: str


class LanguagesResponse(BaseModel):
    languages: dict[str, dict[str, str]]


class ModelsResponse(BaseModel):
    default: str
    models: dict[str, dict[str, str]]


app = FastAPI(
    title="VN <-> KR Realtime Translator",
    version="0.1.0",
    description=(
        "Local backend that proxies Gemini for Vietnamese <-> Korean translation. "
        "Pass the Gemini API key via the X-Gemini-Api-Key header or set GEMINI_API_KEY "
        "as an environment variable."
    ),
)


def _allowed_origins() -> list[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _default_model() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


# ---------------------------------------------------------------------------
# API key resolution
# ---------------------------------------------------------------------------

def _require_api_key(
    x_gemini_api_key: Annotated[str | None, Header()] = None,
) -> str:
    """Resolve the Gemini API key from the request header or the environment.

    Header ``X-Gemini-Api-Key`` wins over the env var so that a user-supplied
    key always takes priority over a server-side default.
    """
    key = (x_gemini_api_key or "").strip() or os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        raise HTTPException(
            status_code=401,
            detail=(
                "Gemini API key is required. Enter your key in the app UI or set "
                "GEMINI_API_KEY on the server. Get a free key at "
                "https://aistudio.google.com/apikey"
            ),
        )
    return key


ApiKey = Annotated[str, Depends(_require_api_key)]


# ---------------------------------------------------------------------------
# Translator cache
# ---------------------------------------------------------------------------

@lru_cache(maxsize=8)
def _build_translator(api_key: str, model: str) -> GeminiTranslator:
    return GeminiTranslator(api_key=api_key, model=model)


def _translator(api_key: str, model: str | None = None) -> GeminiTranslator:
    chosen = model or _default_model()
    try:
        return _build_translator(api_key, chosen)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"Failed to initialize Gemini client: {exc}",
        ) from exc


# ---------------------------------------------------------------------------
# Error handler
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/healthz")
def healthz() -> dict[str, object]:
    """Liveness probe. Does NOT require an API key."""
    return {
        "status": "ok",
        # True if a server-side env key is configured (user key not needed).
        "server_key_configured": bool(os.environ.get("GEMINI_API_KEY", "").strip()),
        "model": _default_model(),
    }


@app.get("/models", response_model=ModelsResponse)
def models() -> ModelsResponse:
    return ModelsResponse(default=_default_model(), models=ALLOWED_MODELS)


@app.get("/diag")
def diag(api_key: ApiKey) -> dict[str, object]:
    """End-to-end probe: tries a tiny Gemini call and returns the raw outcome."""
    try:
        translator = _translator(api_key)
    except HTTPException as http_exc:
        return {"ok": False, "stage": "init", "detail": http_exc.detail}

    try:
        result = translator.translate(
            text="Xin chào",
            source="Vietnamese",
            target="Korean",
            style="casual",
        )
    except TranslationError as exc:
        return {"ok": False, "stage": "gemini", "detail": str(exc)}

    return {
        "ok": True,
        "model": _default_model(),
        "sample": result.translation,
    }


@app.get("/languages", response_model=LanguagesResponse)
def languages() -> LanguagesResponse:
    return LanguagesResponse(
        languages={
            code: {"name": HUMAN_NAME[code], "bcp47": BCP47[code]}
            for code in ("vi", "ko")
        }
    )


@app.post("/translate", response_model=TranslateResponse)
def translate(req: TranslateRequest, api_key: ApiKey) -> TranslateResponse:
    if req.source == req.target:
        raise HTTPException(status_code=400, detail="source and target must differ")

    if req.model is not None and req.model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Unsupported model '{req.model}'. "
                f"Allowed: {', '.join(sorted(ALLOWED_MODELS))}."
            ),
        )

    chosen_model = req.model or _default_model()
    translator = _translator(api_key, chosen_model)
    try:
        result = translator.translate(
            text=req.text,
            source=HUMAN_NAME[req.source],
            target=HUMAN_NAME[req.target],
            style=req.style,
            context=req.context,
            glossary=req.glossary,
        )
    except TranslationError as exc:
        logger.exception("Gemini translation failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return TranslateResponse(
        translation=result.translation,
        romanization=result.romanization,
        note=result.note,
        source=req.source,
        target=req.target,
        model=chosen_model,
    )
