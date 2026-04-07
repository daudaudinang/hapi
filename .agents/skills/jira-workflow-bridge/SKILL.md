---
name: jira-workflow-bridge
description: |
  Cầu nối giữa Jira và các workflow của AI Agent (create-plan, debug, implement-plan).
  Đọc Jira issue qua MCP Atlassian, trích xuất context đầy đủ, chuyển sang workflow phù hợp,
  và cập nhật kết quả ngược về Jira. Cũng hỗ trợ TẠO Jira task chuẩn từ yêu cầu user.
  Kích hoạt khi user chạy `/create-plan PROJ-123`, `/debug PROJ-456`,
  hoặc yêu cầu "đọc task Jira", "lấy issue", "sync Jira", "tạo task Jira".
---

# Goal

Tự động đọc Jira issue, trích xuất đầy đủ context (mô tả, acceptance criteria, attachments, comments, linked issues, epic context), chuyển đổi thành input chuẩn cho các workflow agent (`create-plan`, `debug`, `implement-plan`) — cập nhật kết quả ngược về Jira — và tạo Jira task mới theo chuẩn format khi cần.

---

# Prerequisites

## MCP Atlassian Server

Skill này YÊU CẦU MCP server `atlassian-mcp-server` đã được cấu hình và bật.

**19 tools có sẵn:**

| Tool | Mục đích |
|---|---|
| `getJiraIssue` | Lấy chi tiết 1 issue |
| `searchJiraIssuesUsingJql` | Tìm issues bằng JQL |
| `createJiraIssue` | **Tạo issue mới** |
| `editJiraIssue` | Chỉnh sửa issue |
| `transitionJiraIssue` | Chuyển trạng thái issue |
| `getTransitionsForJiraIssue` | Lấy danh sách trạng thái có thể chuyển |
| `addCommentToJiraIssue` | Thêm comment |
| `addWorklogToJiraIssue` | Ghi worklog |
| `getJiraIssueRemoteIssueLinks` | Lấy remote links |
| `getVisibleJiraProjects` | Danh sách projects |
| `getJiraProjectIssueTypesMetadata` | Metadata issue types của project |
| `getJiraIssueTypeMetaWithFields` | Fields metadata theo issue type |
| `lookupJiraAccountId` | Tìm account ID từ tên/email |
| `atlassianUserInfo` | Thông tin user hiện tại |
| `getAccessibleAtlassianResources` | Danh sách resources có quyền |
| `jiraRead` | Đọc dữ liệu Jira (generic) |
| `jiraWrite` | Ghi dữ liệu Jira (generic) |
| `search` | Tìm kiếm chung |
| `fetch` | Fetch URL |

---

# Instructions

## PHẦN A: ĐỌC JIRA ISSUE → CHUYỂN SANG WORKFLOW

### Bước 0: Nhận diện input & xác định workflow target

1. **Parse input** từ user command:
   - `/create-plan PROJ-123` → Issue key: `PROJ-123`, Target: `create-plan`
   - `/debug PROJ-456` → Issue key: `PROJ-456`, Target: `debug`
   - `/implement-plan PROJ-789` → Issue key: `PROJ-789`, Target: `implement-plan`
   - Nếu user paste URL: `https://company.atlassian.net/browse/PROJ-123` → Extract issue key

2. **Xác định workflow target:**

   | Input pattern | Target workflow | Điều kiện |
   |---|---|---|
   | `/create-plan <issue_key>` | `create-plan` | Issue key hợp lệ (có `-`) |
   | `/debug <issue_key>` | `debug` | Issue key hợp lệ |
   | `/implement-plan <issue_key>` | `implement-plan` | Issue key + có plan file sẵn |
   | Chỉ có issue key, không có command | Tự detect | Dựa vào issue type (xem Bước 1.3) |

3. **Nếu input KHÔNG phải issue key** (VD: `/create-plan font-combobox`):
   - → SKIP skill này, chuyển thẳng sang workflow gốc (không cần Jira)

