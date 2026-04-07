# Template hỏi user (Phase 3)

Sử dụng template này khi cần hỏi user để chốt quyết định.

---

## Format chuẩn

```markdown
## 📋 Cần confirm một số điểm

Dựa trên yêu cầu và codebase hiện tại, mình cần confirm:

### 1) [Tiêu đề nhóm câu hỏi]

**Ngữ cảnh:** [Giải thích TẠI SAO cần hỏi — cite code nếu cần]

**Câu hỏi:** [Câu hỏi cụ thể, rõ ràng]

**Đề xuất:**
- Option A: [mô tả] — [pros/cons]
- Option B: [mô tả] — [pros/cons]
- **Khuyến nghị:** Option [X] vì [lý do]

### 2) [Tiêu đề khác]

**Ngữ cảnh:** ...

**Câu hỏi:** ...

**Đề xuất:** ...
```

---

## Phân loại câu hỏi

| Loại | Mục đích | Ví dụ | Khi nào hỏi |
|------|----------|-------|-------------|
| **Nghiệp vụ** | Cần con số/quy tắc cụ thể | "Giới hạn recent fonts là bao nhiêu?" | Plan cần con số/data cụ thể |
| **UX** | Có nhiều cách xử lý UI | "Khi user gõ font không hợp lệ thì hiển thị gì?" | Có nhiều cách xử lý |
| **Kỹ thuật** | Có trade-offs kiến trúc | "Lưu vào config block hay global store?" | Có trade-offs rõ ràng |
| **Scope** | Không chắc nằm trong scope | "Phase này có cần làm A không?" | Ranh giới scope mờ |
| **Confirm** | Cần xác nhận giả định | "Mình hiểu X như vậy đúng không?" | Có giả định quan trọng |

---

## Quy tắc hỏi

### ✅ NÊN

- **NHÓM** các câu hỏi liên quan lại (3–5 câu/nhóm)
- **GIẢI THÍCH** ngữ cảnh / lý do hỏi (cite code paths nếu có)
- **ĐỀ XUẤT** options + khuyến nghị cho mỗi câu
- **GHI NHẬN** câu trả lời ngay + đánh dấu "đã chốt"

### ❌ KHÔNG NÊN

- Hỏi từng câu một, đợi trả lời, hỏi tiếp (→ gây phiền)
- Hỏi quá 7 câu một lượt (→ gây overwhelmed)
- Hỏi những gì có thể tự tìm từ code (→ lãng phí thời gian user)
- Hỏi mà không đề xuất (→ đẩy gánh nặng suy nghĩ cho user)

---

## Ví dụ hỏi TỐT vs XẤU

### ❌ Hỏi xấu (chỉ hỏi, không đề xuất)

> "Muốn giới hạn recent fonts bao nhiêu?"

### ✅ Hỏi tốt (có context + đề xuất)

> ### 1) Giới hạn recent fonts
>
> **Ngữ cảnh:** Google Sheets giới hạn ~8 recent fonts.
> Hiện tại TemplateCellStyle (`src/types.ts:45`) chưa có field `recentFonts`.
>
> **Câu hỏi:** Muốn giới hạn bao nhiêu recent fonts?
>
> **Đề xuất:**
> - Option A: 8 (giống Google Sheets) — quen thuộc, gọn
> - Option B: 12 — nhiều hơn, phù hợp nếu user dùng nhiều fonts
> - **Khuyến nghị:** Option A (8) vì UX tốt, không chiếm quá nhiều UI
