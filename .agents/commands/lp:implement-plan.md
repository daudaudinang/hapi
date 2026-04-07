---
description: Alias /lp:implement-plan → skill implement-plan. Wrapper mỏng cho workflow triển khai từ plan.
---

# /lp:implement-plan <plan_file_path>

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/implement-plan/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:implement-plan`
- Skill đích: `implement-plan`
- Command tương đương: `/implement-plan`

## Trigger

```text
/lp:implement-plan <plan_file_path>
```

## Workflow

1. Đọc `.agents/skills/implement-plan/SKILL.md`
2. Nạp plan + boundary + pre-flight checks
3. Triển khai theo implementation order
4. Verify Acceptance Criteria theo plan
5. Xuất walkthrough / summary

## Next Step gợi ý

```text
/lp:review-implement <plan_file_path>
```
