# PLAN: {Feature Name}

> **Version**: 1.0
> **Tier**: {S / M / L}
> **Type**: {🆕 Feature / ⬆️ Cải tiến / 🐛 Bug fix / 🔄 Refactor}
> **Created**: {YYYY-MM-DD}
> **Updated**: {YYYY-MM-DD} *(nếu cập nhật)*

## Mục tiêu

- {Mục tiêu 1}
- {Mục tiêu 2}

## Acceptance Criteria

| # | Criteria | Verify Command / Method | Pass/Fail |
|---|---------|------------------------|-----------|
| AC-1 | {Tiêu chí cụ thể, đo được} | {Lệnh hoặc cách verify} | ☐ |
| AC-2 | {Tiêu chí cụ thể, đo được} | {Lệnh hoặc cách verify} | ☐ |

> ⚠️ **SMART rule**: Mỗi AC phải Specific, Measurable, Achievable, Relevant. Tránh viết mơ hồ như "hoạt động tốt".

## Non-goals (chưa làm ở phase này)

- {Những gì KHÔNG làm}
- {Lý do tại sao không làm}

## Bối cảnh hiện trạng

- {Mô tả trạng thái hiện tại của codebase}
- {Các files/modules liên quan — cite đường dẫn cụ thể}
- {Patterns đang dùng}

## Dependencies / Prerequisites

- {Env vars cần thiết: `VAR_NAME=value`}
- {Services cần đang chạy: backend port X, DB, etc.}
- {Packages cần cài: `package@version`}
- {Tasks phải xong trước: link đến plan/task khác nếu có}

## Yêu cầu nghiệp vụ (đã chốt)

- **{Yêu cầu 1}**: {Chi tiết, đã được user confirm}
- **{Yêu cầu 2}**: {Chi tiết}

## Thiết kế UX / Flow

<!-- Bỏ section này nếu Tier S hoặc không liên quan đến UI -->

### {Flow 1}

- {Step 1}
- {Step 2}
- {Xử lý edge cases}

### {Flow 2}

- ...

## Thiết kế Data Model

<!-- Bỏ section này nếu không có schema change -->

### Mục tiêu

- {Mục tiêu của schema change}

### Đề xuất schema

- {Mô tả schema mới/thay đổi}
- {Giải thích lý do}

### Tương thích & Migration

- {Backward compatibility}
- {Migration plan nếu có}

## Thiết kế kỹ thuật / Kiến trúc

<!-- Bỏ section này nếu Tier S -->

### {Aspect 1}

- {Chi tiết}

### {Aspect 2}

- {Chi tiết}

## Execution Boundary

### Allowed Files (chỉ được sửa/tạo mới)

- `{path/to/file1.ts}`: {Mô tả thay đổi}
- `{path/to/file2.ts}`: {Mô tả thay đổi}
- `{path/to/new-file.ts}` (🆕): {Mô tả}

### Do NOT Modify (CẤM TUYỆT ĐỐI)

- `{path/to/critical/}` — {Lý do: thuộc module khác, shared config, v.v.}

## Implementation Order

<!-- Bỏ section này nếu Tier S -->

| Order | File | Depends On | AC(s) | Est. Effort |
|-------|------|------------|-------|-------------|
| 1 | `{path/to/schema.ts}` | - | AC-1 | Small |
| 2 | `{path/to/service.ts}` | #1 | AC-2 | Medium |
| 3 | `{path/to/component.tsx}` | #1, #2 | AC-3 | Medium |

> **Mục đích:** Agent implement biết thứ tự triển khai, file nào phụ thuộc file nào,
> tránh bị stuck vì dependency chưa sẵn.

## Pre-flight Check

> Implement agent chạy checklist này TRƯỚC khi bắt đầu code.

- [ ] Dependencies đã cài: `{uv sync / bun install / npm install}`
- [ ] Services đang chạy: `{backend port 6001, DB, etc.}`
- [ ] Env vars đã set: `{LIST_CỤ_THỂ}`
- [ ] Branch đã tạo: `feat/{FEATURE_NAME}`
- [ ] Plan version đang implement: `v{X.Y}` (check latest version!)

## Logging & Bảo mật

<!-- Bỏ section này nếu không liên quan -->

- {Quy tắc logging}
- {Các concern về security nếu có}

## Rủi ro / Edge cases

| Risk | Likelihood | Impact | Trigger | Mitigation | Owner |
|------|------------|--------|---------|------------|-------|
| {Risk 1} | {High/Medium/Low} | {High/Medium/Low} | {Khi nào risk xảy ra} | {Cách xử lý/phòng tránh} | {Agent/User} |
| {Risk 2} | {High/Medium/Low} | {High/Medium/Low} | {Trigger} | {Mitigation} | {Owner} |

> **Ưu tiên:** Xử lý risks có **Likelihood High + Impact High** trước.

## Test plan

### Happy paths

- **{Test case 1}**: {Steps + Expected result}
- **{Test case 2}**: {Steps + Expected result}

### Edge cases

- {Edge case 1}: {Expected behavior}
- {Edge case 2}: {Expected behavior}

### Regression

- {Những gì cần check để đảm bảo không break}

## Decisions đã chốt

| # | Quyết định | Source |
|---|-----------|--------|
| 1 | {Quyết định cụ thể} | {User confirm / codebase pattern / reference doc} |
| 2 | {Quyết định cụ thể} | {Source} |

## Những điểm dễ thay đổi trong tương lai

<!-- Bỏ section này nếu Tier S -->

- **{Điểm 1}**: {Cách thay đổi}
- **{Điểm 2}**: {Cách thay đổi}

## Nơi nên tách module/hàm

<!-- Bỏ section này nếu Tier S -->

- `{functionName}`: {Lý do tách}
- `{ComponentName}`: {Lý do tách}

## Change Log

<!-- CHỈ GHI KHI CẬP NHẬT plan cũ (Plan Versioning Protocol) -->

| Version | Date | Changes | Reason |
|---------|------|---------|--------|
| {1.0} | {YYYY-MM-DD} | Initial plan | - |
