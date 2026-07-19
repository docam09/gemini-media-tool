# Việt ↔ Hàn: LED Chip · Kế toán

Ứng dụng dịch song ngữ **Tiếng Việt ↔ 한국어** chuyên ngành cho **phòng kế toán
và sản xuất chip LED**, chạy local trên máy bạn. Backend gọi Google Gemini cho
phần dịch chuyên ngành, frontend dùng Web Speech API của Chrome cho nhận dạng
giọng nói (STT) và đọc kết quả (TTS) — không cần trả thêm phí cho dịch vụ
TTS/STT.

```
┌────────────────────┐       ┌──────────────────────┐       ┌────────────┐
│  Chrome (frontend) │ ───── │  FastAPI (backend)   │ ───── │  Gemini    │
│  Web Speech STT/TTS│       │  /translate proxy    │       │  2.5 Flash │
└────────────────────┘       └──────────────────────┘       └────────────┘
        :5173                          :8000
```

## Tính năng

- Dịch hai chiều VI ↔ KO theo thời gian thực
- Nhập bằng giọng nói (mic) hoặc gõ text
- Đọc to kết quả bằng giọng bản ngữ của hệ điều hành
- Hiển thị phiên âm (Revised Romanization) khi dịch sang tiếng Hàn
- Chuyển nhanh giữa phong cách **Lịch sự** (mặc định) và **Thân mật**
- Bối cảnh và từ điển công ty mặc định cho ngành kế toán / sản xuất chip LED
- Lịch sử 30 câu gần nhất, có nút phát lại
- Chạy hoàn toàn local trên máy bạn (chỉ gọi Gemini ra ngoài)

## Yêu cầu

- Python 3.10+ và [Poetry](https://python-poetry.org/)
- Node.js 20+ và npm
- Một Gemini API key (lấy miễn phí: <https://aistudio.google.com/apikey>)
- **Chrome / Edge** (Firefox/Safari không hỗ trợ Web Speech Recognition đầy đủ)

## Cài đặt

### macOS / Linux (Poetry)

```bash
# Backend
cd backend
poetry install
cp .env.example .env   # rồi điền GEMINI_API_KEY

# Frontend
cd ../frontend
npm install
```

### Windows PowerShell (không cần Poetry — pip + venv)

```powershell
# Backend
cd backend
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
"GEMINI_API_KEY=<key của bạn>" | Out-File -Encoding utf8 .env

# Frontend (PowerShell mới)
cd frontend
npm install
```

Nếu PowerShell báo chặn script, chạy 1 lần: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`.

## Chạy

Trong 2 terminal riêng:

```bash
# Terminal 1 — backend trên :8000
cd backend
poetry run fastapi dev app/main.py    # hoặc trên Windows: fastapi dev app/main.py (sau khi đã activate .venv)

# Terminal 2 — frontend trên :5173
cd frontend
npm run dev
```

Mở <http://localhost:5173>. Frontend Vite tự proxy `/api/*` về backend nên
không phải lo CORS hay cấu hình thêm.

## Khắc phục sự cố

Nếu Dịch trả lỗi, gọi endpoint chẩn đoán:

```bash
curl http://localhost:8000/diag
```

Kết quả sẽ chỉ rõ giai đoạn nào hỏng:
- `{"ok": false, "stage": "init"}` → chưa nạp được `GEMINI_API_KEY`. Kiểm tra `backend/.env` hoặc biến môi trường.
- `{"ok": false, "stage": "gemini", "detail": "...404..."}` → tên model sai. Đổi `GEMINI_MODEL` trong `.env`, vd. `gemini-2.5-flash`.
- `{"ok": false, "stage": "gemini", "detail": "...PERMISSION_DENIED..."}` → key chưa được kích hoạt Gemini API hoặc bị giới hạn vùng.
- `{"ok": true, ...}` → backend OK, vấn đề có thể ở frontend.

## Sử dụng

1. Chọn hướng dịch (VI → KO hoặc KO → VI) bằng các nút phía trên.
2. Nhấn **🎤 Nói** rồi nói vào mic — câu sẽ tự động được dịch khi bạn dừng nói.
   Hoặc gõ trực tiếp và bấm **Dịch →**.
3. Bật **Tự đọc kết quả** để nghe phát âm câu dịch ngay.
4. Khi dịch sang tiếng Hàn, dòng phiên âm (vd. `jangjeo jepum-ui gaekkeum-eun...`) sẽ hiện
   bên dưới để bạn tập đọc theo.
5. Bấm nút **↕** để đảo chiều và dùng câu vừa dịch làm input mới — tiện cho
   hội thoại qua lại.
6. Phần **Nâng cao** đã được điền sẵn bối cảnh ngành và từ điển công ty. Bạn có thể
   chỉnh sửa hoặc xóa theo nhu cầu.

## Cấu hình

Backend đọc các biến môi trường sau (từ `backend/.env` hoặc shell):

| Biến             | Mặc định           | Mô tả                              |
| ---------------- | ------------------ | ---------------------------------- |
| `GEMINI_API_KEY` | _(bắt buộc)_       | Key từ Google AI Studio            |
| `GEMINI_MODEL`   | `gemini-2.5-flash` | Có thể đổi sang `gemini-2.5-pro`…  |

## Kiểm tra nhanh

```bash
curl http://localhost:8000/healthz
# {"status":"ok","gemini_configured":true,"model":"gemini-2.5-flash"}

curl -X POST http://localhost:8000/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Vui lòng gửi bảng kê chi phí nguyên vật liệu LED tháng này","source":"vi","target":"ko","style":"formal"}'
# {"translation":"...","romanization":"...","note":null,...}
```

## Lệnh hay dùng

```bash
# Backend
(cd backend && poetry run ruff check .)

# Frontend
(cd frontend && npm run lint)
(cd frontend && npm run build)   # gồm cả tsc -b
```

## Cấu trúc thư mục

```
backend/
  app/
    main.py     # FastAPI app + endpoints
    gemini.py   # Wrapper gọi Gemini, parse JSON response
  pyproject.toml
  .env.example
frontend/
  src/
    App.tsx     # UI chính
    api.ts      # Gọi backend
    speech.ts   # Web Speech API wrappers (STT + TTS)
    types.ts
    styles.css
  vite.config.ts
  package.json
```
