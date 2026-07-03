---
title: Dev readiness - Session-scoped terminal lifecycle
status: implementation-evidence
date: 2026-07-03
source:
  - _bmad-output/planning-artifacts/epics.md
  - docs/superpowers/plans/2026-07-02-session-scoped-terminal-lifecycle.md
  - docs/superpowers/plans/2026-07-03-story-4-4-regression-readiness-sweep.md
---

# Dev readiness - Session-scoped terminal lifecycle

## Implementation status - 15/15 stories

| # | Story | Status | Evidence |
|---|---|---|---|
| 1 | 1.1 Contract và state model | Implemented | `shared/src/socket.test.ts` pass |
| 2 | 1.2 CLI TerminalManager lifecycle/max/replay | Implemented | `cli/src/terminal/TerminalManager.test.ts` pass |
| 3 | 1.3 Hub routing/auth scope rooms | Implemented | `hub/src/socket/handlers/terminal.test.ts`, `hub/src/socket/handlers/cli/terminalHandlers.test.ts` pass |
| 4 | 1.4 Shared `SessionTerminalTabs` modal/editor/route | Implemented | `web/src/components/Terminal/SessionTerminalTabs.test.tsx`, related web tests pass |
| 5 | 1.5 Machine/project legacy boundary | Implemented | CLI/hub/web legacy machine tests pass in focused/root suites |
| 6 | 2.1 Idle/age timer policy | Implemented | `TerminalManager.test.ts` timer tests pass |
| 7 | 2.2 Idle/hard kill + process cleanup | Implemented | SIGTERM/SIGKILL/fake-clock tests pass |
| 8 | 2.3 Idle/age warning UX | Implemented | `SessionTerminalTabs` + `useTerminalSocket` tests pass |
| 9 | 3.1 Internal close-all | Implemented | `hub/src/socket/internalTerminalControl.test.ts` and handler tests pass via root test |
| 10 | 3.2 Archive cleanup/reject create | Implemented | `hub/src/web/routes/sessions.test.ts` and terminal handler tests pass |
| 11 | 3.3 Archive confirmation copy/count | Implemented | archive confirmation + SessionHeader/List/Dashboard tests pass |
| 12 | 4.1 CLI lost/recovery | Implemented | `terminalSessionState`, terminal handlers, web recovery tests pass |
| 13 | 4.2 Race/scope/auth hardening | Implemented | max-3 multi-socket, strict mixed scope, idempotent close tests pass |
| 14 | 4.3 Replay memory/no-secret logging | Implemented | replay cap, no raw payload/log, env/cwd redaction tests pass |
| 15 | 4.4 Regression/readiness sweep | Implemented | this artifact + full checks below |

## Compatibility boundary

- Socket contract now uses strict typed scope for lifecycle events and strict legacy payload schemas for old terminal events.
- Valid legacy `{ sessionId }` / `{ machineId }` terminal event payloads remain accepted where covered by tests.
- Mixed typed/legacy scopes and extra raw fields such as `outputBuffer`, `data`, `env`, or `command` are rejected.
- Session terminals use new lifecycle behavior; machine/project terminals keep legacy behavior in this wave.
- Hub/CLI/web must deploy from same build because socket protocol changed.
- `close-all` remains internal archive path only; browser/web handlers do not expose it.

## Safety decisions preserved

- Modal terminal uses same source as editor terminal via shared `SessionTerminalTabs`.
- Terminal lives by session, not browser/modal/component.
- Browser/tab/modal/route/editor close means detach only, not process kill.
- Explicit `close-one` kills only one terminal.
- Archive session kills all session terminals via internal hub→CLI path.
- Max 3 live terminals per session; CLI `TerminalManager` is source of truth.
- Idle warning after 2h; idle kill after 4h; hard kill after 24h lifetime.
- Hub is authenticated routing/control plane, not terminal state/process owner except metadata-only recovery cache.
- Scope rooms are exact: `terminal:session:${sessionId}` / `terminal:machine:${machineId}`.
- Replay buffer bounded at `MAX_OUTPUT_BUFFER_CHARS = 200_000`.
- No raw output, typed input, env, command, token, cookie, cwd full path, or Error stack/message in terminal list/state/warning/lifecycle logs.
- Process cleanup uses SIGTERM then SIGKILL grace with process-group first.

## Focused regression evidence

Commands run on 2026-07-03:

