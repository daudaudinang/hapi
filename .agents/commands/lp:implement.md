---
description: |
  LittlePea delivery loop — implement + sync pipeline + follow-up (review-implement, QA).
  Canonical runtime doc trong repo này. Khác /lp:implement-plan (chỉ skill implement đơn).
---

# /lp:implement `<plan_file | plan_name | workflow_id>`

> **Khác `/lp:implement-plan`:** Lệnh này mô tả **vòng delivery** (state + sync + follow-up), không chỉ chạy skill implement một lần.
>
> **Implement thuần từ file plan (không SQLite pipeline):** dùng `/lp:implement-plan <path>` hoặc đọc `.agents/skills/implement-plan/SKILL.md`.

## Source of truth (skill / orchestrator)

1. `.claude/skills/lp-pipeline-orchestrator/SKILL.md` (nếu có trên máy / đã đồng bộ)
2. `.claude/skills/lp-state-manager/SKILL.md`
3. Agent / skill: `@implement-plan` → `.agents/skills/implement-plan/SKILL.md`

## Preconditions

- Workflow (nếu dùng `lp_pipeline.py`) có `plan_approved = true`
- User **explicit** muốn implement (không tự chạy khi chỉ đang plan)

## Script `lp_pipeline.py`

Đường dẫn tham chiếu trong skill gốc:

```text
~/.claude/skills/lp-pipeline-orchestrator/scripts/lp_pipeline.py
```

Trong workspace **hapi** script này **có thể không có** — khi đó: chạy từ máy local đã cài LittlePea, hoặc đồng bộ skill vào repo, hoặc bỏ qua bước SQLite và dùng `/lp:implement-plan <plan_file>` thủ công.

## Workflow chuẩn (có pipeline)

1. Resolve workflow theo `workflow_id`, `plan_name`, hoặc `plan_file`.
2. Bắt đầu bước implement:

```bash
python ~/.claude/skills/lp-pipeline-orchestrator/scripts/lp_pipeline.py start-implement \
  --plan-file .agents/plans/PLAN_<NAME>.md
```

**Ví dụ plan trong repo hapi (bugfix auto-resume):**

```text
plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md
```

3. Spawn / gọi **`@implement-plan`** (đọc `.agents/skills/implement-plan/SKILL.md`).
4. Khi có `03-implement-plan.output.md`, sync:

```bash
python ~/.claude/skills/lp-pipeline-orchestrator/scripts/lp_pipeline.py sync-output \
  --workflow-id <ID> \
  --output-file .agents/pipeline/PLAN_<NAME>/03-implement-plan.output.md \
  --contract-file .agents/pipeline/PLAN_<NAME>/03-implement-plan.output.contract.json \
  --plan-file .agents/plans/PLAN_<NAME>.md
```

5. Nếu output **`WAITING_USER`** → hỏi user.
6. Nếu **`PASS`** → vào **delivery loop** (bước dưới).

## Delivery loop (follow-up)

```bash
python ~/.claude/skills/lp-pipeline-orchestrator/scripts/lp_pipeline.py start-followup \
  --workflow-id <ID> \
  --step review-implement
```

**Vòng lặp:**

| Bước | Nếu FAIL / NEEDS_REVISION |
|------|---------------------------|
| `review-implement` | Quay lại `implement-plan` (sửa code theo report) |
| `qa-automation` | Quay lại `implement-plan` |
| `qa-automation` **PASS** | Sẵn sàng `/lp:close-task` (hoặc close-task tương đương) |

## Fallback không `lp_pipeline.py`

1. `/lp:implement-plan plans/.../FIX_IMPLEMENTATION_PLAN_20260413.md`
2. `/lp:review-implement` hoặc review thủ công theo `.codex/pipeline/...`
3. QA / test local → commit

## Liên kết nhanh

| Lệnh | Mục đích |
|------|----------|
| `/lp:implement-plan <file>` | Chỉ triển khai theo plan (skill) |
| `/lp:implement` (tài liệu này) | Định nghĩa vòng delivery + pipeline SQLite |
| `/lp:pipeline` | Catalog toàn bộ `/lp:*` |
