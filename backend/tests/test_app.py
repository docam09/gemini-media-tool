from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_healthz() -> None:
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_comment_suggestions_requires_context() -> None:
    response = client.post("/api/comment-suggestions", json={})

    assert response.status_code == 422


def test_media_context_requires_image_or_video() -> None:
    response = client.post(
        "/api/media-context",
        files={"file": ("post.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