### Bước 1: 📥 Fetch dữ liệu từ Jira

#### 1.1. Lấy thông tin issue chính

```
getJiraIssue:
  issueKey: "<ISSUE_KEY>"
```

**Trích xuất các fields quan trọng:**

| Jira Field | Mục đích | Ghi chú |
|---|---|---|
| `summary` | Tiêu đề task | Dùng cho tên plan/report |
| `description` | Mô tả chi tiết | **QUAN TRỌNG NHẤT** — chứa yêu cầu + context |
| `issuetype.name` | Xác định workflow | Bug → debug, Story/Task → create-plan |
| `status.name` | Trạng thái hiện tại | Kiểm tra task đã done chưa |
| `priority.name` | Mức độ ưu tiên | Ảnh hưởng scope plan |
| `assignee` | Người được gán | Context |
| `reporter` | Người tạo | Context |
| `labels` | Labels | Phân loại kỹ thuật |
| `components` | Components | Xác định module liên quan |
| `fixVersions` | Target version | Sprint/release context |
| `parent` / `epicKey` | Epic cha | Context rộng hơn |
| `issuelinks` | Linked issues | Dependencies, blockers |
| `subtasks` | Sub-tasks | Scope chi tiết |
| `comment` | Discussions | Context bổ sung, quyết định đã chốt |
| `attachment` | Files đính kèm | Screenshots, mockups |

#### 1.2. Lấy thông tin Epic/Parent (nếu có)

**Nếu issue có `parent` hoặc `epicKey`:**

```
getJiraIssue:
  issueKey: "<EPIC_KEY>"
```

→ Trích xuất epic context: mục tiêu tổng thể, scope cấp cao.

#### 1.3. Lấy linked issues (nếu cần context thêm)

Nếu cần chi tiết linked issue:

```
getJiraIssue:
  issueKey: "<LINKED_ISSUE_KEY>"
```

**Chỉ lấy max 3 linked issues** quan trọng nhất (blockers, is-blocked-by).

#### 1.4. Xác định workflow phù hợp (nếu chưa rõ)

Dựa vào `issuetype.name`:

| Issue Type | Workflow mặc định | Lý do |
|---|---|---|
| `Bug` | `debug` | Cần điều tra nguyên nhân trước |
| `Story` | `create-plan` | Cần phân tích + lập plan |
| `Task` | `create-plan` | Cần lập plan triển khai |
| `Epic` | `create-plan` | Cần plan tổng thể |
| `Sub-task` | `create-plan` (đơn giản) | Scope nhỏ, plan ngắn |
| `Improvement` | `create-plan` | Cải tiến feature |

**Nếu user đã chỉ định command** (VD: `/debug PROJ-123` mà issue type là Story) → **Dùng command của user**, KHÔNG override.

### Bước 2: 📋 Cấu trúc hóa context

#### 2.1. Tạo Structured Context Block

Tổng hợp thông tin đã fetch thành block context chuẩn:

```markdown
## 📋 JIRA ISSUE CONTEXT

### Issue Info
- **Key:** PROJ-123
- **Type:** Story | Bug | Task | Epic
- **Summary:** [Tiêu đề issue]
- **Status:** To Do | In Progress | Done
- **Priority:** Critical | High | Medium | Low
- **Assignee:** [Tên]
- **Reporter:** [Tên]
- **Labels:** [label1, label2]
- **Components:** [component1, component2]
- **Sprint/Version:** [Sprint X / v1.2.0]

### Epic Context (nếu có)
- **Epic:** PROJ-100 — [Epic summary]
- **Epic Goal:** [Mô tả mục tiêu epic]

### Description (nguyên văn từ Jira)
[Nội dung description đầy đủ]

### Acceptance Criteria (trích từ description hoặc custom field)
- [ ] [Criterion 1]
- [ ] [Criterion 2]

### Linked Issues
- 🔗 Blocks: PROJ-124 — [summary] (Status: [status])
- 🔗 Is blocked by: PROJ-122 — [summary] (Status: [status])

### Sub-tasks
- [ ] PROJ-123-1: [Sub-task summary] (Status: [status])

### Key Comments (chỉ giữ comments có nội dung kỹ thuật/quyết định)
- **[Tên người]** ([ngày]): [Tóm tắt comment]

### Attachments
- 📎 [filename.png] — Screenshot UI mockup
```

