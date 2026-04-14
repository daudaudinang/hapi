# Phase 5 Walkthrough - SyncEngine.sendMessage dedupe

## Scope
- Plan: `plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md`
- Phase: 5 (`hub/src/sync/syncEngine.ts`)

## Impact Analysis (required)
- `gitnexus_context(name="sendMessage", file_path="hub/src/sync/syncEngine.ts")`:
  - caller truc tiep: `createMessagesRoutes`
- `gitnexus_impact(target="SyncEngine", direction="upstream")` => **HIGH**
- Xu ly: patch toi thieu trong nhanh inactive, khong doi contract route/API.

## Files Changed
- `hub/src/sync/syncEngine.ts`

## Implementation Notes
- Trong `SyncEngine.sendMessage` (nhanh `!session.active`):
  - thay TODO/log bang trigger that:
    - neu `queueDepth === 1` -> `this.triggerResume(sessionId, session.namespace)`
  - giu nguyen behavior enqueue + event emit

## AC Verification

### AC-1: Khong double enqueue cho request web
- Ket qua: **PASS (logic-level)**
- Bang chung:
  - `POST /messages` phase 3 da xu ly inactive bang `enqueueMessage` va return 202, khong goi `sendMessage`
  - `sendMessage` fallback queue + triggerResume cho caller khac (future-safe)

### AC-2: Kenh khac goi `sendMessage` van an toan
- Ket qua: **PASS**
- Bang chung:
  - Nhánh inactive trong engine nay trigger resume that (khong con TODO)

### AC-3: Regression test + typecheck
- Verify command:
  - `bun test hub/src/resume/autoResumeOrchestrator.test.ts hub/src/resume/autoResumeOrchestrator.integration.test.ts`
  - `bun typecheck`
- Ket qua:
  - Orchestrator tests: **PASS** (22 pass, 0 fail)
  - Typecheck: **FAIL** do debt typing test (`autoResumeOrchestrator*.test.ts`, `guards.test.ts`)

## Boundary Check
- Allowed files only: **PASS**
- Do NOT Modify vi pham: **NONE**

## Status
- Phase 5: **COMPLETED WITH DEBT**
