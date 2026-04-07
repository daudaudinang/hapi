# Field Mapping: Jira → Workflow Inputs

Bảng ánh xạ giữa Jira fields và input cần thiết cho từng workflow.

---

## MCP Tool Reference (atlassian-mcp-server)

| Tool Name | Mục đích | Khi nào dùng |
|---|---|---|
| `getJiraIssue` | Lấy chi tiết issue | Đọc task từ Jira |
| `searchJiraIssuesUsingJql` | Tìm kiếm bằng JQL | Tìm tasks liên quan |
| `createJiraIssue` | Tạo issue mới | Tạo task/bug/story mới |
| `editJiraIssue` | Chỉnh sửa issue | Cập nhật fields |
| `transitionJiraIssue` | Chuyển trạng thái | Move to In Progress/Done |
| `getTransitionsForJiraIssue` | Lấy transitions có sẵn | Trước khi transition |
| `addCommentToJiraIssue` | Thêm comment | Ghi kết quả workflow |
| `addWorklogToJiraIssue` | Ghi worklog | Log thời gian làm việc |
| `getVisibleJiraProjects` | Danh sách projects | Khi tạo issue mới |
| `getJiraProjectIssueTypesMetadata` | Issue types của project | Biết types có sẵn |
| `getJiraIssueTypeMetaWithFields` | Fields theo issue type | Biết required fields |
| `lookupJiraAccountId` | Tìm account ID | Resolve assignee |
| `getJiraIssueRemoteIssueLinks` | Remote links | Lấy external links |
| `atlassianUserInfo` | Thông tin user | Context |
| `getAccessibleAtlassianResources` | Resources có quyền | Khám phá |
| `jiraRead` | Đọc dữ liệu generic | Fallback read |
| `jiraWrite` | Ghi dữ liệu generic | Fallback write |
| `search` | Tìm kiếm chung | Search |
| `fetch` | Fetch URL | Lấy data từ URL |

⚠️ **Tool names là camelCase** — KHÔNG phải snake_case. VD: `getJiraIssue`, KHÔNG PHẢI `jira_get_issue`.

---

## Mapping cho `create-plan` workflow

| Jira Field | Workflow Input | Phase | Ghi chú |
|---|---|---|---|
| `summary` | Feature name (UPPERCASE_UNDERSCORE) | Phase 1 | Chuẩn hóa: "Seller Dashboard" → `SELLER_DASHBOARD` |
| `issuetype.name` | Loại yêu cầu | Phase 1 | Story → Feature mới, Task → Cải tiến, Bug → Bug fix |
| `description` | Yêu cầu chi tiết | Phase 1 | Giữ nguyên, không tóm tắt |
| `description` → `## Scope` | Scope (goals/non-goals) | Phase 1 | Parse In Scope / Out of Scope |
| `description` → `## Business Rules` | Yêu cầu nghiệp vụ | Phase 1 | Các con số, quy tắc cụ thể |
| `description` → `## Acceptance Criteria` | Test plan input | Phase 4 | Chuyển thành test cases |
| `description` → `## Technical Context` | Entry points cho codebase | Phase 2 | File paths, APIs để bắt đầu khám phá |
| `description` → `## Notes for Agent` | Hints cho agent | Phase 2 | Patterns, conventions |
| `priority.name` | Priority / deadline | Phase 1 | Ảnh hưởng scope plan |
| `labels` | Technical tags | Phase 2 | Gợi ý modules liên quan |
| `components` | Module scope | Phase 2 | Giới hạn phạm vi khám phá |
| `parent` / `epicKey` | Epic context | Phase 1 | Hiểu mục tiêu tổng thể |
| `issuelinks` | Dependencies | Phase 1 | Blockers, related tasks |
| `comments` | Quyết định đã chốt | Phase 1+3 | Thay cho Phase 3 nếu đã thảo luận |
| `attachments` | Design references | Phase 1 | Mockups, wireframes |
| `description` → `## Manual Test` | Manual test plan | Phase 4 | Expected results để verify |

---

## Mapping cho `debug` workflow

