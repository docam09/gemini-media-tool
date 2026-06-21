# Bộ công cụ: Dịch realtime + Theo dõi tiến độ nhóm

Ứng dụng có **2 tab** (chọn ở thanh trên cùng):

- **📊 Tiến độ nhóm** — theo dõi công việc của từng thành viên trong nhóm và
  xem biểu đồ mức độ hoàn thành (xem [Theo dõi tiến độ nhóm](#theo-dõi-tiến-độ-nhóm)).
- **🌐 Trình dịch** — dịch hội thoại Việt ↔ Hàn realtime (mô tả bên dưới).

## Theo dõi tiến độ nhóm

App theo dõi tiến độ công việc của các thành viên trong một nhóm:

- Thêm / xóa thành viên (kèm vai trò).
- Giao công việc cho từng người; cập nhật trạng thái (Chưa làm / Đang làm /
  Hoàn thành) và phần trăm tiến độ bằng thanh kéo.
- **Biểu đồ mức độ hoàn thành**: vòng tròn tổng quan của cả nhóm + thanh ngang
  cho từng thành viên, đổi màu theo mức độ.
- Dữ liệu lưu trong SQLite (`backend/progress.db`) nên không mất khi khởi động
  lại server. Không cần Gemini API key cho tab này.

API (backend FastAPI, đã mount sẵn):

| Method   | Endpoint                  | Mô tả                                   |
| -------- | ------------------------- | --------------------------------------- |
| `GET`    | `/progress/members`       | Danh sách thành viên kèm thống kê       |
| `POST`   | `/progress/members`       | Thêm thành viên `{name, role}`          |
| `DELETE` | `/progress/members/{id}`  | Xóa thành viên (và các việc của họ)     |
| `GET`    | `/progress/tasks`         | Danh sách công việc (lọc `?member_id=`) |
| `POST`   | `/progress/tasks`         | Thêm công việc                          |
| `PATCH`  | `/progress/tasks/{id}`    | Cập nhật trạng thái / tiến độ           |
| `DELETE` | `/progress/tasks/{id}`    | Xóa công việc                           |
| `GET`    | `/progress/summary`       | Tổng hợp % hoàn thành theo người + nhóm |

Cách chạy giống hệt phần dưới (backend `:8000` + frontend `:5173`).

### Chạy nhanh trên Windows (1 chạm)

Sau khi đã cài Git, Node.js và Python 3.11, chỉ cần **nhấp đúp `start.bat`**
ở thư mục gốc dự án. Script tự tạo môi trường Python, cài dependencies (lần
đầu), mở 2 cửa sổ chạy backend + frontend rồi mở trình duyệt tới
`http://localhost:5173/`. Giữ nguyên 2 cửa sổ đó trong lúc dùng app.

---

# Việt ↔ Hàn Realtime Translator

Ứng dụng dịch hội thoại hằng ngày song ngữ **Tiếng Việt ↔ 한국어**, chạy local
trên máy bạn. Backend gọi Google Gemini cho phần dịch, frontend dùng Web Speech
API của Chrome cho nhận dạng giọng nói (STT) và đọc kết quả (TTS) — không cần
trả thêm phí cho dịch vụ TTS/STT.

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
- Hiển thị phiên âm (Revised Romanization) khi dịch sang tiếng Hàn — hữu ích
  khi học
- Chuyển nhanh giữa phong cách **Thân mật** và **Lịch sự**
- Lịch sử 30 câu gần nhất, có nút phát lại
- Chạy hoàn toàn local trên máy bạn (chỉ gọi Gemini ra ngoài)

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

1. Chọn hướng dịch (VI → KO hoặc KO → VI) bằng các nút phía trên.
2. Nhấn **🎤 Nói** rồi nói vào mic — câu sẽ tự động được dịch khi bạn dừng nói.
   Hoặc gõ trực tiếp và bấm **Dịch →**.
3. Bật **Tự đọc kết quả** để nghe phát âm câu dịch ngay.
4. Khi dịch sang tiếng Hàn, dòng phiên âm (vd. `annyeong, jal jinae?`) sẽ hiện
   bên dưới để bạn tập đọc theo.
5. Bấm nút **↕** để đảo chiều và dùng câu vừa dịch làm input mới — tiện cho
   hội thoại qua lại.

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
  -d '{"text":"Xin chào","source":"vi","target":"ko","style":"casual"}'
# {"translation":"안녕","romanization":"annyeong","note":null,...}
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
