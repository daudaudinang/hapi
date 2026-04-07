---
description: Workflow tạo plan triển khai dành cho IDE Agent. Agent phân tích yêu cầu, khám phá codebase, hỏi user các câu hỏi cần thiết, và tạo plan chi tiết để agent khác có thể implement.
---

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/create-plan/SKILL.md`
>
> File này chỉ là entry point — PHẢI đọc SKILL.md trước khi thực hiện.

## Trigger

```
/create-plan <feature_name>
```

## Quick Overview

```
Bước 0:   Khởi tạo → xác định FEATURE_NAME, kiểm tra plan cũ (+ Plan Versioning nếu cập nhật)
Bước 0.1: Triage Complexity → phân loại S / M / L
Bước 0.5: Nạp Project Context (nếu có load-project-context skill)
Phase 1:  Thu thập yêu cầu → Goal, Non-goals, điểm chưa rõ
Phase 2:  Khám phá codebase → files, patterns, impacts, Depth Check
Phase 3:  Hỏi user chốt quyết định (skip nếu Tier S không có câu hỏi)
Phase 4:  Viết plan theo template → review nội bộ → lưu file
```

## Workflow

1. Đọc skill file: `.agents/skills/create-plan/SKILL.md`
2. Thực thi tuần tự theo instructions trong SKILL.md
3. Output: `.agents/plans/PLAN_<FEATURE_NAME>.md`
4. Gợi ý user chạy `/review-plan` để review plan

## Resources

- Plan template: `.agents/skills/create-plan/resources/plan_template.md`
- Question template: `.agents/skills/create-plan/resources/question_template.md`
- Example: `.agents/skills/create-plan/examples/example_font_combobox.md`