#### 2.2. Trích xuất thông tin đặc thù theo issue type

**Cho Bug issues — bổ sung vào context:**

```markdown
### 🐛 Bug Details
- **Steps to Reproduce:** [Trích từ description]
- **Expected Result:** [Kết quả mong đợi]
- **Actual Result:** [Kết quả thực tế]
- **Environment:** [Browser/OS/Device]
- **Frequency:** [Luôn/Thỉnh thoảng/Hiếm]
- **Error Log/Screenshot:** [Nếu có]
- **Execution Flow:** [Luồng thực thi gây lỗi nếu có]
```

**Cho Feature/Story issues — bổ sung vào context:**

```markdown
### 🆕 Feature Details
- **User Story:** As a [role], I want [action], so that [benefit]
- **Scope:**
  - ✅ In scope: [Liệt kê]
  - ❌ Out of scope: [Liệt kê]
- **Business Rules:** [Liệt kê]
- **Manual Test Expected Results:** [Test scenarios + expected]
```

#### 2.3. Đánh giá chất lượng thông tin

Chấm điểm context quality:

| Tiêu chí | Có ✅ | Thiếu ❌ |
|---|---|---|
| Description đầy đủ | +2 | -2 |
| Acceptance Criteria rõ ràng | +2 | -1 |
| Steps to Reproduce (bug) | +2 | -2 |
| Scope In/Out | +1 | -1 |
| Linked issues | +1 | 0 |
| Business rules | +1 | -1 |

**Quy tắc:**
- **Score ≥ 5:** Context đầy đủ → Tiếp tục sang workflow
- **Score 2-4:** Context tạm đủ → Ghi chú phần thiếu, vẫn tiếp tục nhưng cảnh báo user
- **Score < 2:** Context quá thiếu → **DỪNG**, báo user bổ sung thông tin trên Jira hoặc mô tả trực tiếp

### Bước 3: 🔀 Chuyển sang workflow target

#### 3.1. Mapping context → workflow input

**Cho `create-plan`:**
- Feature name = Issue summary (chuẩn hóa UPPERCASE_UNDERSCORE)
- Yêu cầu = Description + Acceptance Criteria
- Scope = In scope / Out of scope
- Type = Issuetype → Loại yêu cầu
- → Agent sẽ chạy `Ensure GitNexus Index` (Bước 0.5) để đảm bảo code graph fresh. Architecture context đã nạp qua `AGENTS.md` (system prompt tự động).
- → Sau đó tiếp tục workflow create-plan từ **Phase 2** (Khám phá codebase)
- → Jira context hoàn thành Phase 1 (thu thập yêu cầu nghiệp vụ)

**Cho `debug`:**
- Mô tả lỗi = Description + Actual Result
- Steps to Reproduce = Steps from issue
- Expected Result = Expected từ issue
- Frequency, Environment, Severity = Từ issue fields
- → Agent tiếp tục workflow debug từ **Bước 2** (Hiểu hệ thống), vì Bước 0+1 đã hoàn thành.

**Cho `implement-plan`:**
1. Kiểm tra plan file tại `.agent/plans/PLAN_<normalized_summary>.md`
2. **Nếu có** → Gọi implement-plan workflow với path
3. **Nếu chưa có** → Báo user: "Chưa có plan. Chạy `/create-plan <issue_key>` trước."

#### 3.2. Thực thi workflow

1. Đọc skill file tương ứng
2. Truyền Jira context làm input
3. Ghi nhận issue key để cập nhật kết quả ở Bước 4

### Bước 4: 📤 Cập nhật kết quả về Jira

