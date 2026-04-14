# Phase 6 Walkthrough - Migration init fail-fast

## Scope
- Plan: `plans/20260411-0940-auto-resume-inactive-sessions/FIX_IMPLEMENTATION_PLAN_20260413.md`
- Phase: 6 (`hub/src/store/index.ts`)

## Impact Analysis (required)
- `gitnexus_impact(target="runNewMigrations", direction="upstream")` => **LOW**

## Files Changed
- `hub/src/store/index.ts`

## Implementation Notes
- `runNewMigrations()`:
  - bo `throw` vo hieu ben trong `.catch()` cua `runner.runMigrations(...)`
  - doi sang fail-fast co kiem soat:
    - log loi migration
    - `process.exit(1)` de tranh app tiep tuc chay khi migration that bai
  - dung `void runner.runMigrations(...)` de the hien ro async fire-and-forget behavior hien tai

## AC Verification

### AC-1: Bo throw vo hieu trong async catch
- Ket qua: **PASS**
- Bang chung:
  - trong `.catch`, khong con `throw error`; da thay bang `process.exit(1)`

### AC-2: Typecheck
- Verify command:
  - `bun typecheck`
- Ket qua: **FAIL (known debt phase 7)**
- Bang chung:
  - loi con lai o test typing (`autoResumeOrchestrator*.test.ts`, `guards.test.ts`)
  - khong phat sinh loi moi lien quan `hub/src/store/index.ts`

## Boundary Check
- Allowed files only: **PASS**
- Do NOT Modify vi pham: **NONE**

## Status
- Phase 6: **COMPLETED WITH DEBT**
