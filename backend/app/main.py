"""FastAPI backend for the Vietnamese <-> Korean realtime interpreter.

HTTP surface:

* ``GET  /healthz``          — liveness + configuration probe
* ``GET  /diag``             — end-to-end probe against the Gemini API
* ``GET  /languages``        — BCP-47 codes for the browser Web Speech API
* ``GET  /models``           — models the frontend may select
* ``GET  /presets``          — domain presets (context + glossary)
* ``POST /translate``        — translate, buffered
* ``POST /translate/stream`` — translate, streamed as Server-Sent Events
* ``POST /verify``           — back-translation check for important sentences
* ``POST /soniox/session``   — short-lived key + config for live speech translation
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from app import soniox
from app.cache import TranslationCache
from app.gemini import GeminiTranslator, TranslationError, Turn, clean_translation
from app.presets import DEFAULT_PRESET, PRESETS

load_dotenv()

logger = logging.getLogger("vn_kr_translator")
logging.basicConfig(level=logging.INFO)

LanguageCode = Literal["vi", "ko"]

BCP47: dict[str, str] = {"vi": "vi-VN", "ko": "ko-KR"}
HUMAN_NAME: dict[str, str] = {"vi": "Vietnamese", "ko": "Korean"}

# Server-side whitelist. Latencies are p50 for one spoken sentence measured
# from this backend with thinking disabled; they are what the labels promise.
ALLOWED_MODELS: dict[str, dict[str, str]] = {
    "gemini-2.5-flash-lite": {
        "label": "Nhanh nhất",
        "description": "~0,6s cho một câu. Mặc định — đủ chính xác cho hội thoại.",
    },
    "gemini-3.1-flash-lite": {
        "label": "Cân bằng",
        "description": "~0,8s. Tiếng Hàn trang trọng tự nhiên hơn Flash-Lite 2.5.",
    },
    "gemini-2.5-flash": {
        "label": "Chính xác",
        "description": "~1,0s. Chọn khi câu dài hoặc nhiều thuật ngữ.",
    },
    "gemini-3.5-flash": {
        "label": "Chính xác nhất",
        "description": "~1,4s. Dùng cho câu quan trọng: hợp đồng, số liệu, y tế.",
    },
}

DEFAULT_MODEL = "gemini-2.5-flash-lite"

# How many previous turns we forward as conversational context. Four keeps the
# prompt small enough not to hurt latency while still resolving the pronouns and
# dropped subjects that Korean and Vietnamese both rely on.
MAX_HISTORY_TURNS = 4

_cache = TranslationCache()


class HistoryTurn(BaseModel):
    source_text: str = Field(..., max_length=1000)
    target_text: str = Field(..., max_length=1000)


class TranslateRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    source: LanguageCode
    target: LanguageCode
    style: Literal["casual", "formal"] = "casual"
    context: str | None = Field(default=None, max_length=2000)
    glossary: str | None = Field(default=None, max_length=4000)
    model: str | None = None
    # Previous turns of the same conversation, oldest first.
    history: list[HistoryTurn] = Field(default_factory=list)


class TranslateResponse(BaseModel):
    translation: str
    source: LanguageCode
    target: LanguageCode
    note: str | None = None
    model: str
    cached: bool = False
    latency_ms: int


class VerifyRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)
    translation: str = Field(..., min_length=1, max_length=4000)
    source: LanguageCode
    target: LanguageCode
    model: str | None = None


class VerifyResponse(BaseModel):
    back_translation: str
    note: str | None = None
    model: str
    latency_ms: int


class LanguagesResponse(BaseModel):
    languages: dict[str, dict[str, str]]


class ModelsResponse(BaseModel):
    default: str
    models: dict[str, dict[str, str]]


class PresetInfo(BaseModel):
    label: str
    description: str
    context: str
    glossary: str


class PresetsResponse(BaseModel):
    default: str
    presets: dict[str, PresetInfo]


class SonioxSessionRequest(BaseModel):
    preset: str | None = None
    context: str | None = Field(default=None, max_length=2000)
    glossary: str | None = Field(default=None, max_length=4000)


class SonioxSessionResponse(BaseModel):
    api_key: str
    websocket_url: str
    expires_in_seconds: int
    config: dict[str, object]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Warm the Gemini connection so the first translation isn't the slow one."""
    if os.environ.get("GEMINI_API_KEY"):
        try:
            await asyncio.wait_for(
                GeminiTranslator(
                    api_key=os.environ["GEMINI_API_KEY"], model=_default_model()
                ).warm_up(),
                timeout=10,
            )
            logger.info("Gemini connection warmed up")
        except TimeoutError:
            logger.info("Gemini warm-up timed out; continuing")
        except Exception:  # noqa: BLE001 — warm-up must never block startup
            logger.info("Gemini warm-up failed; continuing", exc_info=True)
    yield


