---
name: lesson-capture
description: |
  Thu thập và lưu trữ bài học có giá trị từ quá trình làm việc vào AGENTS.md,
  thông qua 4 cổng kiểm chứng chất lượng (Eligibility, Classification, Verification, User Approval).
  Chỉ kiến thức đã qua quality gate mới được ghi — chống "phản chủ" (encode bad habits).
  Kích hoạt khi user nói "ghi lesson", "capture lesson", "bài học gì",
  "lesson learned", hoặc được gọi tự động từ `/close-task` (Bước 5).
---

# Goal

Thu thập bài học có giá trị từ task/session vừa hoàn thành, QUA 4 cổng kiểm chứng chất lượng, rồi ghi vào `AGENTS.md` sections `## 9. Patterns & Decisions` và `## 10. Gotchas` — đảm bảo chỉ kiến thức đã verify, có evidence, và được user approve mới được lưu trữ.

---

# Instructions

## Bước 1: Gate 1 — Eligibility (Đáng ghi không?)

Nhìn lại conversation/task vừa xong. Quét tìm các ứng viên lesson:

| ✅ ĐÁNG GHI | 🚫 BỎ QUA |
|------------|----------|
| Pattern tốn effort lớn để phát hiện (debug 3+ vòng) | One-off workaround (fix tạm, chưa verify long-term) |
| Edge case bất thường, counter-intuitive | Preference cá nhân không có lý do kỹ thuật |
| Quyết định architecture đã chốt với user | Thông tin đã có trong docs/README/AGENTS.md |
| Cách tiếp cận SAI đã thử → lý do fail rõ ràng | Thông tin quá cụ thể (magic number, temp config, env-specific) |
| Gotcha mà dev mới hoặc agent khác sẽ mắc lại | Kiến thức chung ai cũng biết (common sense) |

**Nếu KHÔNG có lesson candidate nào → Báo user "Không có lesson đáng ghi" → KẾT THÚC.**

## Bước 2: Gate 2 — Classification + Scope

Với MỖI lesson candidate đã qua Gate 1, phân loại:

### 2.1. Type

| Type | Mô tả | Ghi vào section |
|------|--------|----------------|
| `PATTERN` | Cách làm tái sử dụng, đã chứng minh hiệu quả | `## 9. Patterns & Decisions` |
| `DECISION` | Quyết định architecture/design đã chốt | `## 9. Patterns & Decisions` |
| `GOTCHA` | Cạm bẫy, edge case cần tránh | `## 10. Gotchas` |
| `FAILURE` | Cách tiếp cận SAI đã thử → lý do fail | `## 10. Gotchas` |

### 2.2. Scope

| Scope | Áp dụng | Ví dụ |
|-------|---------|-------|
| `GLOBAL` | Mọi project, mọi ngôn ngữ | "Luôn viết test trước khi refactor shared code" |
| `REPO` | Chỉ project hiện tại | "SSE streaming cho presentation export trong Presenton" |
| `MODULE:<path>` | Chỉ folder/module cụ thể | "SQLite không hỗ trợ row-level lock trong `servers/fastapi/services/`" |

> **Lưu ý:** Nếu không chắc scope → mặc định `REPO`. Scope `GLOBAL` CHỈ dùng khi lesson thực sự universal.

## Bước 3: Gate 3 — Verification (Bằng chứng)

Kiểm tra TỪNG lesson đã qua Gate 2:

| Checklist | Bắt buộc? | Chi tiết |
|-----------|-----------|----------|
| Có **evidence**? | ✅ BẮT BUỘC | Test pass, terminal output, PR merged, user xác nhận |
| Có **counter-example**? | ✅ BẮT BUỘC | Biết khi nào KHÔNG áp dụng lesson này |
| Nếu `PATTERN`: dùng ≥2 lần? | ✅ cho PATTERN | Phải đã áp dụng thành công ít nhất 2 lần |
| Nếu `GOTCHA`: có reproduce context? | ✅ cho GOTCHA | Mô tả rõ điều kiện gây ra vấn đề |

**Lesson KHÔNG qua Gate 3 → LOẠI BỎ khỏi danh sách. KHÔNG đề xuất cho user.**

