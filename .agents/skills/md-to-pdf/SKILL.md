---
name: md-to-pdf
description: |
  Convert markdown files sang PDF đẹp với custom CSS styling.
  Hỗ trợ single file, nhiều files, hoặc cả thư mục. Sử dụng md-to-pdf (Puppeteer).
  Kích hoạt khi user nói "xuất PDF", "convert sang PDF", "tạo PDF từ markdown",
  "export PDF", "markdown to pdf", "in ra PDF", hoặc bất kỳ yêu cầu nào liên quan
  đến việc chuyển đổi file .md sang .pdf.
---

# 📄 Skill: Markdown to PDF Converter

## Mục đích
Convert file `.md` sang `.pdf` với typography đẹp, hỗ trợ tiếng Việt, emoji, tables, collapsible sections.

## Triggers
- "xuất PDF", "convert sang PDF", "tạo PDF", "export PDF"
- "markdown to pdf", "md to pdf", "in ra PDF"
- User cung cấp file/thư mục .md và muốn tạo PDF

---

## Quy trình

### Bước 1: Xác định input

Hỏi user nếu chưa rõ:
- **File cụ thể:** `/path/to/file.md`
- **Nhiều files:** `/path/to/file1.md /path/to/file2.md`
- **Cả thư mục:** `/path/to/directory/` (convert tất cả `*.md`)

### Bước 2: Kiểm tra md-to-pdf đã cài chưa

```bash
npm ls -g md-to-pdf 2>/dev/null || npm i -g md-to-pdf
```

### Bước 3: Tạo và chạy script convert

Tạo script `/tmp/md2pdf_convert.js` với nội dung từ `scripts/convert.js` (xem bên dưới).

Chỉnh sửa biến `files` trong script theo input của user.

Chạy:
```bash
NODE_PATH=$(npm root -g) node /tmp/md2pdf_convert.js
```

### Bước 4: Báo kết quả

Liệt kê các file PDF đã tạo kèm kích thước.

---

## Script

File script nằm tại: `scripts/convert.js`

**Cách dùng:**
1. Copy script sang `/tmp/md2pdf_convert.js`
2. Sửa biến `files` thành danh sách file cần convert (absolute paths)
3. Chạy: `NODE_PATH=$(npm root -g) node /tmp/md2pdf_convert.js`

**Tùy chỉnh CSS:**
- Sửa biến `CSS_STYLE` trong script để thay đổi giao diện PDF
- Mặc định: font sans-serif, heading có màu, table zebra-striped, blockquote đỏ

---

## Constraints

- Yêu cầu Node.js và npm
- Puppeteer cần `--no-sandbox` trên server Linux (đã xử lý trong script)
- File output `.pdf` sẽ nằm cùng thư mục với file `.md` gốc
- Hỗ trợ: tables, emoji, `<details>`, blockquote, code blocks, tiếng Việt
- PDF format: A4, margin 20mm top/bottom, 15mm left/right
