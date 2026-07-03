# Story 4.4 Backward Compatibility Boundary and Regression Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce final release-readiness evidence for session-scoped terminal lifecycle: compatibility boundary, regression commands, full check results, manual E2E checklist, and rollback/deploy notes.

**Architecture:** No new feature behavior. This is a gate story: validate shared/CLI/hub/web slices together, document what passed, document what was not run, and lock migration/backward-compatibility boundaries. Hub/CLI/web protocol must ship same build; machine/project terminals keep legacy behavior.

**Tech Stack:** Markdown planning artifact, Bun/Vitest test suites, TypeScript typecheck.

---

## File Structure

- Modify `_bmad-output/planning-artifacts/session-terminal-lifecycle-dev-readiness.md`: update from draft planning checklist to implementation readiness evidence with compatibility notes, focused test matrix, full test/typecheck results, manual E2E checklist status, rollback/deploy notes, and story status summary.
- Optional modify `docs/superpowers/plans/2026-07-03-story-4-4-regression-readiness-sweep.md`: record final command evidence if useful.
- No production code changes unless verification exposes a Red/Yellow regression.

---

### Task 1: Capture compatibility and migration boundary

**Files:**
- Modify: `_bmad-output/planning-artifacts/session-terminal-lifecycle-dev-readiness.md`

- [ ] Add section `## Implementation status - 15/15 stories` with each story marked implemented/verified or with exact caveat.
- [ ] Add section `## Compatibility boundary`:
  - Protocol uses strict typed scope and strict legacy payload schemas.
  - Valid legacy `{ sessionId }`/`{ machineId }` terminal events remain accepted where tests cover them.
  - Mixed typed/legacy and extra raw fields are rejected.
  - Machine/project terminals remain legacy behavior for this wave.
  - Hub/CLI/web must deploy as one build because socket contract changed.
- [ ] Add section `## Safety decisions preserved` listing detach no kill, close-one explicit, close-all internal archive only, max 3, idle warning/kill, hard kill, CLI source of truth, hub routing only, shared `SessionTerminalTabs`, no raw logs/state.

---

### Task 2: Run focused regression matrix

Run from repo root unless command changes directory:

```bash
cd shared && bun test src/socket.test.ts
cd cli && bun test src/terminal/TerminalManager.test.ts
cd cli && bun run test
cd hub && bun test src/socket/terminalSessionState.test.ts src/socket/handlers/terminal.test.ts src/socket/handlers/cli/terminalHandlers.test.ts src/web/routes/sessions.test.ts
cd web && bun run test -- src/components/Terminal/SessionTerminalTabs.test.tsx src/hooks/useTerminalSocket.test.tsx src/lib/archiveConfirmation.test.ts src/components/SessionHeader.test.tsx src/components/SessionList.editor.test.tsx src/components/editor/MobileEditorLayout.test.tsx src/components/Dashboard/session-context-menu.test.tsx
bun run typecheck
bun run test:shared
```

- [ ] Record exact pass/fail output summary in readiness artifact.
- [ ] If any command fails, patch only Red/Yellow regressions directly related to lifecycle. If unrelated, document exact failure and why unrelated.

---

### Task 3: Run repo-wide checks

Run:

```bash
bun run typecheck
bun run test
```

- [ ] Record exact result in readiness artifact.
- [ ] If `bun run test` fails, capture exact failing package/test and classify related vs unrelated.
- [ ] Do not claim repo-wide pass unless exit code is 0.

---

### Task 4: Manual E2E checklist status

**Files:**
- Modify: `_bmad-output/planning-artifacts/session-terminal-lifecycle-dev-readiness.md`

- [ ] Add manual checklist with status `Not run in this session` unless actually performed in browser:
  1. Modal/editor shared list/count.
  2. `sleep 60` survives modal/browser close and reattach.
  3. Explicit close kills one terminal only.
  4. Archive kills all session terminals.
  5. Concurrent create capped at 3.
  6. Session A/B scope isolation.
  7. CLI restart shows lost/recovery state.
  8. Child process group cleanup no orphan.
  9. Short idle/age timer warning and kill UX.
- [ ] Add risk note: manual browser/process checks remain pre-merge release gate if not run.

---

### Task 5: Rollback and readiness checklist

**Files:**
- Modify: `_bmad-output/planning-artifacts/session-terminal-lifecycle-dev-readiness.md`

- [ ] Add rollback notes:
  - Revert branch/code changes.
  - If leaked processes suspected: restart CLI or archive session to invoke internal cleanup.
  - Deploy hub+CLI+web same build; do not mix protocol versions.
- [ ] Add final checklist:
  - Decisions covered.
  - FR/NFR/UX-DR maps exist in `epics.md`.
  - Focused command evidence captured.
  - Full `bun run typecheck` and `bun run test` captured or failures documented.
  - Manual E2E status explicit.
  - GitNexus limitation documented: repo not indexed, so `detect_changes` unavailable.

---

### Task 6: Final verification for Story 4.4

Run:

```bash
git diff --check
bun run typecheck
```

Expected:
- No whitespace errors.
- Typecheck exits 0.
- Readiness artifact contains compatibility, regression, manual, rollback, and checklist sections.

Do not claim Story 4.4 complete without fresh evidence from Tasks 2-6.
