# Ví dụ End-to-End: Font Combobox

Ví dụ này minh họa toàn bộ workflow tạo plan từ đầu đến cuối.

---

## Input

```
/create-plan font-combobox

Mình muốn thay dropdown chọn font trong Template Editor
thành combobox có search, cho phép gõ tên font custom,
và lưu recent fonts theo block.
```

---

## Phase 1: Thu thập yêu cầu

**Loại:** 🆕 Feature mới + ⬆️ Cải tiến UI

**Goal:**
- Thay dropdown chọn font → combobox có search
- Cho phép gõ tên font tùy ý (custom font)
- Lưu recent fonts theo từng block

**Non-goals:**
- Không làm font preview (hiển thị mẫu font trong dropdown)
- Không tích hợp Google Fonts API realtime

**Điểm chưa rõ:**
- Giới hạn recent fonts là bao nhiêu?
- Preset fonts gồm những font nào?
- Custom font validate như thế nào?

---

## Phase 2: Khám phá codebase

**Tìm kiếm:**
- `grep_search "fontFamily"` → 3 vị trí: cell-level, segment-level, forEach child
- `view_file "src/components/template-editor/types.ts"` → `TemplateCellStyle.fontFamily: string`
- `view_file "src/components/template-editor/template-editor-dialog.tsx"` → normalize config logic

**Phát hiện:**
- Font hiện tại: dùng `<Select>` component từ shadcn/ui
- Giá trị font lưu trong `TemplateCellStyle.fontFamily` (string)
- Chưa có cơ chế lưu recent fonts
- Config block dùng `normalizeConfig()` để merge defaults

**Impacts:**
- `src/components/template-editor/font-select.tsx` — cần viết mới (combobox)
- `src/components/template-editor/types.ts` — thêm recentFonts
- `src/components/template-editor/template-editor-dialog.tsx` — thay Select → Combobox

---

## Phase 3: Hỏi user

```markdown
## 📋 Cần confirm một số điểm

### 1) Giới hạn recent fonts

**Ngữ cảnh:** Google Sheets giới hạn ~8 recent fonts.

**Câu hỏi:** Muốn giới hạn bao nhiêu?

**Đề xuất:** 8 (giống Google Sheets)

### 2) Preset fonts

**Ngữ cảnh:** Cần list fonts mặc định khi chưa có recent.

**Câu hỏi:** List fonts mặc định gồm những gì?

**Đề xuất:** 25 fonts phổ biến (web-safe + Google Fonts top 10)

### 3) Custom font validation

**Ngữ cảnh:** User có thể nhập tên font bất kỳ.

**Câu hỏi:** Cần validate custom font không?

**Đề xuất:** Không validate, accept mọi input (giống Google Docs)
```

**User trả lời:**
- Recent: 8 ✅
- Preset: Đồng ý 25 fonts ✅
- Validation: Không validate ✅

---

## Phase 4: Output

```
✅ Đã tạo plan: .agent/plans/PLAN_FONT_COMBOBOX.md

Plan bao gồm:
- 3 vị trí cần thay đổi (cell-level, segment-level, forEach child)
- Schema mở rộng: editor.recentFonts (mảng string, max 8)
- Preset fonts: 25 fonts (web-safe + Google Fonts)
- Test plan: 6 happy paths + 4 edge cases

Bạn có thể review bằng: /review-plan .agent/plans/PLAN_FONT_COMBOBOX.md
```
