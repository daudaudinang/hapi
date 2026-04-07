---
description: Namespace command router cho bộ LittlePea pipeline skills. Dùng /lp:<skill-name> để map trực tiếp sang skill tương ứng.
---

# /lp:index

> **Mục tiêu:** tạo một namespace thống nhất để tham chiếu tới pipeline skills theo cú pháp:
>
> ```text
> /lp:<skill-name> <args>
> ```
>
> Mỗi alias trong namespace này là một **entry point mỏng**. Source of truth vẫn là `SKILL.md` của skill tương ứng.

## Quy tắc bắt buộc

1. Khi user gọi `/lp:<skill-name>`, agent **PHẢI** đọc file:
   `.agents/skills/<skill-name>/SKILL.md` trước khi thực thi.
2. Nếu skill có command cũ tương đương (`/create-plan`, `/debug`, `/review-plan`, ...),
   alias `/lp:*` chỉ đóng vai trò **wrapper/reference dễ nhớ**, không thay thế source of truth.
3. Nếu input là Jira issue key/URL và workflow phù hợp, có thể bridge qua
   `jira-workflow-bridge` trước khi chạy skill đích.

## Danh sách alias hiện có

| Alias | Skill đích | Command tương đương | Dùng khi |
|------|------------|---------------------|----------|
| `/lp:create-plan` | `create-plan` | `/create-plan` | Lập plan triển khai |
| `/lp:review-plan` | `review-plan` | `/review-plan` | Review plan trước khi code |
| `/lp:implement-plan` | `implement-plan` | `/implement-plan` | Triển khai từ plan file |
| `/lp:review-implement` | `review-implement` | `/review-implement` | Senior review sau implement |
| `/lp:debug-investigator` | `debug-investigator` | `/debug` | Điều tra root cause |
| `/lp:close-task` | `close-task` | `/close-task` | Commit + Jira Done + worklog + lessons |
| `/lp:jira-workflow-bridge` | `jira-workflow-bridge` | không có alias ngắn riêng | Đọc/tạo Jira và route sang workflow |
| `/lp:init-project` | `init-project` | `/init` | Khởi tạo/cập nhật AGENTS.md |
| `/lp:sync-agents-context` | `sync-agents-context` | `/sync-agents-context` | Đồng bộ context rules |
| `/lp:lesson-capture` | `lesson-capture` | dùng trực tiếp theo skill | Ghi lesson vào AGENTS.md |
| `/lp:pipeline` | catalog workflow | không có | Xem luồng dùng skills |

## Workflow tham chiếu nhanh

### 1) Feature flow

```text
/lp:create-plan <feature>
→ /lp:review-plan <plan_file>
→ /lp:implement-plan <plan_file>
→ /lp:review-implement <plan_file>
→ /lp:close-task <ticket>
```

### 2) Bug flow

```text
/lp:debug-investigator <bug_or_log>
→ /lp:create-plan <fix_scope>        (nếu cần plan fix)
→ /lp:implement-plan <plan_file>     (hoặc /implement nếu fix nhỏ)
→ /lp:review-implement <plan_file>
→ /lp:close-task <ticket>
```

### 3) Jira-driven flow

```text
/lp:jira-workflow-bridge <ISSUE-KEY> --target create-plan
/lp:jira-workflow-bridge <ISSUE-KEY> --target debug
/lp:jira-workflow-bridge <ISSUE-KEY> --target implement-plan
```

## Gợi ý naming

- Ưu tiên dùng đúng tên folder skill: `/lp:<folder-name>`
- Không rút gọn tên skill trong namespace `/lp:*` để tránh map nhầm
- Nếu cần shorthand về sau, tạo thêm alias riêng nhưng vẫn giữ `/lp:<skill-name>` làm canonical
