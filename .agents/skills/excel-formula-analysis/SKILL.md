---
name: excel-formula-analysis
description: >-
  Quickly understand a multi-sheet Excel workbook (.xlsx/.xlsm/.xlsb/.xls):
  extract every formula, cached value, cross-sheet link, and named range into a
  single index, then explain the meaning of ANY cell on demand (its formula,
  what it depends on, and what depends on it). Use whenever a user asks what a
  cell/sheet means, how sheets connect, or to audit/trace formulas in a workbook
  — especially large binary .xlsb files with many sheets.
---

# Excel formula & dependency analysis

Mục tiêu: đọc và hiểu một file Excel nhiều sheet **thật nhanh**, biết các công thức,
cách dữ liệu giữa các sheet kết nối với nhau, để khi được hỏi ý nghĩa của **bất kỳ
cell nào** có thể trả lời ngay.

## Ý tưởng cốt lõi

Không đọc lại cả workbook cho mỗi câu hỏi (rất chậm với file lớn). Thay vào đó:

1. **Build một lần** → tạo `index.json` (toàn bộ công thức, giá trị, quan hệ) và
   `summary.md` (tổng quan + sơ đồ liên kết giữa các sheet).
2. **Truy vấn nhiều lần** → các lệnh `cell` / `find` / `sheet` đọc từ `index.json`,
   trả lời tức thì.

Script: [`excel_indexer.py`](./excel_indexer.py) (chỉ phụ thuộc `openpyxl`).

## Khi nào dùng skill này

- User hỏi "cell X có ý nghĩa gì / tính cái gì?"
- User hỏi các sheet liên kết / phụ thuộc nhau ra sao.
- Cần truy vết (trace) một công thức về tận các ô input gốc.
- Cần tìm tất cả công thức chứa một hàm/tham chiếu (audit).

## Yêu cầu môi trường & engine đọc

```bash
pip install openpyxl
```

`build` hỗ trợ nhiều "engine" để lấy công thức (chọn bằng `--engine`):

| Engine | Đọc được | Cần gì | Ghi file convert ra đĩa? |
|--------|----------|--------|--------------------------|
| `openpyxl` | `.xlsx`, `.xlsm` | chỉ `openpyxl` | Không |
| `com` | mọi định dạng kể cả `.xlsb` | **Windows + Microsoft Excel + `pywin32`** | **KHÔNG** (đọc trực tiếp) |
| `libreoffice` | `.xlsb`, `.xls` | LibreOffice (`soffice`) | Có (1 file `.xlsx` tạm) |
| `auto` (mặc định) | tự chọn | — | tùy engine |

`auto`: `.xlsx/.xlsm` → openpyxl; còn lại → COM nếu có Excel trên Windows, không thì LibreOffice.

### Khi nào dùng `--engine com` (khuyến nghị trên máy Windows có Excel)

openpyxl không đọc được định dạng nhị phân, và `pyxlsb` chỉ lấy *giá trị* chứ
không lấy *chuỗi công thức*. Engine `com` mở file bằng chính Microsoft Excel
(qua `pywin32`) ở chế độ chỉ-đọc và lấy thẳng `.Formula` / `.Value` — **không
convert, không ghi bất kỳ file nào ra đĩa**. Đây là lựa chọn tốt nhất khi:
- Máy có Excel sẵn, và
- Không ghi được file convert vào ổ C: (thư mục tạm bị khóa).

```powershell
pip install pywin32
python excel_indexer.py build "C:\path\bao_cao.xlsb" --engine com --out .\wb_index
```

Chi tiết engine COM: dùng `DispatchEx` để mở một tiến trình Excel riêng (không
đụng workbook bạn đang mở), ép `ReferenceStyle = A1`, đọc theo từng UsedRange,
rồi `Quit()`. Yêu cầu Excel đã cài trên máy.

### Engine `libreoffice` (khi không có Excel)

LibreOffice tính lại (recalculate) và lưu giá trị khi convert sang `.xlsx`, nên
cả công thức và giá trị đều còn nguyên.

```bash
sudo apt-get install -y libreoffice-calc   # cung cấp lệnh `soffice`
# Nếu KHÔNG ghi được vào ổ C:/thư mục tạm, trỏ nơi ghi file convert sang ổ khác:
python3 excel_indexer.py build bao_cao.xlsb --engine libreoffice --workdir D:\tmp
```

## Quy trình

### Bước 1 — Build index (làm 1 lần cho mỗi file)

```bash
python3 excel_indexer.py build /duong/dan/workbook.xlsb
# chỉ định engine + thư mục output:
python3 excel_indexer.py build workbook.xlsb --engine com --out ./wb_index
```

Sinh ra `index.json` + `summary.md` (mặc định cạnh file gốc, hoặc trong `--out`).

**Luôn đọc `summary.md` trước** để nắm bức tranh tổng thể: danh sách sheet, kích
thước vùng dữ liệu, số công thức mỗi sheet, sheet ẩn, **sơ đồ phụ thuộc giữa các
sheet**, và các named range.

