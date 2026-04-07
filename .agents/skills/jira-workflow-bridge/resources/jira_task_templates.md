# Jira Task Templates — Chuẩn hóa cho Human + Agent

Hướng dẫn cách viết task trên Jira sao cho:
1. **Human đọc hiểu ngay** — rõ ràng, dễ scan
2. **Agent trích xuất được** — cấu trúc nhất quán, có keywords đặc trưng

---

## Template 1: Feature / Story / Task — Triển khai mới

```markdown
## Summary
[1-2 câu mô tả ngắn gọn task cần làm gì]

## Context & Motivation
- **Why:** [Vấn đề business/UX đang giải quyết]
- **User Story:** As a [role], I want [action] so that [benefit]
- **Priority:** [Critical/High/Medium/Low]

## Scope
### ✅ In Scope
- [Feature/hành vi cần triển khai 1]
- [Feature/hành vi cần triển khai 2]

### ❌ Out of Scope
- [Điều KHÔNG làm ở task này 1]
- [Điều KHÔNG làm ở task này 2]

## Business Rules
- [Quy tắc nghiệp vụ 1 — con số cụ thể nếu có]
- [Quy tắc nghiệp vụ 2]
- [Ràng buộc / constraints]

## Technical Context
- **Module:** [Tên module/component, VD: storefront/checkout]
- **Entry Files:**
  - `src/modules/checkout/components/CartSummary.tsx`
  - `src/lib/data/cart.ts`
- **Related APIs:**
  - `POST /store/carts/:id/line-items`
  - Table: `cart`, `line_item`
- **Patterns to Follow:** [VD: xem `ProductList` component làm mẫu]

## Acceptance Criteria
- [ ] [AC 1 — hành vi cụ thể có thể verify]
- [ ] [AC 2 — edge case + expected behavior]
- [ ] [AC 3 — performance/UX requirement nếu có]

## Manual Test — Expected Results
### Test Scenario 1: [Tên scenario — happy path]
**Steps:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected:** [Kết quả mong đợi cụ thể]

### Test Scenario 2: [Tên scenario — edge case]
**Steps:**
1. [Step 1]
2. [Step 2]

**Expected:** [Kết quả mong đợi]

## Design & References
- **Figma:** [link]
- **Related Tasks:** MOT-123, MOT-124
- **Technical Doc:** [link nếu có]
- **Dependencies (cần hoàn thành trước):** MOT-122

## Notes for Agent
<!-- Agent sẽ đọc section này để hiểu ngữ cảnh nhanh hơn -->
- Pattern tham khảo: [VD: xem `ProductList` component trong `src/modules/products/`]
- State management: [VD: project dùng React Query, KHÔNG dùng Redux]
- Convention: [VD: file naming kebab-case, component PascalCase]
```

---

## Template 2: Bug Issue — Sửa lỗi

```markdown
## Summary
[Mô tả bug ngắn gọn — cái gì sai, ở đâu]

## Bug Details
- **Severity:** Critical / High / Medium / Low
- **Frequency:** Always / Sometimes / Rare
- **Environment:** [Production / Staging / Local]
- **Browser/Device:** [Chrome 120 / macOS / mobile nếu relevant]
- **First observed:** [Ngày/commit/sprint]

## Steps to Reproduce
1. [Bước 1 — cụ thể, chi tiết]
2. [Bước 2]
3. [Bước 3]
4. → [Kết quả thực tế xảy ra]

## Expected vs Actual
- **Expected:** [Kết quả đúng theo yêu cầu ban đầu]
- **Actual:** [Kết quả sai đang xảy ra]

## Error Context
### Error Log / Stack Trace
```
[Paste error log đầy đủ — không cắt ngắn]
TypeError: Cannot read property 'quantity' of undefined
  at CartSummary.tsx:42
  at async fetchCart (cart.ts:15)
```

### Screenshots / Video
[Đính kèm screenshot hoặc video reproduce bug]

## Execution Flow Analysis
<!-- Mô tả luồng thực thi gây lỗi — giúp agent và dev hiểu nhanh -->
```
User click "Add to Cart"
  → CartButton.onClick()
    → addToCart(productId, qty=1)
      → API: POST /store/carts/{id}/line-items
        → Response: 200 OK, nhưng line_items = null (LỖI Ở ĐÂY)
      → CartContext.setItems(null)  // ← null cause crash
    → CartSummary re-render
      → items.map() → TypeError: Cannot read property 'map' of null
