# Jira Comment Templates — Agent Write-Back

Templates cho các comments agent ghi ngược về Jira qua `addCommentToJiraIssue` sau khi hoàn thành workflow.

---

## 1. Sau khi Create Plan hoàn thành

```markdown
🤖 **AI Agent — Plan Created**

📋 **Plan:** `PLAN_<NAME>.md`
📍 **Location:** `.agent/plans/PLAN_<NAME>.md`

**Tóm tắt:**
- **Scope:** [N] phases, [M] tasks
- **Files ảnh hưởng:** [Liệt kê top 3-5 files]
- **Estimated complexity:** Low / Medium / High

**Test Plan:**
- [N] happy path test cases
- [M] edge case test cases

**Non-goals (đã loại trừ):**
- [Liệt kê nếu có]

---
⏩ **Next:** Review plan bằng `/review-plan` → Implement bằng `/implement-plan`
```

---

## 2. Sau khi Debug hoàn thành

```markdown
🤖 **AI Agent — Debug Investigation Complete**

🔍 **Root Cause (Confidence: [X]%)**

| # | Nguyên nhân | File | Confidence |
|---|---|---|---|
| 1 | [Mô tả ngắn] | `[file:line]` | [X]% |
| 2 | [Mô tả ngắn nếu có] | `[file:line]` | [Y]% |

**Chi tiết nguyên nhân #1:**
[2-3 câu giải thích — code hiện tại làm gì sai, tại sao gây ra triệu chứng]

**Suggested Fix:**
```
// Tại [file:line]
// Trước:
[code cũ — tối đa 3 dòng]

// Sau:
[code đề xuất — tối đa 5 dòng]
```

**⚠️ Risk:** [Low/Medium/High] — [giải thích tại sao]

---
⏩ **Next:** Nếu đồng ý fix → `/create-plan <issue_key>` để tạo plan fix
📄 **Full Report:** `.agent/plans/<issue_key>_debug_report.md`
```

---

## 3. Sau khi Implementation hoàn thành (từng phase)

```markdown
🤖 **AI Agent — Phase [N] Implemented**

✅ **Phase [N]: [Phase Title]** — Hoàn thành

**Tasks đã triển khai:**
- [x] [Task 1 summary]
- [x] [Task 2 summary]

**Files changed:**
| File | Action | Description |
|---|---|---|
| `path/file.ts` | Modified | [Short desc] |
| `path/new.ts` | Created | [Short desc] |

**Test Results:**
- Lint: ✅ Passed
- Unit Test: ✅ [X]/[X] passed

---
📄 **Walkthrough:** `.agent/plans/<name>/phase-[N]-walkthrough.md`
⏩ Đang tiếp tục Phase [N+1]... (hoặc: ✅ Tất cả phases hoàn thành!)
```

---

## 4. Khi bắt đầu làm việc (transition status)

```markdown
🤖 **AI Agent — Starting Work**

Agent bắt đầu triển khai task này.
- **Workflow:** [create-plan / debug / implement]
- **Started at:** [timestamp]
```

---

## 5. Khi gặp vấn đề cần user input

```markdown
🤖 **AI Agent — Cần Input**

⚠️ Agent gặp vấn đề cần người dùng hỗ trợ:

**Vấn đề:**
[Mô tả vấn đề gặp phải]

**Câu hỏi:**
1. [Câu hỏi 1]
2. [Câu hỏi 2]

**Đề xuất:**
- Option A: [mô tả]
- Option B: [mô tả]

Vui lòng trả lời trong comment hoặc trong IDE chat.
```

---

## 6. Khi context thiếu thông tin

```markdown
🤖 **AI Agent — Cần Bổ Sung Thông Tin**

⚠️ Issue này thiếu một số thông tin cần thiết để agent hoạt động hiệu quả:

**Thiếu:**
- ❌ [Thông tin thiếu 1 — VD: Acceptance Criteria]
- ❌ [Thông tin thiếu 2 — VD: Steps to Reproduce]

**Đã có:**
- ✅ [Thông tin đã có]

**Gợi ý bổ sung:**
Xem template chuẩn tại: `.agents/skills/jira-workflow-bridge/resources/jira_task_templates.md`
```

---

## Quy tắc viết comment

1. **LUÔN** bắt đầu bằng `🤖 **AI Agent —` để phân biệt với human comments
2. **LUÔN** ghi timestamp (ít nhất ngày)
3. **KHÔNG** viết comment dài quá 500 từ — nếu cần chi tiết, reference file plan
4. **KHÔNG** paste toàn bộ code vào comment — chỉ snippet ngắn
5. **LUÔN** có section "Next" để hướng dẫn bước tiếp theo
6. **LUÔN** dùng markdown table cho dữ liệu có cấu trúc
