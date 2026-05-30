from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.gemini_service import GeminiCommentService
from app.schemas import CommentSuggestionRequest, CommentSuggestionResponse

app = FastAPI(title="Facebook Comment Suggestion Tool")

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/comment-suggestions")
def create_comment_suggestions(
    request: CommentSuggestionRequest,
    settings: Settings = Depends(get_settings),
) -> CommentSuggestionResponse:
    if not settings.gemini_api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured.")

    service = GeminiCommentService(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
    )
    try:
        suggestions = service.generate(request)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Gemini could not generate suggestions. Try again later.",
        ) from exc

    if not suggestions:
        raise HTTPException(
            status_code=502,
            detail="Gemini returned no suggestions. Try adding more post context.",
        )

    return CommentSuggestionResponse(
        suggestions=suggestions,
        safety_note=(
            "Review each suggestion before posting. This app never posts to Facebook "
            "automatically."
        ),
    )
