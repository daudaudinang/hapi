# Session Task List Design

**Ngày:** 2026-07-22  
**Trạng thái:** Đã duyệt thiết kế  
**Phạm vi:** Snapshot checklist mới nhất của một coding session

## 1. Mục tiêu

HAPI hiển thị checklist thực thi hiện tại của một session theo cùng một cách cho Claude Code, Codex, OpenCode và các agent ACP tương lai.

Người dùng nhìn thấy `Tasks 2/5` trong session header. Nhấn vào nút mở một modal riêng để xem toàn bộ task và trạng thái `pending`, `in_progress`, `completed`.

HAPI tiếp tục dùng `session.todos` làm nguồn dữ liệu chuẩn. Không tạo mô hình task, bảng database hoặc lịch sử snapshot mới.

## 2. Không thuộc phạm vi

- Không phát hiện checklist lỗi thời hoặc suy luận tiến độ từ thời gian/nội dung chat.
- Không tự động nhắc agent và không thêm system prompt về việc cập nhật checklist.
- Không clear checklist thủ công.
- Không cho người dùng sửa trạng thái task.
- Không lưu lịch sử checklist riêng; lịch sử raw message vẫn giữ nguyên.
- Không trộn session checklist với `TeamState` hoặc sửa task orchestration của Team.
- Không thay đổi semantics của plan proposal như Claude `ExitPlanMode` hoặc Codex plan-mode document.

## 3. Hiện trạng

HAPI đã có:

- `TodoItemSchema`, `TodosSchema` và `Session.todos` trong shared protocol.
- Cột SQLite `sessions.todos` và `todos_updated_at`.
- Hub extractor cho Claude `TodoWrite` cũ và ACP `plan`.
- Session summary tính `completed/total` từ `session.todos`.
- Codex đã chuyển `turn/plan/updated` thành message `plan_update`, nhưng Hub chưa ghi message đó vào `session.todos`.

Khoảng trống:

- Claude Code hiện tại dùng `TaskCreate`, `TaskUpdate`, `TaskGet`, `TaskList`; HAPI chưa project các tool này vào `session.todos`.
- Parser `TaskCreate/TaskUpdate` trong `TeamState` chờ shape khác và không phải session checklist projector.
- ACP handler bỏ qua plan rỗng, nên provider chưa thể clear snapshot bằng `[]`.
- Session header chưa có control xem checklist chi tiết.

Tài liệu provider tham chiếu:

