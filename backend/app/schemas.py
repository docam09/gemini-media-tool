from pydantic import BaseModel, Field, HttpUrl, model_validator


class CommentSuggestionRequest(BaseModel):
    post_text: str = Field(default="", max_length=5000)
    post_url: HttpUrl | None = None
    tone: str = Field(default="friendly", max_length=60)
    language: str = Field(default="Vietnamese", max_length=60)
    relationship_context: str = Field(default="", max_length=500)
    extra_guidance: str = Field(default="", max_length=1000)
    suggestion_count: int = Field(default=3, ge=1, le=5)

    @model_validator(mode="after")
    def require_post_context(self) -> "CommentSuggestionRequest":
        if not self.post_text.strip() and self.post_url is None:
            raise ValueError("Provide post text or a post URL for context.")
        return self


class CommentSuggestion(BaseModel):
    text: str
    rationale: str


class CommentSuggestionResponse(BaseModel):
    suggestions: list[CommentSuggestion]
    safety_note: str


class UrlContextResponse(BaseModel):
    extracted_text: str
    source: str
    note: str


class MediaAnalysisResponse(BaseModel):
    extracted_text: str
    note: str