### Bước 2 — Trả lời ý nghĩa một cell

```bash
python3 excel_indexer.py cell "Summary!B2" --index index.json
```

In ra:
- **Formula** — công thức gốc của ô.
- **Value** — giá trị đã cache (nếu có).
- **Comment** — ghi chú của ô (thường giải thích ý nghĩa do người lập file viết).
- **Depends on (precedents)** — các ô mà ô này tham chiếu, kèm công thức/giá trị
  của chúng (kể cả ô ở sheet khác).
- **Used by (dependents)** — các ô đang dùng ô này (tác động lan tỏa nếu sửa).

Truy vết sâu về tận input gốc bằng `--depth`:

```bash
python3 excel_indexer.py cell "Summary!B2" --index index.json --depth 5
```

Có thể bỏ tên sheet (mặc định lấy sheet đầu tiên) và bỏ dấu `$`:
`cell "B2"`, `cell "summary!\$B\$2"` đều hợp lệ.

### Bước 3 — Tìm kiếm / tổng quan sheet (tùy chọn)

```bash
# Tìm mọi công thức/comment chứa chuỗi (thêm --values để tìm cả giá trị):
python3 excel_indexer.py find "VLOOKUP" --index index.json
python3 excel_indexer.py find "Doanh thu" --values --index index.json

# Tóm tắt một sheet: kích thước, số công thức, đọc từ đâu, feed cho ai:
python3 excel_indexer.py sheet "Calc" --index index.json
```

## Cách mô hình hóa "kết nối giữa các sheet"

- Mỗi công thức được token hóa bằng `openpyxl.formula.tokenizer` (xử lý đúng tên
  sheet có dấu cách/`'...'`, range, dấu `$`).
- Mỗi tham chiếu range được phân giải thành sheet + các ô cụ thể. Khi một công thức
  ở sheet A tham chiếu sheet B ⇒ ghi nhận cạnh `A -> B` ("A đọc dữ liệu từ B").
- `summary.md` liệt kê sơ đồ này; lệnh `sheet` cho biết mỗi sheet **đọc từ đâu**
  (Reads from) và **cung cấp cho ai** (Feeds into).

## Cách trả lời người dùng (cho AI)

Khi được hỏi "cell này nghĩa là gì":
1. Chạy `cell <ref>` để lấy công thức + value + precedents + dependents.
2. Diễn giải công thức bằng tiếng Việt dễ hiểu, kèm **comment** của ô nếu có.
3. Nếu công thức tham chiếu sheet khác, nói rõ nó lấy dữ liệu từ sheet/ô nào và ý
   nghĩa của các ô đó (dùng precedents). Dùng `--depth` để lần về input gốc khi cần.
4. Nhắc tác động: liệt kê **dependents** (ô/sheet sẽ thay đổi nếu sửa ô này).

## Lưu ý & giới hạn

- **Giá trị cache**: engine `com` và `libreoffice` luôn có giá trị (Excel/
  LibreOffice tính lại khi mở/convert). Với engine `openpyxl`, file phải đã được
  Excel/LibreOffice lưu trước đó thì mới có giá trị cache; bản thân script không
  tự tính công thức.
- **Engine COM (`pywin32`)**: chỉ chạy trên Windows có Microsoft Excel; chỉ đọc
  được *classic comments* (threaded comments mới có thể bị bỏ qua). Không ghi
  file convert ra đĩa.
- **Range lớn / cả cột** (vd `A:A` hay range > 4096 ô): không bung ra từng ô để
  tránh phình to; được ghi dưới mục "Depends on (ranges / names)" và vẫn tính vào
  liên kết sheet. Chỉnh `MAX_RANGE_EXPANSION` trong script nếu cần.
- **Named range / defined names**: liệt kê trong `summary.md`; khi xuất hiện trong
  công thức được ghi như một precedent dạng tên (chưa tự phân giải về ô).
- **Tham chiếu workbook ngoài** (`[1]Sheet!A1`): giữ nguyên dạng văn bản, không
  phân giải.
- **`.xls` cũ** giới hạn 65.536 dòng: range vượt quá có thể bị LibreOffice cắt
  thành `#REF!` khi convert. `.xlsb`/`.xlsx` không bị giới hạn này.
- File rất lớn: `index.json` có thể nặng; dùng `find`/`cell` thay vì mở cả file.

## Ví dụ nhanh (end-to-end)

```bash
# Windows + Excel (không ghi file ra ổ C:):
python excel_indexer.py build báo_cáo.xlsb --engine com  # -> index.json, summary.md
# (hoặc bỏ --engine để 'auto' tự chọn COM khi có Excel)
sed -n '1,40p' summary.md                              # đọc tổng quan + sơ đồ sheet
python excel_indexer.py cell "Tổng hợp!C10" --depth 4  # giải thích 1 cell
python excel_indexer.py find "IF(" --index index.json  # audit công thức IF
```
