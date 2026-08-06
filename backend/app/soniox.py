"""Soniox real-time speech translation support.

Soniox streams transcription *and* translation over one WebSocket, in two-way
mode: it detects whether the speaker used Vietnamese or Korean and translates
into the other one, emitting translated tokens mid-sentence. That replaces the
browser's Web Speech API (Chrome-only, weak on Vietnamese) plus a round-trip to
Gemini for the spoken path.

The browser must never see the long-lived key, so this module mints short-lived
temporary keys and hands the client a ready-made session config — including the
glossary terms turned into Soniox context — so the two can never drift apart.
"""

from __future__ import annotations

import os
from typing import Literal, TypedDict

import httpx

from .presets import PRESETS

TEMPORARY_KEY_URL = "https://api.soniox.com/v1/auth/temporary-api-key"

WEBSOCKET_URL = "wss://stt-rt.soniox.com/transcribe-websocket"

DEFAULT_MODEL = "stt-rt-v5"

#: Long enough to open a stream after the user taps the button, short enough
#: that a leaked key is worthless.
KEY_TTL_SECONDS = 120

#: Soniox caps a single stream at 300 minutes; 60 is plenty for one meeting and
#: bounds the damage if a key is replayed.
MAX_SESSION_SECONDS = 3600

#: Soniox charges per audio token, so an accidentally open mic costs money.
#: Higher endpoint sensitivity also gives us tighter turn boundaries, which is
#: what makes the auto-flip interpreter feel natural.
MAX_ENDPOINT_DELAY_MS = 1200

LANGUAGE_A = "vi"
LANGUAGE_B = "ko"

#: Soniox context accepts a limited amount of guidance; sending the entire
#: glossary of every preset at once dilutes it.
MAX_TERMS = 120


class ContextTerm(TypedDict):
    source: str
    target: str


class GeneralEntry(TypedDict):
    key: str
    value: str


class SonioxContext(TypedDict, total=False):
    general: list[GeneralEntry]
    text: str
    terms: list[str]
    translation_terms: list[ContextTerm]


class TwoWayTranslation(TypedDict):
    type: Literal["two_way"]
    language_a: str
    language_b: str


class SessionConfig(TypedDict):
    """The config the browser passes straight to the Soniox WebSocket."""

    model: str
    audio_format: Literal["auto"]
    language_hints: list[str]
    enable_language_identification: bool
    enable_endpoint_detection: bool
    max_endpoint_delay_ms: int
    translation: TwoWayTranslation
    context: SonioxContext


class SonioxNotConfiguredError(RuntimeError):
    """Raised when no SONIOX_API_KEY is available."""


class SonioxError(RuntimeError):
    """Raised when Soniox rejects the request for a temporary key."""


def api_key() -> str | None:
    key = os.getenv("SONIOX_API_KEY", "").strip()
    return key or None


def is_configured() -> bool:
    return api_key() is not None


def model() -> str:
    return os.getenv("SONIOX_MODEL", "").strip() or DEFAULT_MODEL


def parse_glossary(glossary: str) -> list[tuple[str, str]]:
    """Parse ``vietnamese = korean`` lines into pairs, ignoring junk."""
    pairs: list[tuple[str, str]] = []
    for line in glossary.splitlines():
        head, separator, tail = line.partition("=")
        if not separator:
            continue
        source, target = head.strip(), tail.strip()
        if source and target:
            pairs.append((source, target))
    return pairs


def build_context(
    *,
    preset: str | None,
    context: str | None,
    glossary: str | None,
) -> SonioxContext:
    """Turn our preset/glossary model into Soniox's context object.

    Glossary pairs go in twice — once per direction — because the session is
    two-way and Soniox matches ``source`` against whatever was actually spoken.
    """
    entry = PRESETS.get(preset or "none")

    description = context or (entry["context"] if entry else "")
    raw_glossary = glossary if glossary is not None else (entry["glossary"] if entry else "")

    pairs = parse_glossary(raw_glossary or "")[:MAX_TERMS]

    built: SonioxContext = {}
    if entry and entry["label"] and preset not in (None, "none"):
        built["general"] = [{"key": "domain", "value": entry["label"]}]
    if description:
        built["text"] = description
    if pairs:
        # Feeding both sides as plain terms improves *recognition* of the jargon,
        # not just its translation.
        built["terms"] = [term for pair in pairs for term in pair]
        built["translation_terms"] = [
            *({"source": vi, "target": ko} for vi, ko in pairs),
            *({"source": ko, "target": vi} for vi, ko in pairs),
        ]
    return built


def build_session_config(
    *,
    preset: str | None,
    context: str | None,
    glossary: str | None,
) -> SessionConfig:
    return {
        "model": model(),
        "audio_format": "auto",
        "language_hints": [LANGUAGE_A, LANGUAGE_B],
        "enable_language_identification": True,
        "enable_endpoint_detection": True,
        "max_endpoint_delay_ms": MAX_ENDPOINT_DELAY_MS,
        "translation": {
            "type": "two_way",
            "language_a": LANGUAGE_A,
            "language_b": LANGUAGE_B,
        },
        "context": build_context(preset=preset, context=context, glossary=glossary),
    }


async def create_temporary_key(*, client_reference_id: str | None = None) -> str:
    """Mint a short-lived key the browser may use to open one stream."""
    key = api_key()
    if key is None:
        raise SonioxNotConfiguredError(
            "Chưa cấu hình SONIOX_API_KEY. Thêm vào backend/.env rồi khởi động lại server."
        )

    payload: dict[str, object] = {
        "usage_type": "transcribe_websocket",
        "expires_in_seconds": KEY_TTL_SECONDS,
        "max_session_duration_seconds": MAX_SESSION_SECONDS,
    }
    if client_reference_id:
        payload["client_reference_id"] = client_reference_id

    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            response = await http.post(
                TEMPORARY_KEY_URL,
                headers={"Authorization": f"Bearer {key}"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise SonioxError(f"Không gọi được Soniox: {exc}") from exc

    if response.status_code == 401:
        raise SonioxError("Soniox từ chối API key (401). Kiểm tra lại SONIOX_API_KEY.")
    if response.status_code == 402 or response.status_code == 429:
        raise SonioxError("Tài khoản Soniox hết hạn mức hoặc hết credit.")
    if response.status_code >= 400:
        raise SonioxError(f"Soniox trả lỗi {response.status_code}: {response.text[:200]}")

    temporary_key = response.json().get("api_key")
    if not isinstance(temporary_key, str) or not temporary_key:
        raise SonioxError("Soniox không trả về temporary api_key.")
    return temporary_key
