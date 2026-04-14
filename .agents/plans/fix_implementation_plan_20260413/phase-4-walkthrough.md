# Phase 4 Walkthrough - Drain queue deliver message

## Scope
- Plan: `plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md`
- Phase: 4 (`autoResumeOrchestrator.ts`, `syncEngine.ts`)

## Impact Analysis (required)
- `gitnexus_impact(target="processQueuedMessages", direction="upstream")` => **LOW**

## Files Changed
- `hub/src/resume/autoResumeOrchestrator.ts`
- `hub/src/sync/syncEngine.ts`

## Implementation Notes
- `AutoResumeOrchestrator`:
  - them callback delivery trong constructor:
    - `deliverMessageFn(sessionId, payload)`
    - co default no-op de khong pha constructor call sites test
  - `triggerResume`:
    - dung `canonicalSessionId = resumeResult.sessionId ?? sessionId`
    - `waitForSessionActive(canonicalSessionId)`
    - `processQueuedMessages(canonicalSessionId)`
    - return `sessionId` canonical
  - `processQueuedMessages`:
    - lay pending messages, sort theo `createdAt` tang dan
    - parse payload -> `await deliverMessageFn(...)`
    - success: `markAsProcessed`
    - loi parse/delivery: `markAsFailed`
- `SyncEngine`:
  - inject callback delivery khi khoi tao orchestrator:
    - `(sessionId, payload) => this.messageService.sendMessage(sessionId, payload)`

## AC Verification

### AC-1: Sau resume + drain, tin pending duoc gui vao chat
- Verify command:
  - `bun test hub/src/resume/autoResumeOrchestrator.test.ts hub/src/resume/autoResumeOrchestrator.integration.test.ts`
- Ket qua: **PASS**
- Bang chung:
  - 22 tests pass, 0 fail
  - co case integration: `should complete full resume flow and process messages`
  - co case message ordering: `should process messages in order after resume`

### AC-2: Khong mat pending khi loi mot tin
- Verify command:
  - cung command test ben tren
- Ket qua: **PASS (unit-level)**
- Bang chung:
  - case malformed payload => `markAsFailed` duoc assert

### AC-3: Typecheck toan repo
- Verify command:
  - `bun typecheck`
- Ket qua: **FAIL (known debt o phase 7)**
- Ghi chu:
  - loi con lai chu yeu o `autoResumeOrchestrator*.test.ts` (narrowing union) va `guards.test.ts`
  - khong co loi runtime trong luong test Phase 4

## Boundary Check
- Allowed files only: **PASS**
- Do NOT Modify vi pham: **NONE**

## Status
- Phase 4: **COMPLETED WITH DEBT**
