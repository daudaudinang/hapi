# PLAN_ARCHIVE_RESUME_CHAT_RECOVERY

- Workflow: `WF_20260416_D3242758`
- Plan profile: `standard`
- Planning scope: archive/resume/manual resume/chat-after-archive regression only

## Goal

Khôi phục đầy đủ chat flow sau archive/resume bằng cách:
1. giữ pending message qua bước canonicalize session id
2. thống nhất một contract canonical session id cho cả `/sessions/:id/resume` và `POST /sessions/:id/messages`
3. buộc web client rebind theo session id canonical đó.

## Problem Summary

1. Backend hiện queue pending message theo session id cũ, nhưng `resumeSession()` có thể merge sang session id mới rồi xóa session cũ trong `SessionCache.mergeSessions()`. Với FK `pending_messages.session_id -> sessions.id ON DELETE CASCADE`, pending message có thể bị xóa hoặc bị stranded.
2. Frontend vẫn bám route/session cache cũ khi resume trả về canonical id mới. `useSendMessage()` không dùng `resolveSessionId`, `onSessionResolved`, và fallback `202` chỉ chờ timeout 3 giây rồi refresh route cũ.
3. Test hiện tại chủ yếu giả định `oldSessionId === resumedSessionId`, nên không bắt được regression canonicalize.
4. Verify baseline của repo đang đỏ (`bun run typecheck` fail); gate trước đây dùng command/file test chưa khả thi.

## Canonical Contract (Chốt 1 flow)

Flow authoritative của iteration này là `queue-then-rebind`, không dùng nhánh `resume-then-send` tách biệt:
1. User gửi message trên session inactive.
2. Backend enqueue message + trigger resume nếu cần.
3. Mọi response từ `POST /sessions/:id/messages` và `/sessions/:id/resume` phải trả `sessionId` mang nghĩa authoritative canonical session id tại thời điểm response.
4. Frontend luôn lấy `result.sessionId` làm source of truth để rebind route/cache/message-window.
5. Nếu id không đổi: tiếp tục trên route cũ. Nếu id đổi: rebind ngay sang id mới, không dựa timeout cứng.

## Acceptance Criteria

1. Pending message queue không bị mất khi inactive session được resume sang canonical session id mới; queue được đọc/deliver theo canonical id sau merge.
2. Manual resume API (`/sessions/:id/resume`) và send-from-inactive API (`POST /sessions/:id/messages`) trả cùng semantics cho `sessionId` authoritative canonical id.
3. Frontend owner (`web/src/router.tsx` + `web/src/hooks/mutations/useSendMessage.ts`) dùng chung helper rebind theo `sessionId` authoritative và áp dụng cho cả send path lẫn manual-resume entrypoint của SessionPage.
4. Nếu UI manual-resume button chưa tồn tại, iteration này vẫn phải có một entrypoint callable trong SessionPage (ví dụ `resumeAndRebindSession`) để owner rõ ràng và test được.
5. Sau khi archive một session rồi gửi message mới từ web, user message vẫn vào đúng session canonical và chat tiếp tục hoạt động.
6. SSE/session cache/message window không để user kẹt ở route cũ sau khi session cũ bị `session-removed`.
7. Hub tests bao phủ ít nhất 1 case `old id -> new canonical id` cho queue survival + queued delivery + route response semantics.
8. Web tests bao phủ ít nhất 1 case full rebind sequence `resolve -> navigate -> seed message window -> session-removed`.
9. Kiểm chứng thủ công xác nhận 3 flow: manual resume, send sau archive, và queued-message replay sau canonical merge.

## Execution Boundary

In scope:

