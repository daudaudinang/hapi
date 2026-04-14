---
description: |
  Senior review triển khai so với plan + boundary; trong delivery loop LP thường đứng sau implement.
  Canonical trong repo; khác với skill chi tiết (personas, 4 phase).
---

# /lp:review-implement `<plan_file_path>`

> **Skill (chi tiết workflow, personas):** `.agents/skills/review-implement/SKILL.md`  
> **Lệnh tương đương (không prefix lp):** `/review-implement`

## Vai trò trong delivery loop

Sau `/lp:implement` hoặc `/lp:implement-plan`, bước này kiểm tra:

- Code thực tế vs **AC / phase** trong plan
- **Execution boundary** (`Allowed` / `Do NOT modify`)
- Rủi ro kỹ thuật (blast radius nên dùng GitNexus khi sửa shared path)

Trong **LittlePea + `lp_pipeline.py`**:

```bash
python ~/.claude/skills/lp-pipeline-orchestrator/scripts/lp_pipeline.py start-followup \
  --workflow-id <ID> \
  --step review-implement
```

- **FAIL / NEEDS_REVISION** → quay lại implement (sửa code, cập nhật walkthrough nếu có).
- **PASS** → bước tiếp theo thường là **qa-automation** (xem `.agents/commands/lp:implement.md`).

Script có thể chỉ có tại `~/.claude/skills/...`; không có script thì chạy review **thủ công** theo skill.

## Trigger

```text
/lp:review-implement <plan_file_path>
```

**Ví dụ plan fix auto-resume:**

```text
plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md
```

## Workflow (tóm tắt)

1. Đọc `.agents/skills/review-implement/SKILL.md` (bắt buộc cho format report đầy đủ).
2. Nạp plan → boundary → danh sách phase / AC.
3. Đối chiếu diff hoặc file đã đổi với plan; ghi **severity** (Critical / Major / Minor).
4. Còn gap → dev sửa → **re-review** phần delta.

## Artifact gợi ý

- Pipeline Codex/LP: `.codex/pipeline/<scope>/04-review-implement.output.md` hoặc `.agents/pipeline/...`
- Giữ cross-link tới plan version đã review.

## Next step

```text
/lp:close-task <ticket_key>
```

Hoặc (có QA tự động): chạy follow-up `qa-automation` theo `lp:implement`.

## Liên kết nhanh

| Lệnh | Mục đích |
|------|----------|
| `/lp:review-implement` | Review post-implement (tài liệu này + skill) |
| `/lp:review-plan` | Review **plan** trước khi code |
| `/lp:implement-plan` | Triển khai từ plan |
| `/lp:implement` | Vòng delivery đầy đủ (state + follow-up) |