> **Ngoại lệ duy nhất:** `DECISION` chỉ cần 1 lần (quyết định architecture thường chỉ chốt 1 lần).

## Bước 4: Gate 4 — Batch User Approval

Gom TẤT CẢ lessons đã qua Gate 1→2→3, trình bày cho user 1 lần duy nhất:

### Format đề xuất:

```markdown
## 🧠 Lessons Learned — Đề xuất ghi nhận

### 1. [TYPE | SCOPE] Tiêu đề ngắn
- **Bài học:** Mô tả 1-2 câu, actionable
- **Evidence:** Bằng chứng cụ thể (task key, test result, etc.)
- **Không áp dụng khi:** Counter-example rõ ràng
→ Ghi vào: `AGENTS.md` → `## 9. Patterns & Decisions` (hoặc `## 10. Gotchas`)

### 2. [TYPE | SCOPE] Tiêu đề ngắn
...

**Approve all / Reject all / Edit từng cái?**
```

### User actions:

| User nói | Hành động |
|----------|----------|
| "Approve" / "OK" / "Đồng ý" | Ghi TẤT CẢ lessons vào AGENTS.md |
| "Approve 1, reject 2" | Chỉ ghi lesson được approve |
| "Edit 1: sửa thành ..." | Sửa nội dung rồi ghi |
| "Skip" / "Bỏ qua" | KHÔNG ghi gì, kết thúc |

## Bước 5: Ghi vào AGENTS.md

Sau khi user approve, append vào section tương ứng trong `AGENTS.md`:

### Format entry:

```markdown
N. **[Scope] Tiêu đề ngắn** — Mô tả 1-2 câu. _(Task: TICKET-KEY, Date: YYYY-MM-DD)_
```

### Quy tắc ghi:

1. `PATTERN` + `DECISION` → append vào `## 9. Patterns & Decisions`
2. `GOTCHA` + `FAILURE` → append vào `## 10. Gotchas`
3. Nếu section có placeholder `_Chưa có entry nào_` → Xóa placeholder trước khi ghi entry đầu tiên
4. Đánh số tự động (tiếp nối entry cuối)
5. Dùng `view_file` đọc AGENTS.md trước khi ghi → xác định vị trí chính xác

---

# Examples

## Ví dụ 1: Happy path — 2 lessons được capture

**Context:** Vừa close task PRES-37 (fix theme synchronization bug)

**Gate 1 scan:**
- ✅ Race condition pattern → Đáng ghi (edge case, debug 4 vòng)
- ✅ Architecture decision: SSE thay polling → Đáng ghi (chốt với user)
- 🚫 "Thêm console.log để debug" → Bỏ qua (one-off, ai cũng biết)

**Gate 2 classification:**
1. `GOTCHA | MODULE:servers/fastapi/services/` — Race condition theme save
2. `DECISION | REPO` — SSE streaming cho long-running tasks

**Gate 3 verification:**
1. ✅ Evidence: Bug PRES-37 đã fix, test pass. Counter-example: không áp dụng khi migrate PostgreSQL ✅
2. ✅ Evidence: đã dùng ở presentation export + agent pipeline (2 lần). Counter-example: không dùng cho task <5s ✅

**Gate 4 output:**

```
## 🧠 Lessons Learned — Đề xuất ghi nhận

### 1. [GOTCHA | MODULE:servers/fastapi/services/] Race condition theme save
- **Bài học:** Custom theme CRUD phải dùng application-level lock vì SQLite không hỗ trợ row-level locking
- **Evidence:** Bug PRES-37, đã fix và test pass
- **Không áp dụng khi:** Khi migrate sang PostgreSQL (có row-level lock native)
→ Ghi vào: `AGENTS.md` → `## 10. Gotchas`

### 2. [DECISION | REPO] SSE streaming cho long-running tasks
- **Bài học:** Dùng SSE thay polling cho tasks >30s, client tự reconnect khi mất kết nối
- **Evidence:** Đã áp dụng thành công ở presentation export + agent pipeline
- **Không áp dụng khi:** Task <5s, hoặc cần bidirectional communication (dùng WebSocket)
→ Ghi vào: `AGENTS.md` → `## 9. Patterns & Decisions`

