"""Thin wrapper around the google-genai SDK.

Supports a BYOK (bring-your-own-key) pattern: the caller can pass an
API key per-request via the `X-Gemini-Api-Key` HTTP header, otherwise
the server falls back to the `GEMINI_API_KEY` env var.
"""

from __future__ import annotations

import json
import re
from typing import Any

from fastapi import HTTPException
from google import genai
from google.genai import types

from .config import settings


def _resolve_api_key(api_key: str | None) -> str:
    key = (api_key or settings.gemini_api_key or "").strip()
    if not key:
        raise HTTPException(
            status_code=400,
            detail=(
                "Thiếu Gemini API key. Hãy vào trang Cài đặt trên frontend "
                "để nhập key (header X-Gemini-Api-Key) hoặc đặt biến môi trường "
                "GEMINI_API_KEY trên server."
            ),
        )
    return key


def _make_client(api_key: str | None) -> genai.Client:
    key = _resolve_api_key(api_key)
    return genai.Client(api_key=key)


_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _extract_json(text: str) -> dict[str, Any]:
    cleaned = _JSON_FENCE.sub("", text or "").strip()
    if not cleaned:
        raise HTTPException(status_code=502, detail="Gemini trả về rỗng.")
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Gemini trả về JSON không hợp lệ: {exc}",
                )
        raise HTTPException(
            status_code=502,
            detail="Gemini trả về nội dung không phải JSON.",
        )


async def generate_json(
    *,
    api_key: str | None,
    system_prompt: str,
    user_prompt: str,
    model: str | None = None,
    temperature: float = 0.7,
) -> dict[str, Any]:
    client = _make_client(api_key)
    model_name = model or settings.gemini_model
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=temperature,
        response_mime_type="application/json",
    )
    try:
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=user_prompt,
            config=config,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Gemini lỗi: {exc}") from exc
    text = (response.text or "").strip()
    return _extract_json(text)


async def generate_text(
    *,
    api_key: str | None,
    system_prompt: str | None,
    history: list[dict[str, str]],
    user_message: str,
    model: str | None = None,
    temperature: float = 0.8,
) -> str:
    client = _make_client(api_key)
    model_name = model or settings.gemini_model

    contents: list[types.Content] = []
    for turn in history:
        role = "user" if turn.get("role") == "user" else "model"
        text = turn.get("content", "")
        if not text:
            continue
        contents.append(types.Content(role=role, parts=[types.Part(text=text)]))
    contents.append(types.Content(role="user", parts=[types.Part(text=user_message)]))

    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=temperature,
    )
    try:
        response = await client.aio.models.generate_content(
            model=model_name,
            contents=contents,
            config=config,
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Gemini lỗi: {exc}") from exc
    return (response.text or "").strip()
