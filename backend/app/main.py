from pydantic import HttpUrl

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.config import Settings, get_settings
from app.gemini_service import GeminiCommentService
from app.schemas import (
    CommentSuggestionRequest,
    CommentSuggestionResponse,
    MediaAnalysisResponse,
    UrlContextResponse,
)
from app.url_reader import read_public_url

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


@app.get("/api/url-context")
async def read_url_context(url: HttpUrl) -> UrlContextResponse:
    try:
        extracted_text = await read_public_url(url)
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "Could not read public metadata from this URL. Private Facebook posts "
                "usually require you to upload a screenshot/image/video instead."
            ),
        ) from exc

    if not extracted_text:
        raise HTTPException(
            status_code=422,
            detail=(
                "No readable public metadata found. Upload a screenshot/image/video "
                "or paste the post text."
            ),
        )

    return UrlContextResponse(
        extracted_text=extracted_text,
        source=str(url),
        note=(
            "Only public metadata was read. The app does not bypass Facebook login "
            "or private post permissions."
        ),
    )


@app.post("/api/media-context")
async def analyze_media_context(
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> MediaAnalysisResponse:
    if not settings.gemini_api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured.")

    if not file.content_type or not (
        file.content_type.startswith("image/") or file.content_type.startswith("video/")
    ):
        raise HTTPException(status_code=400, detail="Upload an image or video file.")

    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File must be 20MB or smaller.")

    service = GeminiCommentService(
        api_key=settings.gemini_api_key,
        model=settings.gemini_model,
    )
    try:
        extracted_text = service.analyze_media(content, file.content_type)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail="Gemini could not analyze this media. Try a clearer screenshot.",
        ) from exc

    if not extracted_text:
        raise HTTPException(
            status_code=502,
            detail="No readable content was found in this media.",
        )

    return MediaAnalysisResponse(
        extracted_text=extracted_text,
        note="Media was analyzed only to help you draft a comment for manual review.",
    )
