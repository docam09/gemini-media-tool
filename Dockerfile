# ---- Stage 1: build the React frontend ----
FROM node:20-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: Python backend + static frontend ----
FROM python:3.12-slim AS backend
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend /app/frontend/dist ./frontend/dist

WORKDIR /app/backend
ENV PORT=8000
EXPOSE 8000

CMD uvicorn deploy_main:deploy_app --host 0.0.0.0 --port ${PORT}
