---
description: Alias /lp:sync-agents-context → skill sync-agents-context. Wrapper mỏng cho workflow đồng bộ context rules.
---

# /lp:sync-agents-context

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/sync-agents-context/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:sync-agents-context`
- Skill đích: `sync-agents-context`
- Command tương đương: `/sync-agents-context`

## Trigger

```text
/lp:sync-agents-context
```

## Workflow

1. Đọc `.agents/skills/sync-agents-context/SKILL.md`
2. Tổng hợp context từ `.agents/`, `.cursor/`, rules liên quan
3. Đồng bộ vào `AGENTS.md`
