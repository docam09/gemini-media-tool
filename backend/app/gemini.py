"""Thin wrapper around the Google Gemini API for VN <-> KR translation.

The wrapper asks Gemini to return strict JSON so the FastAPI layer can return
a structured response with optional romanization (Revised Romanization for
Korean text) — useful for Vietnamese learners reading Korean output.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


class TranslationError(RuntimeError):
    """Raised when Gemini fails to return a usable translation."""


@dataclass
class TranslationResult:
    translation: str
    romanization: str | None = None
    note: str | None = None


_SYSTEM_INSTRUCTION = (
    "You are a real-time interpreter for daily conversations between a "
    "Vietnamese speaker and a Korean speaker. Translate naturally as a fluent "
    "native speaker would say it in everyday conversation — not literally. "
    "Preserve tone, politeness level, and intent. Keep replies short and "
    "natural; never add commentary, apologies, or English unless the source "
    "already contains it. If the source is a single word, translate the single "
    "word. If the source is ambiguous, pick the most common everyday meaning. "
    "When the target language is Korean, ALWAYS fill the 'romanization' field "
    "with Revised Romanization of the translation. When the target is "
    "Vietnamese, leave 'romanization' as an empty string. The optional 'note' "
    "field, if used, MUST be written in Vietnamese and stay under one short "
    "sentence."
)


_JSON_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "translation": {
            "type": "string",
            "description": "Natural translation into the target language.",
        },
        "romanization": {
            "type": "string",
            "description": (
                "Romanization of the translation when the target is Korean "
                "(Revised Romanization). Empty string for Vietnamese targets."
            ),
        },
        "note": {
            "type": "string",
            "description": (
                "Optional short note (max 1 sentence) if the source was "
                "ambiguous or culturally loaded. Empty string otherwise."
            ),
        },
    },
    "required": ["translation"],
}


class GeminiTranslator:
    """Lightweight Gemini-backed translator."""

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash") -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model

    def translate(
        self,
        *,
        text: str,
        source: str,
        target: str,
        style: str = "casual",
    ) -> TranslationResult:
        prompt = (
            f"Translate from {source} to {target}. "
            f"Tone: {style} daily conversation.\n"
            f"Source ({source}):\n{text.strip()}"
        )

        try:
            response = self._client.models.generate_content(
                model=self._model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=_SYSTEM_INSTRUCTION,
                    temperature=0.2,
                    response_mime_type="application/json",
                    response_schema=_JSON_RESPONSE_SCHEMA,
                ),
            )
        except Exception as exc:  # noqa: BLE001 — surface any SDK error as TranslationError
            raise TranslationError(f"Gemini API call failed: {exc}") from exc

        raw = (response.text or "").strip()
        if not raw:
            raise TranslationError("Gemini returned an empty response")

        data = _parse_json(raw)
        translation = (data.get("translation") or "").strip()
        if not translation:
            raise TranslationError("Gemini response did not include a translation")

        romanization = (data.get("romanization") or "").strip() or None
        note = (data.get("note") or "").strip() or None
        return TranslationResult(translation=translation, romanization=romanization, note=note)


_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)


def _parse_json(raw: str) -> dict:
    """Parse Gemini's JSON response, tolerating stray prose or code fences."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = _JSON_BLOCK_RE.search(raw)
        if not match:
            raise TranslationError(f"Could not parse JSON from response: {raw!r}") from None
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError as exc:
            raise TranslationError(f"Could not parse JSON from response: {raw!r}") from exc
