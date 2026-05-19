# gemini-media-tool

Chatbot web app giúp viết **prompt** tạo quảng cáo video 8 giây cho Shopee Affiliate, với khả năng giữ **nhân vật đồng nhất** xuyên suốt nhiều video.

> Ứng dụng chỉ sinh ra **prompt** (text). Bạn copy prompt qua các tool bên ngoài (Imagen / Gemini Image, Veo / Runway / Kling / Pika…) để tạo ảnh và video thực tế.

## Tính năng

- **Project**: mỗi project = 1 chiến dịch (1 nhân vật, nhiều sản phẩm, nhiều video).
- **Character Studio**: nhập mô tả nhân vật → AI sinh ra **consistency anchor** (đoạn mô tả chuẩn để dán vào MỌI prompt sau này) + prompt ảnh nhân vật gốc.
- **Storyboard Studio**: chọn nhân vật + sản phẩm → AI sinh storyboard 8s gồm:
  - Prompt ảnh nhân vật trong bối cảnh
  - Prompt ghép sản phẩm vào ảnh
  - Prompt video (chuyển động 8 giây)
  - Negative prompt
  - Caption + CTA có sẵn link affiliate Shopee
- **Variants**: 1 click tạo nhiều phiên bản khác nhau cho cùng nhân vật + sản phẩm.
- **Chat**: hỏi đáp tự do với AI (giữ context theo project).
- **Affiliate**: lưu sản phẩm Shopee + link affiliate, auto-chèn vào CTA.
- **BYOK**: bring-your-own Gemini API key (lưu ở `localStorage`, gửi qua header `X-Gemini-Api-Key`). Lấy key miễn phí ở <https://aistudio.google.com/apikey>.

## Tech stack

- **Backend**: FastAPI + SQLite (aiosqlite) + `google-genai` SDK.
- **Frontend**: React 19 + Vite + TypeScript + TailwindCSS + shadcn/ui.

## Chạy local

### Backend

```bash
cd backend
poetry install
cp .env.example .env   # (tuỳ chọn) gán GEMINI_API_KEY mặc định cho server
poetry run fastapi dev app/main.py
```

Backend chạy ở `http://localhost:8000`. Health check: `GET /healthz`.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env   # sửa VITE_API_BASE_URL nếu cần
npm run dev
```

Frontend chạy ở `http://localhost:5173`. Mở app → bấm **Cài đặt** ở góc trên phải → dán Gemini API key.

## Flow sử dụng

1. Tạo project (vd. "Quảng cáo son môi A").
2. Vào **Nhân vật** → tả nhân vật (vd. "nữ 25 tuổi, da trắng, tóc dài đen, style Hàn Quốc") → bấm tạo. AI trả về consistency anchor + prompt ảnh gốc → copy sang Imagen / Gemini Image / Midjourney để tạo ảnh nhân vật.
3. Vào **Affiliate** → thêm sản phẩm Shopee + link affiliate.
4. Vào **Storyboard** → chọn nhân vật + sản phẩm → mô tả scenario (vd. "girl reviewing son trong quán cafe") → bấm tạo. AI trả storyboard 4 prompt.
5. Copy từng prompt sang tool tương ứng (ảnh → Imagen, ghép sản phẩm → image-to-image, video → Veo/Runway/Kling).
6. Lưu storyboard vào **Video** để dùng lại / xuất hàng loạt.

## API chính

- `POST /api/projects` · `GET/DELETE /api/projects/{id}`
- `POST /api/projects/{id}/characters` · `POST /api/generate/character`
- `POST /api/projects/{id}/products`
- `POST /api/generate/storyboard` · `POST /api/generate/variants`
- `POST /api/projects/{id}/chat`
- `POST /api/projects/{id}/videos`

Tất cả endpoint cần Gemini đều đọc API key từ header `X-Gemini-Api-Key` (BYOK) hoặc fallback về env `GEMINI_API_KEY`.

## License

MIT.
