# Phase 03: Regression Tests And QA

## Objective

Khóa regression old-id -> new-id trên backend và frontend, với test surface bám đúng route/path thật đang xử lý inactive-send + resume.

## Target Files

- `hub/src/store/pendingMessages.test.ts`
- `hub/src/resume/autoResumeOrchestrator.test.ts`
- `hub/src/resume/autoResumeOrchestrator.integration.test.ts`
- `hub/src/web/routes/messages.test.ts` (new if missing)
- `hub/src/web/routes/sessions.test.ts`
- `hub/src/web/routes/guards.test.ts` (or equivalent active route surface)
- `hub/integration/auto-resume.test.ts`
- `web/src/hooks/mutations/useSendMessage.rebind.test.tsx` (new)
- `web/src/routes/sessions/session-rebind-flow.test.tsx` (new or nearest route-level test)

## Required Changes

1. Backend unit/integration test phải cover:
   - enqueue dưới old id
   - resume trả new id
   - queue survive merge
   - delivery theo canonical id.
2. Route-level test phải cover inactive-send contract ở `messages.ts`, không chỉ `sessions.test.ts`.
3. Test contract consistency giữa `/resume` và `POST /messages` cho field `sessionId` authoritative.
4. Web test phải cover full sequence `resolve -> navigate -> seed message window -> session-removed`.
5. Bổ sung manual QA checklist cho 3 flow: manual resume, send-after-archive, queued replay.

## Verify Strategy (Baseline-aware)

Preflight informational:

```bash
bun run typecheck
```

Gating commands cho regression scope:

```bash
cd hub && bun test src/store/pendingMessages.test.ts src/resume/autoResumeOrchestrator.test.ts src/resume/autoResumeOrchestrator.integration.test.ts src/web/routes/messages.test.ts src/web/routes/sessions.test.ts
cd web && bun test src/hooks/mutations/useSendMessage.rebind.test.tsx src/routes/sessions/session-rebind-flow.test.tsx
```

## Manual QA Matrix

| Scenario | Setup | Expected |
| --- | --- | --- |
| Manual resume canonicalizes | Session inactive, backend trả `newSessionId` | UI chuyển sang `/sessions/newSessionId`, chat vẫn load |
| Send after archive | Session vừa archive/inactive, user gửi message | Message đi vào canonical session, UI không đứng ở old route |
| SSE old session removed | Resume merge xóa old row | Session list bỏ old id, chat pane vẫn bám new id |
| Pending replay | Có >=1 pending message trước merge | Pending được deliver theo thứ tự trên canonical session |
