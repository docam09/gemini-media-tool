# One image serving both the API and the built frontend, so the deployed app is
# a single same-origin HTTPS host (required for microphone access).
FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
COPY --from=frontend /frontend/dist ./static

# Render (and most PaaS) inject the port to listen on.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.serve:app --host 0.0.0.0 --port ${PORT}"]
