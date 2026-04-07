# Ví dụ End-to-End: Implement Plan Font Combobox

Ví dụ này minh họa toàn bộ workflow implement plan từ đầu đến cuối, sử dụng codebase KHÔNG có unit test (Direct Implementation flow).

---

## Input

```
/implement-plan .agents/plans/PLAN_FONT_COMBOBOX.md
```

---

## Phase 0: Khởi tạo & Đánh giá

### 0.1. Đọc file plan
- Plan có 2 phases, 5 tasks tổng cộng (Tier S).
- Phase 1: Tạo component + types (3 tasks)
- Phase 2: Tích hợp + preset (2 tasks)

### 0.3. Nhận diện Execution Boundary
- **Allowed Files**: `src/components/**`, `src/types.ts`, `src/constants/**`
- **Do NOT Modify**: `src/core/**`

### 0.4. Tạo folder & Kiểm tra
- `PLAN_FONT_COMBOBOX.md` → `plan_font_combobox`
- Tạo folder: `.agents/plans/plan_font_combobox/`
- Kiểm tra test framework: `HAS_UNIT_TEST = false`

### 0.5. Đánh giá tính khả thi
- ✅ Plan bám sát codebase, Boundary an toàn
- ✅ Files đề cập tồn tại
- ✅ Thứ tự hợp lý
- → Output: "Plan đã được đánh giá, bắt đầu triển khai phase 1..."

---

## Phase 1: Tạo component & types

### Pre-check
- Dependencies: Đã có sẵn Node.js và pnpm.

### Thông báo
```
🔨 Bắt đầu Phase 1: Tạo FontCombobox component & mở rộng types

Tasks cần làm:
- [ ] Task 1.1: Tạo FontCombobox component
- [ ] Task 1.2: Thêm recentFonts vào TemplateCellStyle
- [ ] Task 1.3: Thêm preset fonts constant
```

### Triển khai Tasks
- **Task 1.1:** Tạo `src/components/template-editor/font-combobox.tsx` (Trong scope Allowed). Lint: ✅ PASS
- **Task 1.2:** Sửa `src/types.ts` — thêm `recentFonts?: string[]`. Lint: ✅ PASS
- **Task 1.3:** Tạo `src/constants/fonts.ts`. Lint: ✅ PASS

### Xác thực Acceptance Criteria (AC)
- Chạy command: `bun run lint src/components/template-editor/font-combobox.tsx`
- Kết quả: No errors. PASS.

### Walkthrough
- Tạo file: `.agents/plans/plan_font_combobox/phase-1-walkthrough.md`
- Tick chọn Boundary Check: ✅ Tuân thủ
- Ghi nhận AC kết quả vào bảng.

### Thông báo hoàn thành
```
✅ Hoàn thành Phase 1: Tạo FontCombobox component & mở rộng types

📋 Tóm tắt:
- 3 tasks hoàn thành
- 3 files changed (1 modified, 2 created)
- AC Verified: ✅ PASS (lint check ok)

🧪 Manual test:
1. Mở Template Editor
2. Kiểm tra FontCombobox render đúng logic

➡️ Tiếp tục Phase 2? (user confirm)
```

---

## Phase 2: Tích hợp & preset

*(Tương tự Phase 1, với tasks tích hợp vào editor, check AC verification)*

---

## Báo cáo tổng kết

```
🎉 Hoàn thành triển khai plan: PLAN_FONT_COMBOBOX

📊 Tổng kết:
- 2 phases hoàn thành
- 5 files changed / created
- Lint: ✅ PASS
- Test: N/A
- AC Verified: ✅ Tất cả (2/2)

📁 Walkthrough files:
- .agents/plans/plan_font_combobox/phase-1-walkthrough.md
- .agents/plans/plan_font_combobox/phase-2-walkthrough.md

💡 Đề xuất tiếp theo:
- Chạy /review-implement để review code đã tạo
```
