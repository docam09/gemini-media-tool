# Gemini Media Tool

Tool tao hinh anh va video su dung Gemini API (Imagen 4.0, Nano Banana, Veo 3.1).

## Tinh Nang

- **Tao hinh anh** tu van ban voi Imagen 4.0 (Fast/Generate/Ultra) va Nano Banana
- **Tao video** tu van ban voi Veo 3.1 (Generate/Fast)
- **Thu vien** xem lai tat ca hinh anh/video da tao
- **Lich su prompt** luu va tai su dung cac prompt cu
- **Tai xuong** hinh anh va video

## Cai Dat

### Yeu Cau
- Python 3.11+
- Node.js 18+
- Gemini API Key (lay tai https://aistudio.google.com/apikey)

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/Mac
pip install fastapi uvicorn google-genai python-multipart aiofiles pydantic pydantic-settings aiosqlite Pillow

# Tao file .env
cp .env.example .env
# Sua GEMINI_API_KEY trong file .env

# Chay server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Chay dev server
npm run dev
```

Truy cap http://localhost:3000 de su dung.

## Cau Truc Du An

```
gemini-media-tool/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py          # FastAPI endpoints
│   │   ├── config.py        # Cau hinh
│   │   ├── database.py      # SQLite database
│   │   ├── models.py        # Pydantic models
│   │   └── services.py      # Gemini API integration
│   ├── pyproject.toml
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx    # Layout chinh
│   │   │   ├── page.tsx      # Trang chu
│   │   │   ├── image/        # Trang tao hinh anh
│   │   │   ├── video/        # Trang tao video
│   │   │   ├── gallery/      # Thu vien
│   │   │   └── history/      # Lich su prompt
│   │   └── lib/
│   │       └── api.ts        # API client
│   └── package.json
└── README.md
```

## API Endpoints

| Method | Endpoint | Mo ta |
|--------|----------|-------|
| GET | `/api/health` | Kiem tra trang thai |
| GET | `/api/v1/models` | Danh sach models |
| POST | `/api/v1/images/generate` | Tao hinh anh |
| GET | `/api/v1/images/:id` | Xem ket qua hinh anh |
| POST | `/api/v1/videos/generate` | Tao video |
| GET | `/api/v1/videos/:id` | Xem ket qua video |
| GET | `/api/v1/gallery` | Thu vien |
| GET | `/api/v1/history` | Lich su prompt |
| GET | `/api/v1/download/image/:id` | Tai hinh anh |
| GET | `/api/v1/download/video/:id` | Tai video |

## Models Ho Tro

### Hinh Anh
- `imagen-4.0-generate-001` - Chat luong cao ($0.04/anh)
- `imagen-4.0-fast-001` - Toc do nhanh ($0.02/anh)
- `imagen-4.0-ultra-001` - Chat luong cao nhat ($0.06/anh)
- `gemini-2.5-flash-preview-image-generation` - Nano Banana

### Video
- `veo-3.1-generate-preview` - Chat luong cao ($0.40/giay)
- `veo-3.1-fast-preview` - Toc do nhanh ($0.15/giay)
