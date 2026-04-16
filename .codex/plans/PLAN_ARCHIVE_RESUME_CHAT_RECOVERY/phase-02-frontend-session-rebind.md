# Phase 02: Frontend Canonical Rebind

## Objective

Bắt web client luôn chuyển sang canonical session id authoritative từ backend, để route/query cache/SSE cache/message-window cùng trỏ về một session id đúng.

## Target Files

- `web/src/api/client.ts`
- `web/src/hooks/mutations/useSendMessage.ts`
- `web/src/router.tsx`
- `web/src/hooks/useSSE.ts`
- `web/src/lib/message-window-store.ts`

## Required Changes

1. Dùng `resolveSessionId`/`onSessionResolved` trong `useSendMessage()`; bỏ phụ thuộc timeout cứng 3 giây làm source of truth.
2. Chốt flow authoritative theo Phase 1:
   - send trên session inactive đọc `result.sessionId` từ backend
   - nếu id đổi thì rebind ngay trước khi reconcile luồng tiếp theo.
3. Thêm manual-resume owner rõ ràng trong `SessionPage` (`web/src/router.tsx`):
   - tạo `resumeAndRebindSession(sessionId)` làm entrypoint chung
   - dùng chung logic rebind cho send path và manual resume path.
4. Rebind helper phải làm đồng bộ:
   - seed `message-window-store` old -> new
   - invalidate/refetch query keys session/messages/sessions
   - `navigate(..., replace: true)` sang `/sessions/$sessionId` mới.
5. Trong `useSSE.ts`, xử lý ordering `session-removed` không làm mất context khi session mới đã known/seeded.
6. Chốt messaging UX tối thiểu:
   - trạng thái resuming
   - resume success (rebound)
   - resume failure.

## Design Notes

- `message-window-store` key theo `sessionId`, là điểm dễ mất optimistic state nhất khi route đổi id.
- `seedMessageWindowFromSession()` có sẵn, ưu tiên tái sử dụng.

## Done Criteria

- Manual resume và send-after-archive đều rebind ổn định khi backend trả canonical id mới.
- `session-removed` của old id không làm chat pane rơi vào trạng thái chết.

## Suggested Verification

```bash
cd web && bun test src/hooks/mutations/useSendMessage.rebind.test.tsx src/routes/sessions/session-rebind-flow.test.tsx
```