#### 4.1. Sau khi create-plan hoàn thành

```
addCommentToJiraIssue:
  issueKey: "<ISSUE_KEY>"
  comment: |
    🤖 **AI Agent — Plan Created**
    📋 **Plan:** `PLAN_<NAME>.md` tại `.agent/plans/`
    **Scope:** [N] phases, [M] tasks
    **Files ảnh hưởng:** [Liệt kê chính]
    ⏩ Next: `/review-plan` → `/implement-plan`
```

#### 4.2. Sau khi debug hoàn thành

```
addCommentToJiraIssue:
  issueKey: "<ISSUE_KEY>"
  comment: |
    🤖 **AI Agent — Debug Report**
    🔍 **Root Cause (Confidence: [X]%):** [Tóm tắt]
    **Location:** `[file:line]`
    **Suggested Fix:** [Mô tả ngắn]
    ⏩ Next: `/create-plan <issue_key>` để tạo plan fix
```

#### 4.3. Transition issue (CHỈ khi user yêu cầu)

```
# Kiểm tra transitions có sẵn
getTransitionsForJiraIssue:
  issueKey: "<ISSUE_KEY>"

# Transition (CHỈ khi user yêu cầu)
transitionJiraIssue:
  issueKey: "<ISSUE_KEY>"
  transitionId: "<ID>"
```

**⚠️ KHÔNG tự ý transition** — luôn hỏi user trước.

---

## PHẦN B: TẠO JIRA TASK MỚI

### Bước B.0: Nhận diện yêu cầu tạo task

Kích hoạt khi user nói:
- "Tạo task Jira cho..."
- "Tạo issue trên Jira..."
- "Log bug trên Jira..."
- "Tạo story/task/bug trên Jira..."

### Bước B.1: Thu thập thông tin

1. **Xác định project**: Hỏi user hoặc lấy từ context
   ```
   getVisibleJiraProjects
   ```
   → Hiển thị danh sách projects → User chọn

2. **Xác định issue type**: Hỏi user hoặc suy từ context
   ```
   getJiraProjectIssueTypesMetadata:
     projectKey: "<PROJECT_KEY>"
   ```
   → Biết issue types có sẵn + required fields

3. **Lấy metadata fields cho issue type đã chọn:**
   ```
   getJiraIssueTypeMetaWithFields:
     projectKey: "<PROJECT_KEY>"
     issueTypeId: "<ISSUE_TYPE_ID>"
   ```
   → Biết required fields + allowed values

4. **Xác định assignee** (nếu cần):
   ```
   lookupJiraAccountId:
     query: "<tên hoặc email>"
   ```

### Bước B.2: Tạo nội dung task theo template chuẩn

Dựa vào issue type, sử dụng template từ `resources/jira_task_templates.md`:

**Cho Feature/Story/Task:**
- Summary: 1-2 câu mô tả
- Description: Theo template Feature (gồm Context, Scope In/Out, Business Rules, Acceptance Criteria, Technical Context, Manual Test, Notes for Agent)

**Cho Bug:**
- Summary: Mô tả bug ngắn gọn
- Description: Theo template Bug (gồm Bug Details, Steps to Reproduce, Expected vs Actual, Error Context, Execution Flow, Technical Scope, Acceptance Criteria, Notes for Agent)

**Cho Epic:**
- Summary: Mục tiêu tổng thể
- Description: Theo template Epic (gồm Epic Goal, Context, Scope, Child Tasks, Architecture Notes)

### Bước B.3: Tạo issue trên Jira

```
createJiraIssue:
  projectKey: "<PROJECT_KEY>"
  issueType: "<Type>"
  summary: "<Summary>"
  description: "<Description theo template>"
  # Optional fields tùy metadata:
  priority: "<Priority>"
  assignee: "<Account ID>"
  labels: ["label1", "label2"]
  components: ["component1"]
```

### Bước B.4: Bổ sung links và sub-tasks (nếu cần)

