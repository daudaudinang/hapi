# Phase 3 Walkthrough - POST /sessions/:id/messages

## Scope
- Plan: `plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md`
- Phase: 3 (`messages.ts` + `guards.ts`)

## Impact Analysis (required)
- `gitnexus_impact(target="createMessagesRoutes", direction="upstream")` => **LOW**
- `gitnexus_impact(target="requireSession", direction="upstream")` => **CRITICAL**
- Xu ly: doi `requireSession` toi thieu de bo auto-resume branch trong guard, giu access-check behavior.

## Files Changed
- `hub/src/web/routes/messages.ts`
- `hub/src/web/routes/guards.ts`

## Implementation Notes
- Refactor luong auto-resume ra khoi guard sync:
  - `requireSession`/`requireSessionFromParam` chi con xu ly access + `requireActive`
- Trong `POST /sessions/:id/messages`:
  - Dung `requireSessionFromParam(c, engine)` (khong truyen `autoResume`/`messagePayload`)
  - Neu session inactive va feature `autoResume` bat:
    - `await engine.enqueueMessage(...)`
    - map ket qua:
      - `archived` -> HTTP 503 `{ error, archived: true, reason }`
      - `rejected` -> HTTP 409 neu duplicate `localId`, nguoc lai 400
      - `queued` -> trigger resume background + HTTP 202 `{ queued, resuming, sessionId, message }`
  - Neu khong vao luong tren: `await engine.sendMessage(...)` nhu cu

## AC Verification

### AC-1: Khong serialize `Promise` trong JSON
- Ket qua: **PASS**
- Bang chung:
  - `engine.enqueueMessage` duoc `await` trong `messages.ts`
  - `rg "enqueueMessage\\(" hub/src`:
    - `messages.ts`: `const enqueueResult = await engine.enqueueMessage(...)`
    - `syncEngine.ts`: method definition async

### AC-2: 202/503 contract dong bo voi web client
- Ket qua: **PASS**
- Bang chung:
  - `web/src/api/client.ts` da support:
    - 202 body `{ queued, resuming, sessionId, message }`
    - 503 body `{ error, archived, reason }`
  - Route tra ve dung shape tren.

### AC-3: Typecheck
- Verify command:
  - `bun typecheck`
- Ket qua: **FAIL (known debt o phase sau)**
- Ghi chu:
  - Loi chinh con o `autoResumeOrchestrator*.test.ts` va `guards.test.ts`
  - Khong co loi moi ve `messages.ts`/`guards.ts` contract auto-resume

## Boundary Check
- Allowed files only: **PASS**
- Do NOT Modify vi pham: **NONE**

## Status
- Phase 3: **COMPLETED WITH DEBT**
