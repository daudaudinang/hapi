# Phase 01: Backend Canonical Queue And Contract

## Objective

Đảm bảo pending message luôn đi theo canonical session id sau resume/merge, không bị orphan/cascade-delete, và chốt contract `sessionId` authoritative thống nhất cho cả `/sessions/:id/resume` lẫn `POST /sessions/:id/messages`.

## Target Files

- `hub/src/store/pendingMessages.ts`
- `hub/src/store/pendingMessages.test.ts`
- `hub/src/sync/sessionCache.ts`
- `hub/src/sync/syncEngine.ts`
- `hub/src/web/routes/messages.ts`
- `hub/src/web/routes/messages.test.ts` (new if missing)
- `hub/src/web/routes/sessions.ts`
- `hub/src/web/routes/sessions.test.ts`
- `hub/src/resume/autoResumeOrchestrator.ts`

## Required Changes

1. Thêm store-level primitive để chuyển ownership của pending queue từ `oldSessionId` sang `newSessionId`.
   Gợi ý: `reassignSession(oldSessionId, newSessionId)` hoặc `movePendingMessages(...)` trong `PendingMessagesStore`.
2. Gắn primitive vào đúng merge boundary trong `SessionCache.mergeSessions()` trước khi xóa old session.
3. Chốt atomic merge boundary: các thao tác cập nhật `messages`, `pending_messages`, `metadata/todos/teamState`, và `delete old session` phải cùng một transaction/atomic unit.
4. Chuẩn hóa response contract:
   - `/sessions/:id/resume` trả `sessionId` authoritative canonical id.
   - `POST /sessions/:id/messages` (inactive path) cũng trả `sessionId` authoritative canonical id.
5. Nếu giữ `202` ở inactive-send path, payload vẫn phải có `sessionId` authoritative để frontend rebind ngay.
6. Không mở rộng scope sang thay đổi queue/retry policy tổng quát ngoài regression này.

## Design Notes

- Fix ở source-of-truth dữ liệu thay vì workaround ở orchestrator để manual resume và auto-resume cùng hưởng lợi.
- Contract phải explicit, không để frontend tự suy luận canonical id từ route cũ.

## Done Criteria

- Case `oldSessionId -> newSessionId` vẫn còn pending rows sau merge.
- Pending rows được deliver/mark processed bằng canonical session id mới.
- Cả `/resume` và `POST /messages` thống nhất semantics `sessionId` authoritative.

## Suggested Verification

```bash
cd hub && bun test src/store/pendingMessages.test.ts src/resume/autoResumeOrchestrator.test.ts src/resume/autoResumeOrchestrator.integration.test.ts src/web/routes/messages.test.ts src/web/routes/sessions.test.ts
```