| Jira Field | Workflow Input | Bước | Ghi chú |
|---|---|---|---|
| `summary` | Tóm tắt lỗi | Bước 1.1 | Triệu chứng chính |
| `description` → `## Steps to Reproduce` | Reproduce steps | Bước 1.1 | 3-5 bước rõ ràng |
| `description` → `## Expected vs Actual` | So sánh kết quả | Bước 1.1 | Cặp expected/actual |
| `description` → `## Bug Details` → Frequency | Tần suất | Bước 1.1 | Luôn/Thỉnh thoảng/Hiếm |
| `description` → `## Bug Details` → Severity | Mức độ | Bước 1.1 | Critical/High/Medium/Low |
| `description` → `## Bug Details` → Environment | Môi trường | Bước 1.1 | Browser, OS, Device |
| `description` → `## Error Context` | Error log/stack trace | Bước 1.1 | Trace trực tiếp |
| `description` → `## Execution Flow Analysis` | Luồng thực thi | Bước 2.2 | Flow gây lỗi |
| `description` → `## Technical Scope` | Files nghi ngờ | Bước 3.1 | Start point cho investigation |
| `description` → `## Root Cause Analysis` | Phân tích sơ bộ | Bước 4 | Nếu đã debug sơ bộ |
| `priority.name` | Mức độ nghiêm trọng | Bước 1.1 | Mapping: Critical→Critical, High→High... |
| `labels` | Gợi ý module | Bước 3 | Giới hạn scope điều tra |
| `components` | Module bị ảnh hưởng | Bước 3 | Xác định phạm vi |
| `comments` | Context thảo luận QA/Dev | Bước 1.2 | Hints, observations thêm |
| `attachments` | Screenshots/videos lỗi | Bước 1.1 | Visual evidence |
| `issuelinks` | Related bugs | Bước 1 | Cùng root cause? |

---

## Mapping cho `implement-plan` workflow

| Jira Field | Workflow Input | Phase | Ghi chú |
|---|---|---|---|
| `summary` | Tên plan file | Phase 0 | Lookup: `.agent/plans/PLAN_<normalized>.md` |
| `status.name` | Kiểm tra trạng thái | Phase 0 | Chỉ implement khi status phù hợp |
| `subtasks` | Sub-tasks tracking | Phase N | Map sub-tasks → phases nếu có |
| `fixVersions` | Target version | Phase 0 | Context cho release |

---

## Mapping cho TẠO TASK MỚI (createJiraIssue)

### Flow lấy metadata trước khi tạo

```
1. getVisibleJiraProjects → Chọn project
2. getJiraProjectIssueTypesMetadata(projectKey) → Chọn issue type
3. getJiraIssueTypeMetaWithFields(projectKey, issueTypeId) → Biết required fields
4. lookupJiraAccountId(query) → Resolve assignee (nếu cần)
5. createJiraIssue(projectKey, issueType, summary, description, ...)
```

### Template mapping theo Issue Type

| Issue Type | Template | Required Fields | Optional Fields |
|---|---|---|---|
| Story | Feature template | summary, description | priority, labels, components, assignee |
| Task | Feature template | summary, description | priority, labels, components, assignee |
| Bug | Bug template | summary, description | priority, labels, components, assignee |
| Epic | Epic template | summary, description | priority, labels |
| Sub-task | Feature template (ngắn) | summary, description, parent | priority, assignee |

---

## Quy tắc chuẩn hóa Feature Name từ Summary

```
Input → Output:
"Seller Dashboard — Hiển thị thống kê"  → SELLER_DASHBOARD
"[FE] Cart quantity bug fix"             → CART_QUANTITY_BUG_FIX
"API: Add product variants endpoint"     → API_ADD_PRODUCT_VARIANTS_ENDPOINT
```

**Quy tắc:**
1. Loại bỏ prefix tags: `[FE]`, `[BE]`, `[API]`, `[UI]`
2. Loại bỏ ký tự đặc biệt: `—`, `:`, `/`, `()`, `[]`
3. Loại bỏ phần mô tả phụ sau `—` hoặc `-`
4. Chuyển thành UPPERCASE + underscore
5. Giới hạn 50 ký tự
6. **Nếu quá dài**: Lấy 3-4 keyword chính

---

## Quy tắc parse Acceptance Criteria

Acceptance Criteria trên Jira có thể ở nhiều format. Agent cần parse linh hoạt:

### Format 1: Checkbox (đã chuẩn)
```
- [ ] Cart hiển thị đúng quantity
- [ ] API trả 422 nếu stock không đủ
```

### Format 2: Given-When-Then
```
Given: User đã đăng nhập
When: User click "Add to Cart"
Then: Cart badge tăng 1
```
→ Chuyển thành: `- [ ] Khi user đã đăng nhập click "Add to Cart", cart badge tăng 1`

### Format 3: Bullet points (không checkbox)
```
• Hỗ trợ filter theo price range
• Kết quả hiển thị real-time khi gõ
```
→ Chuyển thành: `- [ ] Hỗ trợ filter theo price range` + `- [ ] Kết quả hiển thị real-time khi gõ`

### Format 4: Numbered list
```
1. Trang load trong < 3 giây
2. Responsive trên mobile
```
→ Chuyển thành: `- [ ] Trang load trong < 3 giây` + `- [ ] Responsive trên mobile`
