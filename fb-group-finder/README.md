# FB Group Finder

Chrome Extension: mở một nhóm Facebook bạn đã tham gia → nhập yêu cầu (VD: "bài cho thuê phòng gần KCN Yên Phong dưới 3 triệu") → extension tự cuộn đọc bài, nhờ Gemini lọc và trả về danh sách bài phù hợp kèm link, tóm tắt và thông tin trích xuất.

Chạy hoàn toàn trên tab Facebook bạn đang đăng nhập, không lưu mật khẩu, không cần server.

## Cài đặt

1. Tải/clone repo này về máy.
2. Chrome → `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục repo.
3. Bấm icon extension → **Cài đặt** → dán Gemini API key (lấy tại https://aistudio.google.com/apikey) → Lưu.

## Dùng

1. Mở trang nhóm Facebook (`https://www.facebook.com/groups/...`).
2. Bấm icon extension, nhập yêu cầu, chọn số bài tối đa, bấm **Quét & lọc**.
3. Đợi extension cuộn đọc bài (giữ tab mở, đừng chuyển tab). Kết quả hiện trong popup: điểm phù hợp, tóm tắt, thông tin trích xuất, link **Mở bài viết**.
4. Có thể **Copy kết quả** hoặc **Tải CSV**.

Mẹo: dùng bộ lọc của Facebook (Bài viết mới nhất / tìm kiếm trong nhóm) trước rồi mới quét để tập trung vào bài liên quan.

## Lưu ý

- Facebook thay đổi giao diện thường xuyên; nếu quét không ra bài, mở issue kèm ảnh chụp cấu trúc trang để cập nhật selector trong `content.js`.
- Quét quá nhiều/quá nhanh có thể bị Facebook giới hạn tạm thời. Mặc định giới hạn 60 bài, 1.2s mỗi lần cuộn.
- Chỉ dùng cho dữ liệu bạn có quyền xem; tôn trọng điều khoản của Facebook và quyền riêng tư của thành viên nhóm.

## Cấu trúc

- `manifest.json` – MV3 manifest.
- `content.js` – cuộn feed, bung "Xem thêm", trích xuất bài (`author`, `time`, `text`, `url`).
- `background.js` – gọi Gemini (`generateContent`, JSON output, chia lô 25 bài) để chấm điểm/lọc/trích xuất.
- `popup.html/js` – giao diện nhập yêu cầu và hiển thị kết quả.
- `options.html/js` – lưu API key và model vào `chrome.storage.sync`.
