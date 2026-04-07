---
description: Alias /lp:lesson-capture → skill lesson-capture. Wrapper mỏng cho workflow ghi nhận lessons learned.
---

# /lp:lesson-capture

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/lesson-capture/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:lesson-capture`
- Skill đích: `lesson-capture`

## Trigger

```text
/lp:lesson-capture
```

## Workflow

1. Đọc `.agents/skills/lesson-capture/SKILL.md`
2. Chạy 4 gates: Eligibility → Classification → Verification → User Approval
3. Nếu được approve → ghi vào `AGENTS.md`

## Gợi ý

- Thường được gọi từ `/lp:close-task`
- Có thể gọi riêng khi vừa phát hiện pattern/gotcha quan trọng