```

## Technical Scope
- **Suspected Files:**
  - `src/modules/checkout/components/CartSummary.tsx:42`
  - `src/lib/data/cart.ts:15`
- **Related Module:** checkout, cart
- **Related API:** `GET /store/carts/:id`

## Root Cause Analysis (nếu đã debug sơ bộ)
- **Nguyên nhân (nếu biết):** [VD: API trả về null thay vì [] khi cart rỗng]
- **File cần fix:** [VD: `cart.ts:15` — thiếu null check]

## Acceptance Criteria
- [ ] Bug không còn reproduce theo Steps to Reproduce ở trên
- [ ] Không regression: các flow liên quan vẫn hoạt động
- [ ] Thêm test case cover scenario này (nếu có unit test)

## References
- **Related Tasks:** MOT-100 (task tạo feature cart ban đầu)
- **Related PR:** #89 (PR gần nhất thay đổi cart logic)
- **Commit gây issue (nếu biết):** `abc1234`

## Notes for Agent
<!-- Agent đọc section này để bắt đầu debug nhanh -->
- Start investigating at: `src/lib/data/cart.ts:15`
- Related recent changes: PR #89 changed cart fetching logic
- Test command: `bun run test -- --filter cart`
```

---

## Template 3: Epic — Kế hoạch tổng thể

```markdown
## Summary
[Mô tả mục tiêu tổng thể của epic]

## Epic Goal
[1-2 câu mô tả mục tiêu cuối cùng khi hoàn thành epic]

## Context & Motivation
- **Why:** [Vấn đề / cơ hội business]
- **Target Users:** [Ai được hưởng lợi]
- **Success Metrics:** [Đo lường thành công bằng gì?]

## Scope Overview
### ✅ In Scope
- [Feature/capability 1]
- [Feature/capability 2]

### ❌ Out of Scope
- [Điều KHÔNG làm ở epic này]
- [Sẽ làm ở epic sau nếu có]

## Child Tasks (Breakdown)
| Key | Type | Summary | Priority | Status |
|-----|------|---------|----------|--------|
| MOT-201 | Story | [Feature A] | High | To Do |
| MOT-202 | Story | [Feature B] | Medium | To Do |
| MOT-203 | Bug | [Known issue] | High | To Do |

## Technical Architecture Notes
- [Kiến trúc tổng thể — mô tả ở mức high-level]
- [Các module/service liên quan]
- [Database changes nếu có]
- [API changes nếu có]

## References
- **Design Doc:** [link]
- **Figma:** [link]
- **Related Epics:** MOT-100
```

---

## 📌 Nguyên tắc viết task tốt

| Nguyên tắc | Cho Human | Cho Agent |
|---|---|---|
| **Headers rõ ràng** (`##`) | Dễ scan sections | Parse được cấu trúc |
| **File paths cụ thể** | Biết code ở đâu | `grep_search` / `view_file` ngay |
| **Acceptance Criteria dạng `- [ ]`** | Biết khi nào "done" | Tự verify từng item |
| **Error logs đầy đủ** (bug) | Debug nhanh | Trace file:line trực tiếp |
| **"Notes for Agent" section** | Có thể skip | Convention hints, entry points |
| **Scope In/Out rõ ràng** | Tránh scope creep | Biết boundary |
| **Execution Flow** (bug) | Hiểu luồng lỗi | Trace code path |
| **Manual Test Expected Results** | Biết test pass/fail | Verify implementation |

## 🔑 Keywords giúp Agent parse tốt

Sử dụng các keywords/headers nhất quán để agent nhận diện:

- `## Acceptance Criteria` — Tiêu chí hoàn thành
- `## Steps to Reproduce` — Bước tái hiện lỗi
- `## Expected vs Actual` — So sánh kết quả
- `## Scope` / `### ✅ In Scope` / `### ❌ Out of Scope`
- `## Business Rules` — Quy tắc nghiệp vụ
- `## Technical Context` — Ngữ cảnh kỹ thuật
- `## Notes for Agent` — Ghi chú riêng cho agent
- `## Manual Test — Expected Results` — Kết quả manual test mong đợi
- `## Execution Flow Analysis` — Luồng thực thi (bug)
