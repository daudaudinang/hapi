---
description: Alias /lp:close-task → skill close-task. Wrapper mỏng cho workflow commit + Jira Done + worklog + lessons.
---

# /lp:close-task <ticket_key>

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/close-task/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:close-task`
- Skill đích: `close-task`
- Command tương đương: `/close-task`

## Trigger

```text
/lp:close-task <ticket_key> [--files ...] [--time 30m]
```

## Workflow

1. Đọc `.agents/skills/close-task/SKILL.md`
2. Thu thập ticket key + files + time spent
3. Stage đúng files → commit → Jira transition → worklog
4. Gọi `lesson-capture` nếu có lesson đáng ghi
5. Báo cáo kết quả cuối
