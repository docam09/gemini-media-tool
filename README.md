# Việt ↔ Hàn Realtime Interpreter

Ứng dụng phiên dịch **Tiếng Việt ↔ 한국어** theo thời gian thực, chạy local trên
máy bạn, làm cho các tình huống đi công tác Hàn Quốc. Backend gọi Google Gemini
cho phần dịch, frontend dùng Web Speech API của Chrome cho nhận dạng giọng nói
(STT) và đọc kết quả (TTS) — không cần trả thêm phí cho dịch vụ TTS/STT.

```
┌────────────────────┐  SSE  ┌──────────────────────┐       ┌──────────────────┐
│  Chrome (frontend) │ ───── │  FastAPI (backend)   │ ───── │  Gemini          │
│  Web Speech STT/TTS│       │  stream + cache      │       │  Flash-Lite/Flash│
│  Romanization local│       │  presets + glossary  │       │  thinking = 0    │
└────────────────────┘       └──────────────────────┘       └──────────────────┘
        :5173                          :8000
```

## Tính năng

- **Hội thoại rảnh tay**: mic mở liên tục, mỗi câu nói xong là dịch ngay, tuỳ
  chọn tự đảo chiều sau mỗi lượt để hai người nói qua lại không cần bấm gì
- **Dịch theo dòng (streaming)**: chữ hiện sau ~0,3s thay vì chờ hết câu
- Bối cảnh sẵn có: bán dẫn/LED, họp công tác, tiệc tối, đi lại, y tế — mỗi
  bối cảnh nạp kèm từ điển thuật ngữ tương ứng
- Nhớ 4 lượt gần nhất làm ngữ cảnh, nên đại từ và câu hỏi tiếp nối dịch đúng
- Chọn cân bằng tốc độ/độ chính xác qua 4 model, kèm số ms thực đo hiển thị
- **Kiểm tra ngược**: dịch câu vừa ra trở lại ngôn ngữ gốc bằng model mạnh nhất
  để soát nghĩa trước khi nói câu quan trọng
- **Sổ tay offline**: ~55 câu công tác/khẩn cấp, có phiên âm, chạy không cần mạng
- Phiên âm Revised Romanization tính ngay trong trình duyệt (không tốn latency)
- Cài được như app (PWA): mở được cả khi máy bay / hết data roaming
- Lưu lịch sử, bối cảnh, từ điển, tốc độ đọc trong trình duyệt

## Tối ưu tốc độ

Số đo p50 cho một câu nói, từ backend này:

| Thay đổi                                        | Trước    | Sau      |
| ----------------------------------------------- | -------- | -------- |
| `thinking_budget=0` (gemini-2.5-flash)          | 2 848 ms | 1 061 ms |
| Bỏ JSON + phiên âm, chuyển sang stream text     | 1 150 ms | 570 ms   |
| Chữ đầu tiên hiện trên màn hình (streaming)     | 1 150 ms | ~300 ms  |
| Câu đã dịch trước đó (cache trong tiến trình)   | 570 ms   | 0 ms     |

Ngoài ra: client Gemini được dùng lại (giữ ấm kết nối TLS) thay vì tạo mới mỗi
request, và backend hâm nóng kết nối ngay khi khởi động.

## Yêu cầu