- [Claude Code todo tracking](https://code.claude.com/docs/en/agent-sdk/todo-tracking)
- [Claude Agent SDK tool schemas](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Codex app-server plan events](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [ACP v1 Agent Plan](https://agentclientprotocol.com/protocol/v1/agent-plan)
- [OpenCode tools](https://opencode.ai/docs/tools/)

## 4. Kiến trúc

```text
Provider message
    → provider adapter
    → SessionTodoUpdate
    → session todo reducer
    → TodosSchema validation
    → sessions.todos replacement
    → session-updated event
    → SessionTaskListControl
```

### 4.1 Ranh giới trách nhiệm

**Provider adapter** chỉ hiểu wire format riêng của provider và trả về update chuẩn.

**Session todo reducer** không biết provider. Reducer nhận snapshot hiện tại và một hoặc nhiều update rồi trả về `TodoItem[]` hoàn chỉnh.

**Persistence** chỉ lưu snapshot hoàn chỉnh đã validate. Web không dựng checklist từ message history hoặc tool card.

**Web control** chỉ đọc `session.todos`, tính tiến độ và render modal.

### 4.2 Update chuẩn nội bộ

```ts
type SessionTodoUpdate =
    | { type: 'replace'; todos: TodoItem[] }
    | { type: 'upsert'; todo: TodoItem }
    | { type: 'delete'; id: string }
```

Reducer áp dụng các update trong thứ tự xuất hiện của message:

- `replace`: thay toàn bộ snapshot, giữ thứ tự provider gửi.
- `upsert`: cập nhật item cùng ID tại vị trí cũ; item mới được nối cuối.
- `delete`: loại item cùng ID; ID không tồn tại là no-op.

Mỗi message chỉ ghi database một lần sau khi toàn bộ update trong message đã được áp dụng.

## 5. Mapping provider

| Nguồn | Update chuẩn | Quy tắc |
|---|---|---|
| Claude `TodoWrite` | `replace` | Dùng parser hiện có |
| Claude `TaskCreate` | `upsert` | Ghép tool call với kết quả thành công; dùng ID native từ result |
| Claude `TaskUpdate` | `upsert` hoặc `delete` | Chỉ áp dụng sau tool result không lỗi |
| Claude `TaskList` | `replace` | Parse snapshot từ tool result; `[]` hợp lệ |
| Codex `plan_update` | `replace` | `step → content`, status chuẩn hóa, priority `medium` |
| ACP `plan` | `replace` | Giữ content, priority, status; `[]` hợp lệ |

### 5.1 Claude Task tools

Claude `TaskCreate` input không có task ID. ID xuất hiện trong matching `tool_result` dưới task object. Hub dùng `tool_use_id` để tìm tool call tương ứng trong recent persisted messages. Không ghép được an toàn thì bỏ qua update.

`TaskUpdate` dùng `taskId`; `status: deleted` chuyển thành `delete`. Các status khác chuyển thành `upsert`. Nếu update không mang subject nhưng task ID đã tồn tại, reducer giữ content hiện tại. Nếu ID chưa tồn tại và không có subject hợp lệ, reducer bỏ qua để tránh tạo task rỗng.

`TaskList` result là nguồn snapshot mạnh nhất. Snapshot hợp lệ thay toàn bộ state đã tích lũy từ delta.

Mọi item Claude mặc định priority `medium`. `subject` map sang `content`; `activeForm` được giữ nếu có.

### 5.2 Codex và ACP

Codex `turn/plan/updated` và ACP `session/update: plan` đều là full snapshot. ACP v1 yêu cầu client thay toàn bộ plan trên mỗi update.

Codex và ACP v1 không đảm bảo task ID. HAPI tạo ID deterministic theo vị trí trong snapshot. Không dùng ID này để merge giữa các snapshot vì `replace` luôn là authoritative.

ACP handler phải forward cả `entries: []`; không được coi empty plan là malformed.

## 6. Persistence và thứ tự cập nhật

- `session.todos` luôn chứa snapshot mới nhất đã validate.
- Snapshot rỗng được lưu là `[]`, không phải dữ liệu lỗi.
- `todos_updated_at` tiếp tục ngăn update cũ ghi đè update mới.
- Khi nhiều message được tạo cùng millisecond, Hub tạo timestamp ghi todo tăng đơn điệu so với `todos_updated_at` hiện tại để không làm mất update hợp lệ.
- Session reload đọc trực tiếp snapshot đã lưu.
- Backfill hiện có tiếp tục hỗ trợ các full snapshot trong message history. Không cam kết dựng hoàn hảo Claude Task delta của session đã tồn tại trước khi tính năng được triển khai.

Malformed payload, failed tool result hoặc unknown task update không thay đổi snapshot hiện tại. Hub ghi log kỹ thuật; Web không hiện cảnh báo vì không có hành động an toàn cho người dùng.

## 7. Giao diện

Tạo component riêng `SessionTaskListControl` và gắn vào cả session header thường lẫn compact header.

### 7.1 Header

- Không có task hoặc snapshot rỗng: không render control.
- Header thường: icon checklist và `Tasks {completed}/{total}`.
- Compact/mobile: icon checklist và `{completed}/{total}`.
- Snapshot toàn completed vẫn hiển thị, ví dụ `Tasks 5/5`, nếu provider còn giữ snapshot.

### 7.2 Modal

Nhấn control mở modal riêng bằng Dialog pattern hiện có của HAPI.

Modal gồm:

- Tiêu đề `Session tasks`.
- Dòng `{completed} of {total} completed`.
- Thanh tiến độ.
- Danh sách theo thứ tự snapshot.
- Biểu tượng/trạng thái riêng cho pending, in progress và completed.

Modal chỉ đọc. Không có refresh, edit, clear hoặc provider badge.

## 8. Kiểm chứng

### 8.1 Unit tests

- Claude `TodoWrite` full và empty snapshot.
- Claude TaskCreate success/failure và result không ghép được.
- Claude TaskUpdate đổi status, đổi subject, delete và unknown ID.
- Claude TaskList full/empty/malformed result.
- Codex plan status mapping và full replacement.
- ACP full/empty plan replacement.
- Reducer ordering, upsert stability, delete no-op và schema rejection.

### 8.2 Hub integration tests

- Message được lưu trước khi todo projection chạy.
- Update hợp lệ ghi `session.todos` và phát `session-updated`.
- Update lỗi không sửa snapshot và không phát todo update.
- Hai update cùng millisecond vẫn được áp dụng đúng thứ tự.
- Update cũ không ghi đè snapshot mới.

### 8.3 Web component tests

- Snapshot undefined/empty không render control.
- Snapshot dở dang render `Tasks 2/5` và mở đúng modal.
- Snapshot completed render `Tasks 5/5`.
- Modal render đúng thứ tự và trạng thái.
- Compact control render `2/5`.

### 8.4 Commands

Từ repo root:

```bash
bun typecheck
bun run test
```

## 9. Rủi ro còn lại

| Rủi ro | Giảm thiểu |
|---|---|
| Claude tool output thay đổi shape | Parse bảo thủ, validate schema, bỏ qua thay vì ghi sai |
| Tool call/result không ghép được | Dùng `tool_use_id` và recent persisted messages; giữ snapshot cũ nếu không chắc |
| Provider không gửi task event | Không suy đoán; control phản ánh đúng dữ liệu HAPI thực nhận |
| Snapshot provider thay đổi thứ tự | `replace` toàn bộ; không merge bằng synthetic ID |
| Task list dài trên mobile | Modal có vùng cuộn và compact trigger |

## 10. Tiêu chí hoàn thành

1. Claude Code 2.1.217 Task tools cập nhật `session.todos` đúng theo create/update/delete/list.
2. Codex `plan_update`, OpenCode ACP plan và ACP plan tương lai cập nhật cùng snapshot schema.
3. Header hiển thị tiến độ `completed/total`; nhấn mở modal chi tiết.
4. Reload session giữ nguyên checklist mới nhất.
5. Payload lỗi không làm mất hoặc làm hỏng snapshot đang lưu.
6. Typecheck và test suite liên quan pass.
