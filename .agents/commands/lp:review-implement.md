---
description: Alias /lp:review-implement → skill review-implement. Wrapper mỏng cho workflow senior code review.
---

# /lp:review-implement <plan_file_path>

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/review-implement/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:review-implement`
- Skill đích: `review-implement`
- Command tương đương: `/review-implement`

## Trigger

```text
/lp:review-implement <plan_file_path>
```

## Workflow

1. Đọc `.agents/skills/review-implement/SKILL.md`
2. Review implementation so với plan + execution boundary
3. Phân loại issues theo severity
4. Nếu còn issue → user fix rồi re-review delta

## Next Step gợi ý

```text
/lp:close-task <ticket_key>
```