- Python 3.11+ và [Poetry](https://python-poetry.org/)
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
py -3.11 -m venv .venv
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

1. Chọn **Bối cảnh** đúng với việc đang làm (vd. *Bán dẫn / LED* khi họp kỹ
   thuật). Đây là thứ ảnh hưởng nhiều nhất tới độ chính xác thuật ngữ.
2. Chọn hướng dịch và phong cách (**Lịch sự** cho môi trường công việc).
3. Bấm **♾️ Hội thoại rảnh tay** rồi cứ nói bình thường — mỗi câu dừng lại là
   dịch và đọc ngay. Bật *Tự đổi chiều sau mỗi lượt* khi nói qua lại với người
   Hàn: sau khi máy đọc xong bản dịch, mic tự chuyển sang nghe tiếng Hàn.
   Mic tự tắt trong lúc máy đang đọc nên không nghe lại chính nó.
4. Cần một câu lẻ thì dùng **🎤 Nói** (bấm để nói, bấm lại để dịch), hoặc gõ tay.
5. Trước khi nói câu quan trọng (số liệu, hợp đồng, y tế), bấm **✓ Kiểm tra** —
   câu dịch sẽ được dịch ngược bằng model mạnh nhất để bạn soát nghĩa.
6. Tab **Sổ tay (offline)** có sẵn các câu dùng ngay, kèm phiên âm; bấm 🔊 để
   phát cho người đối diện nghe, hoặc ✎ để mở trong trình dịch và sửa.
7. Thêm thuật ngữ riêng của công ty ở **Nâng cao → Từ điển riêng**; các cặp từ
   này là bắt buộc, model không được dịch khác.

### Cài như app trên điện thoại

Build rồi mở qua HTTPS (hoặc `localhost`), sau đó *Add to Home screen*. Vỏ app
được service worker cache lại nên tab **Sổ tay** vẫn mở được khi mất mạng.

## Cấu hình

Backend đọc các biến môi trường sau (từ `backend/.env` hoặc shell):

| Biến             | Mặc định                | Mô tả                                     |
| ---------------- | ----------------------- | ----------------------------------------- |
| `GEMINI_API_KEY` | _(bắt buộc)_            | Key từ Google AI Studio                   |
| `GEMINI_MODEL`   | `gemini-2.5-flash-lite` | Phải là một model trong `GET /models`     |

## Kiểm tra nhanh

```bash
curl http://localhost:8000/healthz
# {"status":"ok","gemini_configured":true,"model":"gemini-2.5-flash-lite","cache":{...}}

curl -X POST http://localhost:8000/translate \
  -H 'Content-Type: application/json' \
  -d '{"text":"Xin chào","source":"vi","target":"ko","style":"casual"}'
# {"translation":"안녕","model":"gemini-2.5-flash-lite","cached":false,"latency_ms":412,...}

# Streaming (SSE) — deltas rồi tới event done
curl -N -X POST http://localhost:8000/translate/stream \
  -H 'Content-Type: application/json' \
  -d '{"text":"Tỷ lệ lỗi lô này là bao nhiêu?","source":"vi","target":"ko","style":"formal"}'

# Kiểm tra ngược một câu đã dịch
curl -X POST http://localhost:8000/verify \
  -H 'Content-Type: application/json' \
  -d '{"text":"Tỷ lệ lỗi là 2,3 phần trăm.","translation":"불량률은 2.3퍼센트입니다.","source":"vi","target":"ko"}'
```

## API

| Endpoint                 | Mô tả                                                |
| ------------------------ | ---------------------------------------------------- |
| `GET  /healthz`          | Trạng thái + đã có API key chưa + thống kê cache     |
| `GET  /diag`             | Gọi thật lên Gemini để khoanh vùng lỗi               |
| `GET  /languages`        | Mã BCP-47 cho Web Speech API                         |
| `GET  /models`           | Các model được phép chọn, kèm latency đo thực tế     |
| `GET  /presets`          | Bối cảnh + từ điển thuật ngữ theo lĩnh vực           |
| `POST /translate`        | Dịch, trả về một lần                                 |
| `POST /translate/stream` | Dịch, stream từng đoạn qua SSE                       |
| `POST /verify`           | Dịch ngược + ghi chú, để soát câu quan trọng         |
```

## Lệnh hay dùng

```bash
# Backend
(cd backend && poetry run ruff check .)

# Frontend
(cd frontend && npm run lint)
(cd frontend && npm run test)    # kiểm tra bộ phiên âm Hangul
(cd frontend && npm run build)   # gồm cả tsc -b
```

## Cấu trúc thư mục

```
backend/
  app/
    main.py      # FastAPI app + endpoints (buffered + SSE streaming)
    gemini.py    # Wrapper gọi Gemini (async, streaming, thinking = 0)
    presets.py   # Bối cảnh + từ điển thuật ngữ theo lĩnh vực
    cache.py     # LRU + TTL cache cho câu đã dịch
  pyproject.toml
  .env.example
frontend/
  public/
    manifest.webmanifest
    sw.js                # Cache vỏ app để dùng offline
  src/
    App.tsx              # UI chính, hàng đợi dịch, chế độ hội thoại
    components/
      Phrasebook.tsx     # Sổ tay offline
    api.ts               # Gọi backend (có SSE + abort)
    speech.ts            # Web Speech API wrappers (STT + TTS)
    romanize.ts          # Revised Romanization tính tại client
    romanize.test.ts
    phrasebook.ts        # Nội dung sổ tay
    types.ts
    styles.css
  vite.config.ts
  package.json
```
