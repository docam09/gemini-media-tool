import json

from google import genai
from google.genai import types

from app.schemas import CommentSuggestion, CommentSuggestionRequest


SYSTEM_INSTRUCTION = """
You draft Facebook comment suggestions for a human to review and post manually.
Do not claim the user performed actions they did not perform. Avoid spam,
harassment, manipulation, deception, political persuasion, and sensitive
personal-data inferences. Keep comments natural, respectful, concise, and
context-aware.
""".strip()


def build_prompt(request: CommentSuggestionRequest) -> str:
    post_context = request.post_text.strip() or (
        f"The user provided this Facebook post URL as context: {request.post_url}"
    )
    relationship = request.relationship_context.strip() or "Not specified"
    guidance = request.extra_guidance.strip() or "No extra guidance"

    return f"""
Generate {request.suggestion_count} distinct Facebook comment suggestions.

Post context:
{post_context}

Post URL:
{request.post_url or "Not provided"}

Desired language: {request.language}
Desired tone: {request.tone}
Relationship context: {relationship}
Extra guidance: {guidance}

Return JSON only using this exact shape:
{{
  "suggestions": [
    {{"text": "comment text", "rationale": "brief reason this fits"}}
  ]
}}
""".strip()


class GeminiCommentService:
    def __init__(self, api_key: str, model: str) -> None:
        self._client = genai.Client(api_key=api_key)
        self._model = model

    def generate(self, request: CommentSuggestionRequest) -> list[CommentSuggestion]:
        response = self._client.models.generate_content(
            model=self._model,
            contents=build_prompt(request),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                response_mime_type="application/json",
                temperature=0.7,
            ),
        )
        payload = json.loads(response.text or "{}")
        suggestions = payload.get("suggestions", [])
        return [CommentSuggestion.model_validate(item) for item in suggestions]

    def analyze_media(self, content: bytes, mime_type: str) -> str:
        response = self._client.models.generate_content(
            model=self._model,
            contents=[
                types.Part.from_bytes(data=content, mime_type=mime_type),
                (
                    "Extract readable text and summarize the visible context in this "
                    "Facebook post media. If it is a video, describe visible frames "
                    "and any readable text. Return concise Vietnamese text."
                ),
            ],
            config=types.GenerateContentConfig(
                system_instruction=(
                    "You help a user understand media they provided before drafting "
                    "a respectful Facebook comment."
                ),
                temperature=0.2,
            ),
        )
        return (response.text or "").strip()
