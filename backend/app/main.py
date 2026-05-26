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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    source: LanguageCode
    target: LanguageCode
    # Optional conversational hint that the model can use to disambiguate
    # casual / daily-conversation phrasing.
    style: Literal["casual", "formal"] = "casual"


class TranslateResponse(BaseModel):
    translation: str
    source: LanguageCode
    target: LanguageCode
    romanization: str | None = None
    note: str | None = None


class LanguagesResponse(BaseModel):
    languages: dict[str, dict[str, str]]


app = FastAPI(
    title="VN <-> KR Realtime Translator",
    version="0.1.0",
    description=(
        "Local backend that proxies Gemini for Vietnamese <-> Korean "
        "translation. Designed to be paired with the frontend in ../frontend."
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


def _translator() -> GeminiTranslator:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "GEMINI_API_KEY is not configured on the backend. "
                "Set it in backend/.env or export it before starting the server."
            ),
        )
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
    return GeminiTranslator(api_key=api_key, model=model)


@app.get("/healthz")
def healthz() -> dict[str, object]:
    return {
        "status": "ok",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "model": os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
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

    translator = _translator()
    try:
        result = translator.translate(
            text=req.text,
            source=HUMAN_NAME[req.source],
            target=HUMAN_NAME[req.target],
            style=req.style,
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
    )
