"""FastAPI backend for the Vietnamese <-> Korean realtime translator.

Exposes a small HTTP surface used by the frontend:

* ``GET /healthz``       — liveness probe
* ``POST /translate``    — translate text between Vietnamese and Korean via Gemini
* ``GET /languages``     — list of supported language pairs / BCP-47 codes used by
                           the browser Web Speech API on the frontend
"""

from __future__ import annotations

import logging
import os
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.gemini import GeminiTranslator, TranslationError

load_dotenv()

logger = logging.getLogger("vn_kr_translator")
logging.basicConfig(level=logging.INFO)

LanguageCode = Literal["vi", "ko"]

# Map our internal codes to the BCP-47 locales used by the Web Speech API
# (SpeechRecognition + SpeechSynthesis) in the browser.
BCP47: dict[str, str] = {
    "vi": "vi-VN",
    "ko": "ko-KR",
}

HUMAN_NAME: dict[str, str] = {
    "vi": "Vietnamese",
    "ko": "Korean",
}

# Server-side whitelist of allowed Gemini models. The frontend's model selector
# sends one of these ids; anything else is rejected so callers can't aim the
# proxy at arbitrary endpoints.
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
    # Optional conversational hint that the model can use to disambiguate
    # casual / daily-conversation phrasing. Formal is the default because this
    # tool is aimed at workplace accounting and manufacturing communication.
    style: Literal["casual", "formal"] = "formal"
    # Optional free-form context describing the situation / domain (e.g.
    # "Phong ke toan tai chinh, cong ty Han Quoc"). Passed to Gemini so it
    # picks domain-appropriate vocabulary.
    context: str | None = Field(default=None, max_length=2000)
    # Optional glossary text where each line maps a source-language term to its
    # preferred target-language equivalent. Format is intentionally loose so
    # the user can paste anything readable; Gemini interprets it.
    glossary: str | None = Field(default=None, max_length=4000)
    # Optional per-request model override. Must be in ALLOWED_MODELS.
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
    title="VN <-> KR LED Chip & Accounting Translator",
    version="0.2.0",
    description=(
        "Local backend that proxies Gemini for Vietnamese <-> Korean "
        "translation, tuned for LED chip manufacturing and accounting "
        "communication. Designed to be paired with the frontend in ../frontend."
    ),
)

# In dev the frontend runs on a separate origin (Vite on :5173). We allow any
# localhost origin so this also works for Electron / Tauri / file:// embeds.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _default_model() -> str:
    return os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")


def _translator(model: str | None = None) -> GeminiTranslator:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "GEMINI_API_KEY is not configured on the backend. "
                "Set it in backend/.env or export it before starting the server."
            ),
        )
    chosen = model or _default_model()
    try:
        return GeminiTranslator(api_key=api_key, model=chosen)
    except Exception as exc:  # noqa: BLE001 — surface SDK init failures as 503
        raise HTTPException(
            status_code=503,
            detail=f"Failed to initialize Gemini client: {exc}",
        ) from exc


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Surface any uncaught exception as JSON so the frontend can show the message.

    Without this handler, FastAPI returns a plain "Internal Server Error" body
    on a 500 which is not useful for debugging from the UI.
    """
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": f"{type(exc).__name__}: {exc}"},
    )


@app.get("/healthz")
def healthz() -> dict[str, object]:
    return {
        "status": "ok",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "model": _default_model(),
    }


@app.get("/models", response_model=ModelsResponse)
def models() -> ModelsResponse:
    return ModelsResponse(default=_default_model(), models=ALLOWED_MODELS)


@app.get("/diag")
def diag() -> dict[str, object]:
    """End-to-end probe: tries a tiny Gemini call and returns the raw outcome.

    Useful for distinguishing between "env not loaded", "bad API key",
    "model name wrong", and "network blocked" when /translate returns 500.
    """
    try:
        translator = _translator()
    except HTTPException as http_exc:
        return {"ok": False, "stage": "init", "detail": http_exc.detail}

    try:
        result = translator.translate(
            text="hello",
            source="English",
            target="Vietnamese",
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
def translate(req: TranslateRequest) -> TranslateResponse:
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
    translator = _translator(chosen_model)
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
