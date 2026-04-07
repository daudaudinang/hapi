---
description: Workflow review plan dành cho IDE Agent. Agent đọc plan, đối chiếu codebase, chấm 10 tiêu chí, phân loại severity (Blocker/Major/Minor), và đưa ra đánh giá actionable. CHỈ REVIEW, KHÔNG IMPLEMENT.
---

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/review-plan/SKILL.md`
>
> File này chỉ là entry point — PHẢI đọc SKILL.md trước khi thực hiện.

## Trigger

```
/review-plan <plan_file>
```

## Quick Overview

```
Bước 0:   Xác định plan file + Triage depth (Tier S/M/L)
Bước 0.2: Plan Format Detection (chuẩn/custom)
Bước 0.5: Nạp Project Context (nếu có load-project-context skill)
Bước 1:   Đọc plan → kiểm tra 15 sections theo Tier
Bước 1.5: Structural Validation (format check từng section)
Bước 2:   Đối chiếu codebase + cross-reference docs
Bước 3:   Chấm 12 tiêu chí + weighted score → phân loại Blocker/Major/Minor
Bước 4:   Xuất report → kết luận PASS/CẦN BỔ SUNG/CẦN XEM LẠI
Bước 4.1: Đề xuất auto-fix (nếu CẦN BỔ SUNG + không Blocker)
```

## Workflow

1. Đọc skill file: `.agents/skills/review-plan/SKILL.md`
2. Thực thi tuần tự theo instructions trong SKILL.md
3. Output: review report hiển thị trực tiếp cho user
4. Nếu CẦN BỔ SUNG → đề xuất auto-fix vào plan file

## Resources

- Review criteria (10 tiêu chí): `.agents/skills/review-plan/resources/review_criteria.md`
- Review template (severity): `.agents/skills/review-plan/resources/review_template.md`
- Example: `.agents/skills/review-plan/examples/example_review_feature_x.md`