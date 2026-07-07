# Template Excel + VBA: Biểu đồ tăng trưởng theo quý

Tái tạo thiết kế slide trong Excel bằng VBA: mỗi quý một panel nền kem có thanh
cam trên đỉnh, hai cột gradient (xanh = năm trước, cam = năm sau), mũi tên cong
và con số % tăng trưởng so với cùng kỳ.

Biểu đồ được vẽ **hoàn toàn bằng Shapes** (không dùng chart engine của Excel),
vì chart gốc của Excel không hỗ trợ panel nền, cột bo tròn đầu hay mũi tên cong
— đúng theo cách slide mẫu được dựng bằng hình chữ nhật ghép trong PowerPoint.

## Cài đặt (1 lần)

1. Mở Excel, tạo workbook mới.
2. Nhấn `Alt + F11` để mở trình soạn VBA.
3. Menu **File → Import File…** → chọn `QuarterlyGrowthChart.bas`.
   (Hoặc: **Insert → Module** rồi dán toàn bộ nội dung file vào.)
4. Quay lại Excel, nhấn `Alt + F8`, chạy macro **`SetupTemplate`**.
   → Sheet `Du lieu` được tạo với bảng nhập liệu mẫu và nút **Tạo biểu đồ**.
5. Lưu file dưới định dạng **`.xlsm`** (Excel Macro-Enabled Workbook) để giữ macro.

> Nếu Excel chặn macro: **File → Options → Trust Center → Trust Center Settings
> → Macro Settings** → cho phép chạy macro, hoặc bấm **Enable Content** trên
> thanh cảnh báo vàng khi mở file.

## Sử dụng

1. Sửa số liệu trong bảng trên sheet `Du lieu`:

   | Quý   | Năm 2025 | Năm 2026 | Tăng trưởng | Xu hướng |
   |-------|----------|----------|-------------|----------|
   | Quý 1 | 3        | 4        | 30%         | TĂNG     |
   | Quý 2 | 2.5      | 3.5      | 40%         | TĂNG     |
   | Quý 3 | 3.5      | 2        | 25%         | GIẢM     |
   | Quý 4 | 3        | 4.5      | 45%         | TĂNG     |

   - Đổi tiêu đề cột **B3/C3** để đổi nhãn năm hiển thị ở chú giải.
   - Cột **Tăng trưởng** và **Xu hướng** có thể bỏ trống — macro tự tính:
     `% = |năm sau − năm trước| / năm trước`, xu hướng theo dấu chênh lệch.
   - Thêm/bớt dòng quý tùy ý (tối đa 12), macro tự dàn trang theo số quý.

2. Bấm nút **Tạo biểu đồ** (hoặc `Alt + F8` → `BuildChart`).
   → Biểu đồ được vẽ lại từ đầu trên sheet `Bieu do` (bản cũ tự xóa).

3. Muốn xuất ảnh: chọn toàn bộ shapes trên sheet `Bieu do`
   (`Ctrl + A` sau khi click một shape), copy rồi **Paste Special → Picture**,
   hoặc chụp/copy sang PowerPoint.

## Tùy biến

Mọi thông số nằm ở đầu module `QuarterlyGrowthChart.bas`:

- **Kích thước**: `PANEL_W`, `PANEL_H`, `BAR_W`, `BAR_MAX_H`, `GROUP_GAP`…
- **Màu sắc**: các hàm `BLUE_TOP/BOT`, `ORANGE_TOP/BOT`, `PANEL_TOP/BOT`,
  `STRIP_CLR`, `NAVY`… (đồng bộ với script Python
  `scripts/quarterly_growth_chart.py` trong repo này).
- **Font**: đổi `"Segoe UI"` trong `AddTextBox` nếu muốn font khác.
- **Mũi tên**: dùng shape `msoShapeCurvedUpArrow` / `msoShapeCurvedDownArrow`;
  chỉnh vị trí/kích thước trong `BuildChart` hoặc kéo tay sau khi vẽ.