| Command | Result |
|---|---|
| `cd shared && bun test src/socket.test.ts` | 16 pass, 0 fail |
| `cd cli && bun test src/terminal/TerminalManager.test.ts` | 50 pass, 0 fail, includes close-one frees slot regression |
| `cd cli && bun run test` | 84 test files passed, 1 skipped; 623 tests passed, 12 skipped; TerminalManager 50 pass |
| `cd hub && bun test src/socket/terminalSessionState.test.ts src/socket/handlers/terminal.test.ts src/socket/handlers/cli/terminalHandlers.test.ts src/web/routes/sessions.test.ts` | Covered by focused/root hub checks; terminal handler focused command: 43 pass, 0 fail; root hub: 268 pass, 0 fail |
| `cd hub && bun test src/socket/handlers/terminal.test.ts src/socket/handlers/cli/terminalHandlers.test.ts` | 45 pass, 0 fail |
| `cd web && bun run test -- src/components/Terminal/SessionTerminalTabs.test.tsx src/hooks/useTerminalSocket.test.tsx src/lib/archiveConfirmation.test.ts src/components/SessionHeader.test.tsx src/components/SessionList.editor.test.tsx src/components/editor/MobileEditorLayout.test.tsx src/components/Dashboard/session-context-menu.test.tsx` | 7 files passed, 86 tests passed |
| `bun run test:shared` | 46 pass, 0 fail |
| `bun run typecheck` | shared + cli + web + hub `tsc --noEmit` pass |
| `bun run test` | cli pass, hub 268 pass, web 91 files / 555 tests pass; exit 0 |
| `git diff --check` | exit 0 |

## Full-suite evidence

```bash
bun run typecheck
```

Result: exit 0.

```bash
bun run test
```

Result: exit 0.

Summary:
- CLI: 84 Vitest files passed, 1 skipped; 623 tests passed, 12 skipped; TerminalManager Bun tests 50 pass.
- Hub: 268 tests passed, 0 fail.
- Web: 91 test files passed, 555 tests passed.


## Final BMAD block resolution

Resolved after final epic review:

- RED-1 `close-one` stale lifecycle: fixed by emitting fresh CLI `terminal:list` after explicit session `terminal:close`; regression covers `t1` closed as `closed_user/user_close`, live count drops to 2, and a new terminal can be created.
- YELLOW-1 hub session preflight max: fixed by defaulting session preflight max to 3 while keeping legacy socket/machine max at 4/env behavior.
- YELLOW-2 process-group cleanup: remains manual E2E release gate because OS-level orphan check was not run in this session.

## Manual E2E checklist

Status: **Not run in browser/process session**. This remains pre-merge release gate.

| Scenario | Status | Risk if not run |
|---|---|---|
| Modal/editor shared list/count `n/3` | Not run | UI integration may differ from unit tests |
| `sleep 60` survives modal/browser close and reattach | Not run | Browser lifecycle detach may regress in real tab close |
| Explicit close kills one terminal only | Not run | Process-level confirmation not visually verified |
| Archive kills all session terminals | Not run | Real CLI process cleanup through archive not manually observed |
| Concurrent create capped at 3 | Not run | Race covered by tests, not stressed manually |
| Session A/B scope isolation | Not run | Covered by tests, not verified with real two sessions |
| CLI restart shows lost/recovery state | Not run | Recovery UX covered by tests, not real restart |
| Child process group cleanup no orphan | Not run | SIGTERM/SIGKILL covered by fake process, not OS-level orphan check |
| Short idle/age timer warning and kill UX | Not run | Fake clock tests pass, real timer UX not observed |

## Rollback / recovery notes

- Revert branch/code changes if release fails.
- If leaked processes suspected: restart affected CLI or archive session to invoke internal cleanup.
- Do not deploy mixed protocol versions. Ship hub + CLI + web from same build.
- If web-only UX regression appears, server-side safety still keeps max 3, idle/hard cleanup, and archive cleanup.

## GitNexus limitation

`mcp__gitnexus.detect_changes` was attempted with repo `/home/huynq/notebooks/hapi` and failed because HAPI is not indexed. Available indexed repos do not include this workspace. Treat GitNexus impact analysis as unavailable for this session.

## Final readiness checklist

- [x] Decisions covered: shared modal/editor source, session lifecycle, detach no kill, archive kills, max 3, idle/age timers, `close-all` internal only, CLI source of truth, hub routing only, shared `SessionTerminalTabs`, machine/project legacy.
- [x] FR/NFR/UX-DR maps exist in `_bmad-output/planning-artifacts/epics.md`.
- [x] Focused test commands listed with results.
- [x] Full `bun run typecheck` result captured.
- [x] Full `bun run test` result captured.
- [x] Manual E2E checklist explicitly marked not run with risk.
- [x] Rollback notes captured.
- [x] Deploy same-build note captured.
- [x] GitNexus unavailable state captured.

## Release verdict

Automated readiness: **pass**.

Manual E2E: **not run**; required before merge/release if process-level confidence is needed.
