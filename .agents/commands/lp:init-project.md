---
description: Alias /lp:init-project → skill init-project. Wrapper mỏng cho workflow khởi tạo/cập nhật AGENTS.md.
---

# /lp:init-project

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/init-project/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:init-project`
- Skill đích: `init-project`
- Command tương đương: `/init`

## Trigger

```text
/lp:init-project
```

## Workflow

1. Đọc `.agents/skills/init-project/SKILL.md`
2. Thu thập project structure, commands, style guides
3. Tạo/cập nhật `AGENTS.md`

## Next Step gợi ý

```text
/lp:sync-agents-context
```
