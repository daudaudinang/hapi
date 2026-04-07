---
description: Alias /lp:review-plan → skill review-plan. Wrapper mỏng cho workflow review plan.
---

# /lp:review-plan <plan_file>

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/review-plan/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:review-plan`
- Skill đích: `review-plan`
- Command tương đương: `/review-plan`

## Trigger

```text
/lp:review-plan <plan_file>
```

## Workflow

1. Đọc `.agents/skills/review-plan/SKILL.md`
2. Review plan theo criteria/severity trong skill
3. Xuất report trực tiếp cho user
4. Nếu pass → gợi ý sang implement

## Next Step gợi ý

```text
/lp:implement-plan <plan_file>
```