app = FastAPI(
    title="VN <-> KR Realtime Interpreter",
    version="0.2.0",
    description=(
        "Local backend that proxies Gemini for low-latency Vietnamese <-> Korean "
        "interpreting. Pair it with the frontend in ../frontend."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _default_model() -> str:
    configured = os.environ.get("GEMINI_MODEL", DEFAULT_MODEL)
    return configured if configured in ALLOWED_MODELS else DEFAULT_MODEL


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
    try:
        return GeminiTranslator(api_key=api_key, model=model or _default_model())
    except Exception as exc:  # noqa: BLE001 — surface SDK init failures as 503
        raise HTTPException(
            status_code=503, detail=f"Failed to initialize Gemini client: {exc}"
        ) from exc


def _validate(req: TranslateRequest | VerifyRequest) -> str:
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
    return req.model or _default_model()


def _cache_key(req: TranslateRequest, model: str) -> tuple[str, ...]:
    return (
        model,
        req.source,
        req.target,
        req.style,
        (req.context or "").strip(),
        (req.glossary or "").strip(),
        req.text.strip(),
    )


def _turns(req: TranslateRequest) -> list[Turn]:
    return [
        Turn(source_text=turn.source_text, target_text=turn.target_text)
        for turn in req.history[-MAX_HISTORY_TURNS:]
    ]


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": f"{type(exc).__name__}: {exc}"})


@app.get("/healthz")
def healthz() -> dict[str, object]:
    return {
        "status": "ok",
        "gemini_configured": bool(os.environ.get("GEMINI_API_KEY")),
        "soniox_configured": soniox.is_configured(),
        "model": _default_model(),
        "cache": _cache.stats(),
    }


@app.post("/soniox/session", response_model=SonioxSessionResponse)
async def soniox_session(req: SonioxSessionRequest) -> SonioxSessionResponse:
    """Mint a temporary Soniox key and the session config to use it with.

    The long-lived key stays here. The config is built server-side so the
    glossary the browser records against always matches the presets this
    backend serves.
    """
    try:
        key = await soniox.create_temporary_key(client_reference_id="vn-kr-interpreter")
    except soniox.SonioxNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except soniox.SonioxError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    config = soniox.build_session_config(
        preset=req.preset,
        context=req.context,
        glossary=req.glossary,
    )
    return SonioxSessionResponse(
        api_key=key,
        websocket_url=soniox.WEBSOCKET_URL,
        expires_in_seconds=soniox.KEY_TTL_SECONDS,
        config=config,
    )


@app.get("/models", response_model=ModelsResponse)
def models() -> ModelsResponse:
    return ModelsResponse(default=_default_model(), models=ALLOWED_MODELS)


@app.get("/presets", response_model=PresetsResponse)
def presets() -> PresetsResponse:
    return PresetsResponse(
        default=DEFAULT_PRESET,
        presets={key: PresetInfo(**value) for key, value in PRESETS.items()},
    )


@app.get("/languages", response_model=LanguagesResponse)
def languages() -> LanguagesResponse:
    return LanguagesResponse(
        languages={
            code: {"name": HUMAN_NAME[code], "bcp47": BCP47[code]} for code in ("vi", "ko")
        }
    )


@app.get("/diag")
async def diag() -> dict[str, object]:
    """Distinguish "env not loaded" from "bad key", "bad model" and "network blocked"."""
    try:
        translator = _translator()
    except HTTPException as http_exc:
        return {"ok": False, "stage": "init", "detail": http_exc.detail}

    started = time.perf_counter()
    try:
        result = await translator.translate(
            text="Xin chào, rất vui được gặp anh.",
            source="Vietnamese",
            target="Korean",
            style="formal",
        )
    except TranslationError as exc:
        return {"ok": False, "stage": "gemini", "detail": str(exc)}

    return {
        "ok": True,
        "model": translator.model,
        "sample": result.translation,
        "latency_ms": int((time.perf_counter() - started) * 1000),
    }


@app.post("/translate", response_model=TranslateResponse)
async def translate(req: TranslateRequest) -> TranslateResponse:
    model = _validate(req)
    started = time.perf_counter()

    key = _cache_key(req, model)
    hit = _cache.get(key)
    if hit is not None:
        return TranslateResponse(
            translation=hit,
            source=req.source,
            target=req.target,
            model=model,
            cached=True,
            latency_ms=int((time.perf_counter() - started) * 1000),
        )

    translator = _translator(model)
    try:
        result = await translator.translate(
            text=req.text,
            source=HUMAN_NAME[req.source],
            target=HUMAN_NAME[req.target],
            style=req.style,
            context=req.context,
            glossary=req.glossary,
            history=_turns(req),
        )
    except TranslationError as exc:
        logger.exception("Gemini translation failed")
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    _cache.put(key, result.translation)
    return TranslateResponse(
        translation=result.translation,
        source=req.source,
        target=req.target,
        note=result.note,
        model=model,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )


@app.post("/translate/stream")
async def translate_stream(req: TranslateRequest) -> StreamingResponse:
    """Stream the translation as SSE so text appears while the model is still writing.

    Events: ``delta`` (partial text), ``done`` (final payload), ``error``.
    """
    model = _validate(req)
    key = _cache_key(req, model)
    cached = _cache.get(key)
    translator = None if cached is not None else _translator(model)

    async def event_stream() -> AsyncIterator[str]:
        started = time.perf_counter()

        if cached is not None:
            yield _sse("delta", {"text": cached})
            yield _sse(
                "done",
                {
                    "translation": cached,
                    "model": model,
                    "cached": True,
                    "latency_ms": int((time.perf_counter() - started) * 1000),
                },
            )
            return

        assert translator is not None
        buffer: list[str] = []
        first_delta_ms: int | None = None
        try:
            async for delta in translator.translate_stream(
                text=req.text,
                source=HUMAN_NAME[req.source],
                target=HUMAN_NAME[req.target],
                style=req.style,
                context=req.context,
                glossary=req.glossary,
                history=_turns(req),
            ):
                if first_delta_ms is None:
                    first_delta_ms = int((time.perf_counter() - started) * 1000)
                buffer.append(delta)
                yield _sse("delta", {"text": delta})
        except TranslationError as exc:
            logger.warning("Streaming translation failed: %s", exc)
            yield _sse("error", {"detail": str(exc)})
            return
        except asyncio.CancelledError:
            raise

        translation = clean_translation("".join(buffer), source_text=req.text)
        if not translation:
            yield _sse("error", {"detail": "Gemini returned an empty translation"})
            return

        _cache.put(key, translation)
        yield _sse(
            "done",
            {
                "translation": translation,
                "model": model,
                "cached": False,
                "first_delta_ms": first_delta_ms,
                "latency_ms": int((time.perf_counter() - started) * 1000),
            },
        )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/verify", response_model=VerifyResponse)
async def verify(req: VerifyRequest) -> VerifyResponse:
    """Back-translate a result so the user can sanity-check an important sentence."""
    model = _validate(req)
    translator = _translator(model)
    started = time.perf_counter()
    try:
        back_translation, note = await asyncio.gather(
            translator.back_translate(
                translation=req.translation,
                source=HUMAN_NAME[req.source],
                target=HUMAN_NAME[req.target],
            ),
            translator.explain(
                text=req.text,
                translation=req.translation,
                source=HUMAN_NAME[req.source],
                target=HUMAN_NAME[req.target],
            ),
        )
    except TranslationError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return VerifyResponse(
        back_translation=back_translation,
        note=note,
        model=model,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )


def _sse(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
