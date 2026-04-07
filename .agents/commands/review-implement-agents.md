## /review-implement-agents – Review implementation bằng subagents (Option B)

**Cách dùng**

```text
/review-implement-agents <plan_file_path>
```

---

## Nguyên tắc

- Workflow này **CHỈ REVIEW**, **KHÔNG IMPLEMENT CODE**.
- Không hallucinate: nếu không đọc được plan/walkthrough/code thì phải báo rõ “thiếu dữ liệu”.
- Dẫn chứng cụ thể: ưu tiên `file:line` khi báo issue.
- Nếu không invoke được một subagent, hãy tự làm phần đó theo đúng output contract (fallback).
- Nếu bị “collision” khi invoke bằng `/name`, hãy invoke bằng câu lệnh tự nhiên:
  - “Use the `review-implement-context` subagent to …”

---

## Workflow

1) Dùng `review-implement-context` để:
   - Đọc plan
   - Tìm walkthrough folder
   - Trích xuất “Files changed”
   - Tổng hợp scope review

2) Dùng `review-implement-traceability` để verify “Code vs Plan”:
   - requirements covered / missing / scope creep (kèm `file:line`)

3) Dùng `review-implement-quality` để review:
   - correctness / robustness / edge cases / style (kèm `file:line`)

4) Dùng `review-implement-impact-risk` để review:
   - regression / integration / data / performance / security (kèm `file:line`)

5) Dùng `review-implement-report-writer` để tổng hợp report cuối theo template của `/review-implement`.

---

## Ví dụ (copy/paste)

```text
/review-implement-agents .agent/plans/PLAN_SOMETHING.md
```