**Approve all / Reject all / Edit từng cái?**
```

**User:** "Approve all"

**Agent ghi vào AGENTS.md:**

Trong `## 9. Patterns & Decisions`:
```
1. **[REPO] SSE streaming cho long-running tasks** — Dùng SSE thay polling cho tasks >30s, client tự reconnect. _(Task: PRES-37, Date: 2026-03-25)_
```

Trong `## 10. Gotchas`:
```
1. **[MODULE:servers/fastapi/services/] Race condition theme save** — Custom theme CRUD phải dùng application-level lock vì SQLite không hỗ trợ row-level locking. _(Task: PRES-37, Date: 2026-03-25)_
```

---

## Ví dụ 2: Không có lesson đáng ghi

**Context:** Vừa close task PRES-40 (thêm 1 button UI đơn giản)

**Gate 1 scan:**
- 🚫 "Thêm button vào header" → Kiến thức chung
- 🚫 "Import shadcn Button component" → Đã có trong docs

**Output:**
```
Không có lesson đáng ghi cho task này. Bỏ qua Lesson Capture.
```

---

## Ví dụ 3: Lesson bị loại ở Gate 3

**Context:** Vừa debug lỗi CSS

**Gate 1:** ✅ "Dùng !important để override theme" → Có vẻ đáng ghi?

**Gate 2:** `PATTERN | REPO` — CSS !important override

**Gate 3:**
- ❌ Evidence? Fix tạm, chưa verify có side effects
- ❌ Dùng ≥2 lần? Mới 1 lần
- ❌ Counter-example? Chưa biết khi nào KHÔNG dùng
→ **LOẠI BỎ** — Đây là workaround, không phải pattern.

---

# Constraints

## Về Quality Gates

- 🚫 KHÔNG ĐƯỢC tự ghi lesson mà KHÔNG qua user approval (Gate 4) — **Đây là constraint quan trọng nhất**
- 🚫 KHÔNG ĐƯỢC ghi workaround/one-off fix làm `PATTERN`
- 🚫 KHÔNG ĐƯỢC ghi kiến thức chung (ai cũng biết) — chỉ ghi insight specific cho project/module
- 🚫 KHÔNG ĐƯỢC ghi lesson mà không có evidence (Gate 3)
- 🚫 KHÔNG ĐƯỢC bịa lesson cho có — nếu không có gì đáng ghi thì SKIP
- ✅ LUÔN phân loại Type + Scope TRƯỚC khi đề xuất (Gate 2)
- ✅ LUÔN ghi rõ "Không áp dụng khi" cho MỖI lesson (counter-example bắt buộc)
- ✅ LUÔN trình bày dạng batch 1 lần — KHÔNG pop-up từng lesson riêng lẻ

## Về nội dung

- 🚫 KHÔNG ĐƯỢC ghi thông tin nhạy cảm (passwords, tokens, API keys, PII)
- 🚫 KHÔNG ĐƯỢC ghi thông tin quá cụ thể sẽ nhanh outdated (hardcoded values, temp configs)
- ✅ Mỗi lesson phải actionable — đọc xong biết phải làm gì
- ✅ Mỗi lesson phải có ticket reference (nếu có) và ngày ghi

## Về AGENTS.md

- 🚫 KHÔNG ĐƯỢC xóa entries cũ khi ghi entry mới
- 🚫 KHÔNG ĐƯỢC sửa entries đã có (chỉ append)
- ✅ LUÔN dùng `view_file` đọc AGENTS.md TRƯỚC khi ghi → xác nhận vị trí chính xác
- ✅ LUÔN đánh số tiếp nối (đếm entries hiện có + 1)

---

# Các Skills liên quan

- `.agents/skills/close-task/SKILL.md` — Gọi lesson-capture ở Bước 5
- `AGENTS.md` → `## 9. Patterns & Decisions` — Nơi lưu PATTERN + DECISION
- `AGENTS.md` → `## 10. Gotchas` — Nơi lưu GOTCHA + FAILURE

<!-- Generated by Skill Generator v3.2 -->
