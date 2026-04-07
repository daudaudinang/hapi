---
description: Catalog workflow cho bộ commands /lp:* — giúp chọn đúng chuỗi skill theo tình huống.
---

# /lp:pipeline

> File này là **workflow catalog** cho namespace `/lp:*`.
> Dùng khi cần chọn đúng chuỗi skill thay vì gọi từng lệnh theo trí nhớ.

## A. Xây feature mới

```text
1. /lp:create-plan <feature-or-scope>
2. /lp:review-plan <plan_file>
3. /lp:implement-plan <plan_file>
4. /lp:review-implement <plan_file>
5. /lp:close-task <ticket>
```

**Decision gate:**
- Nếu plan bị Blocker/Major → quay lại bước 1
- Nếu implementation lệch plan → sửa theo review rồi re-run bước 4

## B. Điều tra bug

```text
1. /lp:debug-investigator <symptom/log/stacktrace>
2. /lp:create-plan <fix-scope>            (nếu cần plan)
3. /lp:implement-plan <plan_file>         (hoặc implement flow nhỏ)
4. /lp:review-implement <plan_file>
5. /lp:close-task <ticket>
```

**Rule:** `/lp:debug-investigator` chỉ điều tra, không tự ý fix.

## C. Đi từ Jira issue

```text
1. /lp:jira-workflow-bridge <ISSUE-KEY> --target create-plan
2. /lp:review-plan <plan_file>
3. /lp:implement-plan <plan_file>
4. /lp:review-implement <plan_file>
5. /lp:close-task <ISSUE-KEY>
```

## D. Cập nhật agent context

```text
1. /lp:init-project
2. /lp:sync-agents-context
3. /lp:lesson-capture   (nếu có lesson mới cần ghi)
```

## E. Sau khi xong task

```text
/lp:close-task <ticket> [--files ...] [--time ...]
```

Nếu phát hiện lesson có giá trị nhưng chưa muốn close task ngay:

```text
/lp:lesson-capture
```
