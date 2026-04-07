---
description: Alias /lp:jira-workflow-bridge → skill jira-workflow-bridge. Wrapper mỏng cho Jira-driven workflows.
---

# /lp:jira-workflow-bridge <issue_key_or_url>

> **🔗 SKILL FILE (Source of Truth)**: `.agents/skills/jira-workflow-bridge/SKILL.md`
>
> Alias này chỉ là entry point. PHẢI đọc `SKILL.md` trước khi thực hiện.

## Alias Mapping

- Alias: `/lp:jira-workflow-bridge`
- Skill đích: `jira-workflow-bridge`

## Trigger

```text
/lp:jira-workflow-bridge <ISSUE-KEY> --target create-plan
/lp:jira-workflow-bridge <ISSUE-KEY> --target debug
/lp:jira-workflow-bridge <ISSUE-KEY> --target implement-plan
/lp:jira-workflow-bridge <ISSUE-KEY> --target create-issue
```

## Workflow

1. Đọc `.agents/skills/jira-workflow-bridge/SKILL.md`
2. Fetch issue/epic/comments/attachments từ Jira
3. Chuẩn hóa context cho workflow đích
4. Route sang skill tương ứng hoặc tạo issue mới

## Gợi ý

- Dùng alias này khi input bắt đầu từ Jira
- Nếu đã có đầy đủ context cục bộ, có thể gọi thẳng skill đích `/lp:create-plan`, `/lp:debug-investigator`, ...
