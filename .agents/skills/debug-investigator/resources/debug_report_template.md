# Template Báo cáo Điều tra Lỗi

Sử dụng template này ở BƯỚC 7 để xuất kết quả điều tra.

---

```text
═══════════════════════════════════════════
BÁO CÁO ĐIỀU TRA LỖI
═══════════════════════════════════════════

LỖI: [Mô tả ngắn]
LOẠI: [Frontend/Backend/Integration/Performance/Data/Logic]
MỨC ĐỘ: [Critical/High/Medium/Low]
NGÀY: [YYYY-MM-DD]

───────────────────────────────────────────
KẾT LUẬN CHÍNH:
- NGUYÊN NHÂN GỐC (Confidence ~X%): [Mô tả rõ ràng, 1-2 câu]
- Location: path/to/file:line(s)
- Lý do: [giải thích 1 câu dễ hiểu]
───────────────────────────────────────────

IMPACT ANALYSIS:
- Phạm vi ảnh hưởng: [Tất cả users / Chỉ specific case / Chỉ khi ...]
- Data integrity: [Có risk corrupt data không? Sai state? Mất data?]
- Workaround tạm thời: [Nếu có — VD: reload page, clear cache, ...]
- Urgency: [Cần fix ngay / Có thể chờ sprint sau]

───────────────────────────────────────────
REPRODUCE (để xác nhận lỗi tồn tại):

⚠️ Lưu ý môi trường:
- Thư mục: [VD: servers/fastapi/]
- Runtime: [VD: uv run / bun / node]
- Điều kiện: [VD: cần login trước, cần data X]

Steps/Command:
  ```
  # VD: uv run pytest tests/test_xxx.py -k "test_case" -v
  # Hoặc browser steps:
  # 1. Mở http://localhost:6003/path
  # 2. [thao tác]
  # 3. [quan sát]
  ```
Expected: [...]
Actual: [...]
───────────────────────────────────────────

CHI TIẾT NGUYÊN NHÂN CHÍNH:
- File: [path]
- Function/Component: [tên]
- Hypothesis: [H? — mô tả ngắn]
- Code liên quan:
  ```
  [code snippet ngắn]
  ```
- Giải thích chi tiết:
  - Input: [...]
  - Logic sai ở chỗ: [...]
  - Dẫn tới: [... → đúng triệu chứng user mô tả]
- Evidence:
  - [Evidence 1: code/luồng/log]
  - [Evidence 2: ...]

───────────────────────────────────────────
NGUYÊN NHÂN PHỤ (nếu có):
1. [Nguyên nhân phụ 1] – Location: [...] – Confidence: [X%]
   - Mô tả ngắn: [...]
   - Tương tác với nguyên nhân chính: [...]
2. [...]
───────────────────────────────────────────

ĐỀ XUẤT FIX:

⚡ Fix chính:
- Location: path/to/file:line
- Hiện tại:
  ```
  [code hiện tại]
  ```
- Đề xuất:
  ```
  [code mới]
  ```
- Giải thích: [Tại sao fix này giải quyết lỗi]
- Risk level: [Low/Medium/High]

🔧 Cải thiện thêm (optional):
- [Refactoring suggestion nếu có]
- Effort: [Low/Medium/High]
- Benefit: [...]

───────────────────────────────────────────
REGRESSION SCOPE:

Files bị ảnh hưởng trực tiếp:
- [path/to/file1]
- [path/to/file2]

Tests cần chạy sau fix:
  ```
  # VD: uv run pytest tests/test_xxx.py -v
  # VD: bun test src/__tests__/component.test.tsx
  ```

Luồng UI cần kiểm tra:
1. [Luồng 1: mô tả ngắn]
2. [Luồng 2: mô tả ngắn]

Normal test cases: [...]
Edge cases: [...]
───────────────────────────────────────────

INVESTIGATION LOG:
| #  | Action              | File/Resource          | Finding                    | Hypothesis Impact         |
|----|---------------------|------------------------|----------------------------|---------------------------|
| 1  | [...]               | [...]                  | [...]                      | [H?: ↑/↓/✗/neutral]      |
| 2  | [...]               | [...]                  | [...]                      | [...]                     |
...

Eliminated hypotheses: [list]
Active hypotheses: [list with final confidence]

───────────────────────────────────────────
ACTION ITEMS:

NGAY LẬP TỨC:
- [ ] Review code tại các location nghi ngờ
- [ ] Chọn phương án fix phù hợp
- [ ] (Nếu urgent) áp dụng workaround tạm thời

TRƯỚC KHI FIX:
- [ ] Tạo branch riêng cho fix
- [ ] (Nếu cần) backup dữ liệu/config liên quan

SAU KHI FIX:
- [ ] Chạy reproduce command — xác nhận lỗi đã resolved
- [ ] Chạy regression tests (xem REGRESSION SCOPE)
- [ ] Kiểm tra luồng UI liên quan
- [ ] Chạy lint cho files đã sửa
═══════════════════════════════════════════
```

---

## Hướng dẫn sử dụng

### Executive Summary
- Ghi ngắn gọn, súc tích — user đọc phần này đầu tiên
- Confidence score PHẢI có (VD: ~85%)
- Location PHẢI cụ thể (file + line)

### Impact Analysis (MỚI)
- Đánh giá phạm vi ảnh hưởng thực tế
- Nêu workaround nếu có — giúp user unblock ngay trước khi fix
- Đánh giá urgency để user ưu tiên

### Reproduce (MỚI)
- PHẢI ghi rõ môi trường (thư mục, runtime) để tránh chạy sai
- PHẢI có Expected vs Actual
- Ưu tiên command line reproduce khi có thể

### Chi tiết nguyên nhân
- Code snippet ngắn, chỉ đủ context để hiểu
- Giải thích theo flow: Input → Logic → Output sai → Triệu chứng
- Evidence phải từ code thực tế (đã đọc qua tools), KHÔNG đoán
- Ghi rõ hypothesis nào đã dẫn tới phát hiện này

### Đề xuất fix
- PHẢI có code "hiện tại" vs "đề xuất" để user compare
- Ghi rõ risk level và test cases cần chạy
- Nhắc tuân thủ rules repo (logger, TSDoc, bun)

### Regression Scope (MỚI)
- Liệt kê files + exact test commands
- Liệt kê luồng UI cần manual check
- Phân biệt normal vs edge test cases

### Investigation Log (MỚI)
- Trích từ log duy trì trong quá trình điều tra
- Bao gồm cả negative findings
- Giúp user hiểu reasoning path đầy đủ

### Action items
- Chia 3 giai đoạn: trước/khi/sau fix
- Bao gồm reproduce verification sau fix
- Format checklist để user tick
