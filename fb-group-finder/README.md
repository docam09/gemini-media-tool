# FB Group Finder

Chrome Extension: mở một nhóm Facebook bạn đã tham gia → nhập yêu cầu (VD: "bài cho thuê phòng gần KCN Yên Phong dưới 3 triệu") → extension tự cuộn đọc bài, nhờ Gemini lọc và trả về danh sách bài phù hợp kèm link, tóm tắt và thông tin trích xuất.

Chạy hoàn toàn trên tab Facebook bạn đang đăng nhập, không lưu mật khẩu, không cần server.

## Cài đặt

1. Tải/clone repo này về máy.
2. Chrome → `chrome://extensions` → bật **Developer mode** → **Load unpacked** → chọn thư mục `fb-group-finder` chứa `manifest.json` (không chọn thư mục gốc của `gemini-media-tool`).
3. Bấm icon extension → **Cài đặt** → dán Gemini API key (lấy tại https://aistudio.google.com/apikey) → Lưu.

## Dùng

1. Mở trang nhóm Facebook (`https://www.facebook.com/groups/...`).
2. Bấm icon extension, nhập yêu cầu, chọn số bài tối đa, bấm **Quét & lọc**.
3. Đợi extension cuộn đọc bài (giữ tab mở, đừng chuyển tab). Kết quả hiện trong popup: điểm phù hợp, tóm tắt, thông tin trích xuất, link **Mở bài viết**.
4. Có thể **Copy kết quả** hoặc **Tải CSV**.

Mẹo: dùng bộ lọc của Facebook (Bài viết mới nhất / tìm kiếm trong nhóm) trước rồi mới quét để tập trung vào bài liên quan.

## Cập nhật từ bản cũ

1. Giải nén bản mới hoặc cập nhật mã nguồn.
2. Nếu dùng lại thư mục cũ: thay các tệp bằng bản mới, vào `chrome://extensions`, bấm **Tải lại / Reload** ở FB Group Finder.
3. Nếu chọn một thư mục mới: gỡ bản cũ rồi **Load unpacked** thư mục mới.
4. Kiểm tra phiên bản **0.2.3**. **Tải lại cả tab Facebook** để thay content script đang chạy, rồi quét lại.

Bản 0.1.1 đọc thêm FeedUnit, khối nội dung và thẻ bài không có `role="article"`; hỗ trợ link `pfbid`, `multi_permalinks`, `story.php`. Extension cuộn từng phần màn hình, chờ "Xem thêm" và thử lại khi feed đứng yên; không dừng chỉ vì chưa tìm được bài sau vài lượt.

### Bản 0.1.2: chẩn đoán lỗi không đọc được bài

Bản 0.1.1 vẫn có thể nhận diện khung nhưng không lấy được nội dung và link trên một số giao diện Facebook. Khi bộ đọc trả về 0 bài, Gemini chưa được gọi; đổi model không giải quyết lỗi ở bước này. Bản 0.1.2 bổ sung dữ liệu để xác định nguyên nhân, chưa xác nhận sửa được giao diện thực tế đang lỗi.

- **Tải chẩn đoán** hoạt động ngay khi mở popup, cả khi đang quét. Mở nhóm, cuộn tới một bài đang hiển thị, rồi bấm nút này và gửi file `fb-group-diagnostic.json` cho người hỗ trợ. Không cần API key hoặc chạy Gemini.
- Báo cáo gồm phiên bản, số vùng feed/khung bài, số link được chấp nhận, số vùng nội dung, nguyên nhân dừng và cấu trúc tối đa 3 khung (160 phần tử mỗi khung). Tên nhóm, nội dung bài, tên người đăng, URL, định danh trong thuộc tính và API key không được xuất. Link chỉ có dạng đường dẫn đã thay định danh bằng ký hiệu, không có link thực.
- Tiến trình hiển thị số khung thiếu link/nội dung. Các số khung là mức cao nhất quan sát trong một lượt, không phải tổng số bài trong nhóm. Báo cáo riêng ghi cấu trúc hiện tại và thông số lượt quét gần nhất.
- Giới hạn số bài từ **1 đến 300**; chọn **2** sẽ lấy tối đa 2 bài để lọc, với tối đa 6 lượt cuộn. Đây là số bài đọc, không phải số kết quả khớp yêu cầu. Nếu chưa đọc được bài nào sau 12 lượt cuộn, extension dừng và đề nghị chẩn đoán.
- Bấm **Dừng** để hủy quét, không gửi các bài đã đọc dở tới Gemini. Giữ popup mở tới khi hoàn tất; đóng popup sẽ làm mất bước nhận kết quả của lượt đó.
- Tab còn chạy content script cũ sẽ yêu cầu bấm F5 trước khi quét.

### Bản 0.1.3: khung bài không có `role="article"`

Báo cáo từ nhóm đang lỗi có 7 vùng nội dung nhưng 2 khung `article` đều rỗng và không có link được bộ đọc chấp nhận. Bộ đọc trước bỏ qua vùng nội dung nếu chưa tìm được permalink.

- Bỏ qua khung rỗng. Tìm ranh giới khung chứa một vùng nội dung, giữ khung đó ngay cả khi link chưa xuất hiện; không gộp nội dung các bài liền nhau.
- Khi khung chưa có permalink, gửi sự kiện `focusin` tới các link trước vùng nội dung và chờ Facebook cập nhật `href`. Mỗi phần tử chỉ được thử một lần trong lượt quét, tối đa 20 phần tử mỗi lượt cuộn. Không nhấp link, không chuyển trang và không đổi vị trí bàn phím đang focus. Đây là bước thử khôi phục link động, chưa được xác nhận trên giao diện thực tế của người dùng.
- Đọc cả link có `role="link"`. Chỉ đưa bài có link được xác thực vào Gemini; nếu Facebook vẫn không cung cấp permalink thì ghi rõ thiếu link.
- Chẩn đoán bổ sung các dạng link trong feed và mẫu link bên trong khung bài, kể cả khi cây cấu trúc bị cắt ở 160 phần tử. URL và định danh vẫn được ẩn. Nếu vẫn lỗi, bấm **Tải chẩn đoán** sau khi quét rồi gửi báo cáo mới.

Chỉ bài có nội dung chữ và link được đưa vào lọc. Extension không tự tìm tất cả các nhóm đã tham gia. Nội dung bài đọc được, ảnh trong bài, bình luận đang hiển thị và yêu cầu tìm kiếm được gửi tới Gemini để lọc (xem bản 0.2.0).

### Bản 0.1.4: Gemini báo 404 cho model cũ

Lỗi `models/gemini-2.5-flash is no longer available to new users` xuất hiện sau khi extension đã đọc được bài và gọi Gemini. Mặc định mới là `gemini-3.6-flash` theo hướng dẫn trong lỗi API và [tài liệu model](https://ai.google.dev/gemini-api/docs/models/gemini-3.6-flash).

- Cấu hình `gemini-2.5-flash` đã lưu tự chuyển sang `gemini-3.6-flash` khi lọc; không cần nhập lại API key. Model tùy chọn khác được giữ nguyên.
- Vẫn dùng `generateContent` và JSON output. Bỏ cấu hình `thinkingBudget: 0` dành cho model cũ để dùng cấu hình thinking mặc định của model.
- Cài đặt cho phép nhập mã model khác, kể cả dạng `models/<mã model>`. Nếu gặp 404, thông báo hướng dẫn đổi model. Không tự thử nhiều model hoặc chuyển sang Pro.

### Bản 0.2.0: đọc ảnh và bình luận

- **Ảnh trong bài**: lấy tối đa 4 ảnh mỗi bài từ `img` thuộc khung bài, chỉ nhận ảnh trên `*.fbcdn.net` (bỏ `static.*`, emoji, icon, `rsrc.php`), bỏ ảnh nhỏ hơn 100px (avatar), ảnh trong tiêu đề/nút và ảnh nằm trong bình luận; ảnh trùng URL chỉ lấy một lần. Service worker tải ảnh (quyền `https://*.fbcdn.net/*`, không gửi cookie), bỏ ảnh lỗi, không phải JPEG/PNG/WebP/GIF, lớn hơn 4 MB hoặc vượt 12 MB mỗi lô, rồi gửi kèm dạng `inlineData` có nhãn chỉ số bài. Lô có ảnh giảm còn 8 bài; lô chỉ chữ vẫn 25 bài. Popup báo số ảnh Gemini đã xem và số ảnh bỏ qua.
- **Bình luận đang hiển thị**: lấy tối đa 12 bình luận (kể cả phản hồi) từ các `article` có `aria-label` dạng “Bình luận của…”/“Comment by…” nằm trong khung bài; mỗi bình luận gồm tên (từ `aria-label`) và chữ, tối đa 600 ký tự, không lấy nút, link, ô nhập bình luận hay “Xem thêm bình luận”. Extension không tự mở thêm bình luận; chỉ đọc những gì Facebook đang hiển thị. Bình luận được gửi tách riêng khỏi nội dung bài; link kết quả vẫn là link bài gốc, không phải link bình luận.
- Gemini được yêu cầu ghi trong tóm tắt nếu thông tin lấy từ ảnh hoặc bình luận. Kết quả và CSV kèm số ảnh và danh sách bình luận đã đọc.
- Cài đặt có hai ô **Đọc ảnh trong bài** và **Đọc bình luận đang hiển thị** (mặc định bật). Tắt đọc ảnh để tiết kiệm token và thời gian.
- Chẩn đoán chỉ ghi số ảnh và số bình luận của mỗi khung, không ghi URL ảnh, tên hay nội dung bình luận.
- Đã gọi thử Gemini thực với ảnh bảng giá mô phỏng: model đọc được giá và số điện thoại trên ảnh. Cách nhận diện ảnh/bình luận trong DOM Facebook thực tế chưa được xác nhận; nếu popup báo 0 ảnh/0 bình luận trong khi bài có, bấm **Tải chẩn đoán** và gửi báo cáo.

### Bản 0.2.1: link bài dùng tên nhóm trong khi trang dùng số ID

Báo cáo chẩn đoán từ bản 0.2.0: 11 khung bài, mỗi khung đều có link `groups/<tên nhóm>/posts/<số>` nhưng bị từ chối vì trang đang mở là `groups/<số ID>/`; bộ đọc coi đó là nhóm khác nên báo "thiếu link" cho toàn bộ bài và dừng sau 12 lượt cuộn. Ảnh và bình luận trong các khung đã được nhận diện (4 ảnh, 2 bình luận mỗi khung mẫu).

- Một nhóm có thể được gọi bằng số ID hoặc tên rút gọn. Link bài được chấp nhận khi hai định danh trùng nhau, hoặc khi một bên là số và bên kia là tên. Hai số khác nhau hoặc hai tên khác nhau vẫn bị coi là nhóm khác.
- Chẩn đoán `sameGroup` dùng cùng quy tắc.

### Bản 0.2.2: kết quả được giữ lại khi đóng popup hoặc chuyển tab

Popup của Chrome bị đóng ngay khi bấm ra ngoài hoặc chuyển tab; trước đây toàn bộ lượt quét chạy trong popup nên vừa mất kết quả, vừa bỏ dở việc gọi Gemini.

- Lượt quét + lọc chạy trong service worker (`background.js`) và trạng thái được ghi vào `chrome.storage.local` (`job`: đang đọc / đang lọc / xong / lỗi, tiến trình, kết quả). Popup chỉ hiển thị trạng thái đó và cập nhật theo `storage.onChanged`, nên có thể đóng popup, chuyển tab rồi mở lại vẫn thấy tiến trình hoặc kết quả kèm câu hỏi và thời điểm.
- Nút **Xóa kết quả** xóa `job` đã lưu. Kết quả chỉ nằm trên máy người dùng và chỉ giữ một lượt quét gần nhất.
- Chỉ chạy một lượt quét tại một thời điểm; **Dừng** gửi yêu cầu dừng tới tab đang quét. Lượt quét không cập nhật trong 2 phút (trình duyệt khởi động lại, tab đóng) được coi là gián đoạn và cho phép quét lại.
- Service worker được giữ sống bằng cách ghi mốc thời gian mỗi 20 giây trong lúc quét; content script vẫn gửi tiến trình mỗi lượt cuộn.

### Bản 0.2.3: bài thuộc nhóm khác trên trang đang mở

Báo cáo chẩn đoán 0.2.2 cho thấy một trang `/groups/<số>/` hiển thị các bài mà mọi link (ảnh nhóm, tên nhóm, tác giả, permalink) đều trỏ tới một số ID nhóm khác, kèm các khung gợi ý "Nhóm"/"Người"; bộ đọc từ chối toàn bộ và báo 0 bài.

- Link bài được chấp nhận nếu cùng nhóm với trang (ưu tiên), hoặc nếu chính khung bài đó tự nêu tên nhóm của mình bằng link `/groups/<nhóm>/` hay `/groups/<nhóm>/user/…` trỏ tới đúng nhóm trong permalink. Link tới nhóm khác mà khung bài không nêu tên vẫn bị từ chối; bài chia sẻ vẫn lấy link của bài ngoài trước.
- Chẩn đoán ghi `foreignGroupPosts` và `pagePath` (dạng đường dẫn trang, không có ID) để nhận biết trang đang mở là gì.

## Kiểm tra mã nguồn

Không cần build hoặc cài npm để sử dụng extension. Bộ kiểm tra dành cho phát triển dùng Node.js 20+:

```sh
cd fb-group-finder
npm install
npm run lint
npm run typecheck
npm test
```

Kiểm thử dùng DOM giả lập, bao gồm feed tải chậm, bài không có `role="article"`, link bài, bình luận, cuộn từng màn hình và giới hạn quét. Đây không phải xác nhận tương thích với mọi giao diện Facebook; vẫn cần kiểm tra trên nhóm đang đăng nhập.

## Lưu ý

- Facebook thay đổi giao diện thường xuyên; nếu quét không ra bài, mở issue kèm ảnh chụp cấu trúc trang để cập nhật selector trong `content.js`.
- Quét quá nhiều/quá nhanh có thể bị Facebook giới hạn tạm thời. Mặc định giới hạn 60 bài, 1.2s mỗi lần cuộn.
- Chỉ dùng cho dữ liệu bạn có quyền xem; tôn trọng điều khoản của Facebook và quyền riêng tư của thành viên nhóm.

## Cấu trúc

- `manifest.json` – MV3 manifest.
- `content.js` – cuộn feed, bung "Xem thêm", trích xuất bài (`author`, `time`, `text`, `url`, `images`, `comments`).
- `background.js` – tải ảnh bài, gọi Gemini (`generateContent`, JSON output, chia lô 25 bài hoặc 8 bài khi có ảnh) để chấm điểm/lọc/trích xuất.
- `popup.html/js` – giao diện nhập yêu cầu và hiển thị kết quả.
- `options.html/js` – lưu API key, model và tuù chọn đọc ảnh/bình luận vào `chrome.storage.sync`.
