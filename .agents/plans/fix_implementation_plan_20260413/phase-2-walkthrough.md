# Phase 2 Walkthrough - Store + SyncEngine + Orchestrator wiring

## Scope
- Plan: `plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md`
- Phase: 2 (`Store expose DB`, `SyncEngine enqueue + triggerResume`, `Orchestrator wiring`)

## Impact Analysis (required)
- `gitnexus_impact(target="enqueueMessage", direction="upstream")` => **CRITICAL**
- `gitnexus_impact(target="triggerResume", direction="upstream")` => **CRITICAL**
- Action: giữ patch hẹp, chỉ sửa đúng file phase 2.

## Progress
- Trước: Phase 2 - Task 1/2: wire orchestrator + store accessor DB
- Sau: Task 1/2 done
- Trước: Phase 2 - Task 2/2: fix enqueue typing path + verify callsites
- Sau: Task 2/2 done (co debt de phase 3 xu ly tiep)

## Files Changed
- `hub/src/store/index.ts`
- `hub/src/sync/syncEngine.ts`

## Implementation Notes
- `Store`:
  - them `getDatabase(): Database` de orchestrator truy cap DB an toan/read-only style
- `SyncEngine`:
  - import `EnqueueResult` type va `AutoResumeOrchestrator`
  - khoi tao `autoResumeOrchestrator` trong constructor bang:
    - `store.getDatabase()`
    - `this.messageQueue`
    - `store.pendingMessages`
    - adapters: `resumeSession`, `getSession`, `archiveSession`
  - `triggerResume` delegate qua `autoResumeOrchestrator.triggerResume(...)` thay vi goi `resumeSession` truc tiep
  - chuyen `enqueueMessage` thanh async, return `Promise<EnqueueResult>`

## AC Verification

### AC-1: Store expose du cho orchestrator
- Ket qua: **PASS**
- Bang chung: `Store.getDatabase()` da them va duoc dung trong `SyncEngine` constructor.

### AC-2: Moi call site `enqueueMessage` tu HTTP deu `await`
- Verify command:
  - `rg "enqueueMessage\\(" hub/src`
- Ket qua: **FAIL (known debt)**
- Bang chung:
  - `hub/src/web/routes/guards.ts` van goi `engine.enqueueMessage(...)` khong `await`
- Ghi chu:
  - Debt nay duoc giai quyet tai **Phase 3** khi bo auto-resume flow ra khoi guard sync va xu ly async trong `POST /messages`.

### AC-3: `resume_attempts` tang/reset qua path production
- Ket qua: **PARTIAL**
- Bang chung:
  - `triggerResume` da delegate qua orchestrator (path production da noi)
  - Chua verify behavior runtime end-to-end trong phase nay

### AC-4: Type safety sau thay doi
- Verify command:
  - `bun typecheck`
- Ket qua: **FAIL (co loi co san ngoai phase)**
- Bang chung:
  - Khong con loi `EnqueueResult` trong `syncEngine.ts` sau khi doi method async
  - Con nhieu loi o `autoResumeOrchestrator*.test.ts` va `guards.test.ts` (du kien xu ly phase 7)

## Boundary Check
- Allowed files only: **PASS**
- Do NOT Modify vi pham: **NONE**

## Status
- Phase 2: **COMPLETED WITH DEBT**
- Debt bat buoc phase tiep theo:
  1. Bo enqueue khoi guard sync, chuyen sang handler async (`messages.ts`) de dam bao `await` dung flow
  2. Hoan tat test/typecheck debt theo phase 7