Nếu task cần link tới epic hoặc task khác:

```
editJiraIssue:
  issueKey: "<NEW_ISSUE_KEY>"
  # Thêm epic link, parent, hoặc các fields bổ sung
```

### Bước B.5: Thông báo kết quả

Hiển thị cho user:
```
✅ Đã tạo issue: PROJ-XXX
📋 Type: [Issue Type]
📌 Summary: [Summary]
🔗 Link: https://[domain].atlassian.net/browse/PROJ-XXX

⏩ Bước tiếp:
- Tạo plan: /create-plan PROJ-XXX
- Debug (nếu bug): /debug PROJ-XXX
```

---

## PHẦN C: QUẢN LÝ ISSUES (ĐỌC & CẬP NHẬT)

### Tìm kiếm issues

```
searchJiraIssuesUsingJql:
  jql: "project = PROJ AND status = 'In Progress' AND assignee = currentUser()"
```

**JQL patterns hữu ích:**

| Mục đích | JQL |
|---|---|
| Issues assigned to me | `assignee = currentUser() AND status != Done` |
| Bugs chưa fix | `issuetype = Bug AND status != Done AND project = PROJ` |
| Issues trong sprint hiện tại | `sprint in openSprints() AND project = PROJ` |
| Issues liên quan đến module | `labels = "frontend" AND project = PROJ` |
| Issues cập nhật gần đây | `updated >= -7d AND project = PROJ` |

### Cập nhật issue

```
editJiraIssue:
  issueKey: "<ISSUE_KEY>"
  # Update fields: summary, description, priority, labels, etc.
```

### Ghi worklog

```
addWorklogToJiraIssue:
  issueKey: "<ISSUE_KEY>"
  timeSpent: "2h"
  comment: "Triển khai Phase 1"
```

---

# Examples

## Ví dụ 1: /create-plan với Jira Feature Task

**Input:**
```
/create-plan MOT-234
```

**Agent thực hiện:**

1. **Bước 0:** Parse → Issue key: `MOT-234`, Target: `create-plan`
2. **Bước 1:** `getJiraIssue({ issueKey: "MOT-234" })`
   - Type: Story, Summary: "Seller Dashboard", Epic: MOT-200
3. **Bước 2:** Tạo Structured Context Block (score: 7/10)
4. **Bước 3:** Chuyển sang create-plan, skip Phase 1, bắt đầu Phase 2
5. **Bước 4:** Plan xong → `addCommentToJiraIssue({ issueKey: "MOT-234", comment: "..." })`

## Ví dụ 2: /debug với Jira Bug Issue

**Input:**
```
/debug MOT-456
```

**Agent thực hiện:**

1. **Bước 0:** Parse → Issue key: `MOT-456`, Target: `debug`
2. **Bước 1:** `getJiraIssue({ issueKey: "MOT-456" })`
   - Type: Bug, Priority: High, Steps to Reproduce có sẵn
3. **Bước 2:** Tạo Bug Context Block (score: 8/10)
4. **Bước 3:** Chuyển sang debug workflow, skip Bước 0+1, bắt đầu Bước 2
5. **Bước 4:** Debug xong → `addCommentToJiraIssue` với root cause + suggested fix

## Ví dụ 3: Tạo bug task trên Jira

**Input:**
```
Tạo bug trên Jira project MOT: Cart hiển thị sai quantity
```

**Agent thực hiện:**

1. **Bước B.1:**
   - `getJiraProjectIssueTypesMetadata({ projectKey: "MOT" })` → Xác nhận có Bug type
   - `getJiraIssueTypeMetaWithFields({ projectKey: "MOT", issueTypeId: "..." })` → Required fields
2. **Bước B.2:** Tạo description theo Bug template, bao gồm:
   - Steps to Reproduce, Expected vs Actual, Execution Flow Analysis
   - Hỏi user bổ sung nếu thiếu thông tin
