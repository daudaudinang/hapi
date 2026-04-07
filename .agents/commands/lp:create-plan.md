---
description: Alias /lp:create-plan → skill create-plan. Wrapper mỏng cho workflow lập plan.
---

# /lp:create-plan <feature_name | issue_key>

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/create-plan/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:create-plan`
- Skill đích: `create-plan`
- Command tương đương: `/create-plan`

## Trigger

```text
/lp:create-plan <feature_name>
/lp:create-plan <ISSUE-KEY>
```

## Workflow

1. Đọc `.agents/skills/create-plan/SKILL.md`
2. Nếu input là Jira issue key/URL → có thể bridge qua `jira-workflow-bridge`
3. Thực thi đầy đủ workflow create-plan
4. Output plan file trong `.agents/plans/`

## Next Step gợi ý

```text
/lp:review-plan <plan_file>
```