- `hub/src/store/pendingMessages.ts`
- `hub/src/store/pendingMessages.test.ts`
- `hub/src/sync/sessionCache.ts`
- `hub/src/sync/syncEngine.ts`
- `hub/src/web/routes/messages.ts`
- `hub/src/web/routes/messages.test.ts` (new if missing)
- `hub/src/web/routes/sessions.ts`
- `hub/src/web/routes/sessions.test.ts`
- `hub/src/web/routes/guards.test.ts` (or equivalent active route test surface for inactive-send path)
- `hub/src/resume/autoResumeOrchestrator.ts`
- `hub/src/resume/autoResumeOrchestrator.test.ts`
- `hub/src/resume/autoResumeOrchestrator.integration.test.ts`
- `hub/integration/auto-resume.test.ts`
- `web/src/api/client.ts`
- `web/src/hooks/mutations/useSendMessage.ts`
- `web/src/router.tsx`
- `web/src/hooks/useSSE.ts`
- `web/src/lib/message-window-store.ts`
- `web/src/hooks/mutations/useSendMessage.rebind.test.tsx` (new)
- `web/src/routes/sessions/session-rebind-flow.test.tsx` (new or nearest existing route-level test file)

Out of scope:

- CLI/runner protocol changes
- Model selection, machine discovery, unrelated Codex model work đang có trong dirty tree
- Generic archive UX cleanup không liên quan canonical session id
- Refactor lớn cho toàn bộ session lifecycle ngoài regression này

## Why Standard Plan

Top-level phases không disjoint an toàn. Backend queue canonicalization, frontend route rebinding, và regression tests cùng phụ thuộc một contract chung là `canonical session id` sau resume. Nếu tách top-level parallel-ready sẽ dễ tạo mismatch giữa HTTP/SSE/test assertions.

## Implementation Order

1. Phase 1: sửa backend source-of-truth cho pending queue khi merge session, chuẩn hóa contract `sessionId` authoritative cho both routes, và chốt atomic merge boundary.
2. Phase 2: sửa frontend rebind flow theo contract ở Phase 1, gồm owner cho manual-resume entrypoint trong SessionPage + send path.
3. Phase 3: bổ sung regression tests + manual QA coverage, ưu tiên test surface thật của `messages.ts` và route/SSE/message-window sequence.

## Major Risks

- Xóa session cũ quá sớm vẫn có thể cascade-delete queue nếu migration/reassign không nằm đúng điểm merge.
- Frontend có nhiều cache layer (`queryClient`, SSE cache, `message-window-store`); nếu rebind thiếu một lớp sẽ còn hiện tượng UI đứng ở route cũ hoặc mất optimistic message.
- Auto-resume và manual resume có thể diverge nếu response semantics của hai routes không đồng nhất.
- Test flakiness nếu assertions vẫn dựa `oldSessionId === resumedSessionId` hoặc chỉ test hook-level mà không test route/SSE sequence.
- Repo baseline đang đỏ; verify phải tách rõ preflight informational và gating commands cho scope regression.

## Verify Commands

Preflight (informational, không dùng làm pass/fail gate của task này):

```bash
bun run typecheck
```

Gating commands cho scope regression (sau khi implement thêm test files theo plan):

```bash
cd hub && bun test src/store/pendingMessages.test.ts src/resume/autoResumeOrchestrator.test.ts src/resume/autoResumeOrchestrator.integration.test.ts src/web/routes/messages.test.ts src/web/routes/sessions.test.ts
cd web && bun test src/hooks/mutations/useSendMessage.rebind.test.tsx src/routes/sessions/session-rebind-flow.test.tsx
```

Manual QA after targeted tests pass:

1. `bun run dev`
2. Archive một session đang inactive, gửi message mới từ trang chat, xác nhận UI chuyển sang canonical session id đúng và message được gửi.
3. Gọi manual resume cho session inactive có canonical id mới, xác nhận route/chat/messages tiếp tục trên session mới.
4. Khi SSE phát `session-removed` cho id cũ trong lúc rebind diễn ra, UI không rơi vào màn hình session chết và message-window không mất context.

## Planned Artifacts

- `phase-01-backend-canonical-queue.md`
- `phase-02-frontend-session-rebind.md`
- `phase-03-regression-tests-and-qa.md`
- `manifests/ownership.json`
- `manifests/dependency-graph.json`
- `manifests/benchmark.json`
