# Deploy lên Render (hướng dẫn tiếng Việt)

App này đã được chuẩn bị sẵn để deploy **1 service duy nhất** lên Render:
backend FastAPI phục vụ luôn frontend đã build, và mọi API nằm dưới `/api`
nên frontend gọi same-origin (không cần CORS, không cần 2 URL).

## Các file đã thêm/sửa
- `Dockerfile` — build frontend (Node 20) rồi gộp chung với backend (Python 3.12)
- `render.yaml` — Render Blueprint, tự đọc khi bạn kết nối repo
- `backend/deploy_main.py` — entrypoint: mount backend dưới `/api` + phục vụ `frontend/dist`
- `.dockerignore` — bỏ node_modules, dist, .env khỏi image

## Cách deploy (khoảng 2 phút)

1. **Đẩy repo lên GitHub** (nếu chưa có):
   ```bash
   git init && git add -A && git commit -m "deploy setup"
   git remote add origin https://github.com/<bạn>/gemini-media-tool.git
   git push -u origin main
   ```

2. **Vào Render** → https://dashboard.render.com → **New** → **Blueprint**
   → chọn repo vừa đẩy. Render tự đọc `render.yaml`.

3. Render sẽ tạo service và **hỏi nhập 2 biến môi trường** (bắt buộc):
   - `GEMINI_API_KEY` — key Google AI Studio (bắt buộc để dịch)
   - `SONIOX_API_KEY` — key Soniox (cho chế độ nói realtime hai chiều)
   - `GEMINI_MODEL` — đã có sẵn giá trị mặc định, có thể đổi

4. Bấm **Deploy**, chờ ~3–5 phút cho build. Xong bạn có URL dạng:
   `https://gemini-media-tool.onrender.com`

## Kiểm tra sau khi deploy
- Mở URL → thấy giao diện "Dịch song ngữ Việt ↔ Hàn"
- `https://<url>/api/healthz` → trả `{"status":"ok","gemini_configured":true,...}`

## Lưu ý
- **Free tier Render** sẽ "ngủ" sau ~15 phút không truy cập; lần mở lại đầu tiên
  mất vài chục giây để khởi động lại. Đây là điều bình thường.
- Nếu không có `SONIOX_API_KEY`, app vẫn chạy được chế độ gõ tay + Web Speech
  (chỉ cần Gemini). Chỉ chế độ nói realtime Soniox cần key đó.
