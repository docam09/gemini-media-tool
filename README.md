# Facebook Comment Suggestion Tool

Human-in-the-loop web app that helps draft Facebook comments without posting
automatically. You paste a post URL and/or post text, choose the tone and
language, then Gemini generates comment suggestions for you to review, copy, and
post manually.

This project intentionally does **not** crawl friend feeds or auto-post comments.
Meta Graph API access to personal friends' posts is restricted, and automated
commenting can violate platform rules. The app keeps the user in control of the
final comment.

## Features

- Paste Facebook post text or a post URL as context.
- Generate 3-5 comment suggestions with Gemini.
- Configure language, tone, relationship context, and extra guidance.
- Copy a suggested comment or open the post in Facebook to comment manually.
- FastAPI backend with a health check and typed request/response models.
- React + TypeScript frontend.

## Requirements

- Python 3.12+
- Poetry 1.8+
- Node.js 22+
- `GEMINI_API_KEY` environment variable

## Backend

```bash
cd backend
poetry install
export GEMINI_API_KEY="your-key"
poetry run fastapi dev app/main.py
```

Backend runs on `http://localhost:8000`.

Useful endpoints:

- `GET /healthz`
- `POST /api/comment-suggestions`

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173` and proxies API calls to the backend.

## Development checks

```bash
(cd backend && poetry run pytest)
(cd frontend && npm run lint)
(cd frontend && npm run build)
```

## Facebook/Meta compliance note

For personal Facebook profiles, Meta Graph API does not provide broad access to
friends' feed posts for third-party apps. This app supports a compliant workflow:
the user provides the post context, Gemini drafts suggestions, and the user
manually decides whether to post. If you later want Page automation, it should be
implemented only for Pages/assets you administer and with Meta-approved
permissions.