3. **Bước B.3:** `createJiraIssue({ projectKey: "MOT", issueType: "Bug", summary: "...", description: "..." })`
4. **Bước B.5:** Thông báo: `✅ Đã tạo: MOT-789`

## Ví dụ 4: Context thiếu thông tin

**Input:**
```
/create-plan MOT-789
```

**Agent thực hiện:**

1. `getJiraIssue({ issueKey: "MOT-789" })` → Description: "Làm trang setting" (quá ngắn)
2. Context score: 1/10 → **DỪNG**
3. Thông báo user:
   ```
   ⚠️ Issue MOT-789 thiếu thông tin để tạo plan:
   ❌ Thiếu: Mô tả chi tiết, Acceptance Criteria, Scope, Business Rules
   ✅ Có: Summary

   Bổ sung trên Jira hoặc mô tả trực tiếp ở đây.
   ```

---

# Constraints

## Về MCP Tools

- 🚫 **KHÔNG dùng tool name sai** — Tools là camelCase: `getJiraIssue`, `createJiraIssue`, `editJiraIssue`, `addCommentToJiraIssue`, KHÔNG phải `jira_get_issue`, `jira_create_issue`
- 🚫 **KHÔNG gọi MCP tools trước khi xác nhận** issue key hợp lệ (phải có dấu `-`)
- 🚫 **KHÔNG fetch quá 3 linked issues** — tránh request quá nhiều
- 🚫 **KHÔNG tự ý transition issue status** — LUÔN hỏi user trước
- ✅ LUÔN LUÔN dùng `getJiraProjectIssueTypesMetadata` + `getJiraIssueTypeMetaWithFields` trước khi `createJiraIssue` để biết required fields
- ✅ LUÔN LUÔN dùng `lookupJiraAccountId` để resolve assignee trước khi assign

## Về chất lượng context

- 🚫 **KHÔNG giả định** thông tin thiếu — nếu description không có, PHẢI hỏi user
- 🚫 **KHÔNG bỏ qua comments** — comments thường chứa quyết định đã chốt
- ✅ LUÔN LUÔN đánh giá context quality score trước khi tiếp tục
- ✅ LUÔN LUÔN giữ nguyên description gốc (không tóm tắt lại mất thông tin)

## Về tạo task mới

- 🚫 **KHÔNG tạo task với description rỗng** — LUÔN dùng template chuẩn
- 🚫 **KHÔNG bỏ qua "Notes for Agent" section** — phần này giúp agent xử lý task sau này
- 🚫 **KHÔNG giả định project key** — LUÔN hỏi user hoặc dùng `getVisibleJiraProjects`
- ✅ LUÔN LUÔN bao gồm: Scope In/Out, Acceptance Criteria, Manual Test Expected Results
- ✅ LUÔN LUÔN bao gồm "Notes for Agent" section cho mọi task
- ✅ Với Bug: LUÔN bao gồm Steps to Reproduce, Expected vs Actual, Execution Flow Analysis

## Về workflow integration

- 🚫 **KHÔNG sửa logic** của workflow gốc (create-plan, debug) — chỉ cung cấp input
- ✅ LUÔN LUÔN cập nhật kết quả về Jira sau khi workflow hoàn thành
- ✅ LUÔN LUÔN ghi nhận issue key để tracking xuyên suốt

## Về bảo mật

- 🚫 **KHÔNG log API tokens** hoặc credentials
- 🚫 **KHÔNG ghi thông tin nhạy cảm** vào plan files (passwords, tokens, PII)

---

# Các Skills liên quan

- `.agents/skills/create-plan/SKILL.md` — Tạo plan (workflow target chính)
- `.agents/skills/debug-investigator/SKILL.md` — Debug lỗi (workflow target cho bugs)
- `.agents/skills/implement-plan/SKILL.md` — Implement plan
- `.agents/skills/review-plan/SKILL.md` — Review plan đã tạo
- `.agents/skills/review-implement/SKILL.md` — Review code đã implement

<!-- Generated by Skill Generator v3.2 -->
