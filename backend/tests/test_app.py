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
