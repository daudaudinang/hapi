---
description: Alias /lp:debug-investigator → skill debug-investigator. Wrapper mỏng cho workflow root cause analysis.
---

# /lp:debug-investigator <bug_or_log>

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/debug-investigator/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:debug-investigator`
- Skill đích: `debug-investigator`
- Command tương đương: `/debug`

## Trigger

```text
/lp:debug-investigator <mô tả lỗi | log | stacktrace | issue_key>
```

## Workflow

1. Đọc `.agents/skills/debug-investigator/SKILL.md`
2. Điều tra theo hypothesis-driven flow
3. Không tự ý sửa code trong command này
4. Xuất debug report + đề xuất hướng fix

## Next Step gợi ý

```text
/lp:create-plan <fix_scope>
```
