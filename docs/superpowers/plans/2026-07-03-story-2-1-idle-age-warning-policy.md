# Story 2.1 Idle Age Warning Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CLI TerminalManager warning policy for idle and hard-age thresholds without killing processes in this story.

**Architecture:** TerminalManager remains lifecycle source of truth. Warnings are metadata + typed `terminal:warning` events. Tests use injected `now()` plus explicit `checkLifecycleWarnings()` and fake/injected timer callbacks to avoid sleeps/flaky timers. Runtime uses warning-only timers/sweep so warnings fire even when user is away. Story 2.2 owns actual idle/hard kill cleanup; this story only warns and resets warning metadata on real activity/keepalive.

**Tech Stack:** Bun tests, TypeScript strict, `@hapi/protocol` warning payload types.

---

## File Map

| File | Role | Change |
|---|---|---|
| `cli/src/terminal/TerminalManager.ts` | CLI terminal lifecycle source | Add configurable idle warning, age warning, hard lifetime, `onWarning`, warning-only timers, warning state transitions, `checkLifecycleWarnings()`. |
| `cli/src/terminal/TerminalManager.test.ts` | Timer policy tests | Add injected-clock tests for idle warning once, reset by input/output/keepalive, age warning, hard lifetime unchanged. |
| `cli/src/api/apiSession.ts` | Warning bridge | Pass `onWarning` to TerminalManager and emit `terminal:warning` to hub. |
| `cli/src/api/apiSession.test.ts` | Bridge test | Assert keepalive/list path can surface warning payload if needed. |
| `cli/src/api/apiMachine.ts` | Constructor compatibility | Pass optional no-op/emit warning callback if types require; machine behavior out of scope but typed scope supported. |

## Task 1: Add warning contract in TerminalManager

**Files:**
- Modify: `cli/src/terminal/TerminalManager.ts`
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add options/constants**

Add imports/types:

```ts
import type { TerminalWarningPayload } from '@hapi/protocol'
```

Add options:

```ts
onWarning?: (payload: TerminalWarningPayload) => void
idleWarningMs?: number
hardLifetimeMs?: number
ageWarningBeforeMs?: number
```

Defaults:

```ts
const DEFAULT_IDLE_WARNING_MS = 2 * 60 * 60_000
const DEFAULT_HARD_LIFETIME_MS = 24 * 60 * 60_000
const DEFAULT_AGE_WARNING_BEFORE_MS = 30 * 60_000
```

- [ ] **Step 2: Add warning method**

Add public deterministic method:

```ts
checkLifecycleWarnings(): void
```

Also add warning-only scheduling. This story must not kill. Use `setTimeout` only to call `checkLifecycleWarnings()` / emit warning; do not call `cleanup()` from warning timers. Keep existing kill timer disabled by default; Story 2.2 will own kill timers.

Rules:
- Only session terminals should warn in this wave; machine behavior can receive typed payload only if already configured, but tests focus session.
- Skip closed records and missing runtimes.
- Idle warning if `now - lastActivityAt >= idleWarningMs`, `idleWarningAt === null`, and status live.
- Emit `terminal:warning` reason `idle`, message `Terminal has been idle and will stop if no activity occurs.`, `closesAt = lastActivityAt + idleTimeoutMs` if idleTimeoutMs > 0 else `lastActivityAt + 4h` default planned idle kill.
- Set record status `warning_idle` and `idleWarningAt = now`.
- Age warning if `now >= hardExpiresAt - ageWarningBeforeMs`, not previously warned for age, live/warning state, emit reason `age`, `closesAt=hardExpiresAt`, set status `warning_age` unless already `warning_idle` and idle warning more urgent? Prefer age if hard expiry is sooner; tests can assert age status.
- Warning emits once per cycle. Track age warning with `ageWarningAt` metadata internal or set field if adding to record only (not shared schema unless story requires).


- [ ] **Step 2b: Warning runtime driver**

Add private warning timer bookkeeping per runtime, for example `warningTimer`. Scheduling rules:
- On create/new and real activity, schedule next warning check at the earlier of idle warning due and age warning due.
- On check, emit due warning(s), then reschedule if another warning is pending.
- Timer calls `checkLifecycleWarnings()` only; it never calls `cleanup()`.
- Tests can call `checkLifecycleWarnings()` directly with injected `now()` and should also include one fake-timer/scheduled-callback smoke test if practical.

- [ ] **Step 3: Reset on real activity**

`markActivity(runtime)` for write/output/resize? Requirement says input/output/keepalive reset idle. Resize is not listed; do not reset idle on resize. Therefore:
- Split `markActivity(runtime)` into real activity vs resize.
- `write`, output data handler, `keepalive` call real activity reset.
- `resize` updates cols/rows but should not reset idle warning.
- New `create` sets initial `lastActivityAt=createdAt`. Reattach existing terminal must NOT change `lastActivityAt`, clear idle warning, or reset idle timer; it only resizes, marks status running if needed for attach, emits ready/replay.
- `detach()` must NOT update `lastActivityAt`; browser close/disconnect is not activity.
- Real activity sets `lastActivityAt=now`, clears `idleWarningAt`, and if status `warning_idle` set `running`.
- Keepalive does not change `createdAt`, `hardExpiresAt`, or age warning state.

- [ ] **Step 4: Tests**

Add tests using injected now variable:

```ts
it('emits idle warning once after configured idle warning threshold', () => {})
it('resets idle warning after shell input output or keepalive', () => {})
it('does not reset idle warning on resize reconnect detach or list', () => {})
it('emits age warning before hard expiry and keepalive does not reset hard expiry', () => {})
it('emits age warning after idle warning once and leaves status warning_age', () => {})
it('warning checks do not kill processes even when idle timeout is configured', () => {})
```

## Task 2: Bridge warnings through API session client

**Files:**
- Modify: `cli/src/api/apiSession.ts`
- Modify: `cli/src/api/apiSession.test.ts`

- [ ] **Step 1: Pass warning callback**

In `new TerminalManager({ ... })` add:

```ts
onWarning: (payload) => this.socket.emit('terminal:warning', payload)
```

- [ ] **Step 2: Tests**

If TerminalManager mock in `apiSession.test.ts` needs constructor shape, update it. Add test only if cheap:
- construct client, grab mock `onWarning`, call with session warning payload, expect socket emits `terminal:warning`.

## Task 3: Machine client compile compatibility

**Files:**
- Modify: `cli/src/api/apiMachine.ts` if needed.

If `onWarning` remains optional, no change required. If required, pass emit callback. Do not add machine warning UX in this story.

## Task 4: Verification

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts src/api/apiSession.test.ts src/api/apiMachine.test.ts
cd /home/huynq/notebooks/hapi && bun run typecheck
```

Expected: pass.

## Self-Review Checklist

- Idle warning fires once after threshold.
- Input/output/keepalive reset idle warning; resize/reconnect/list do not.
- Age warning fires before hard expiry; keepalive does not change hard expiry.
- No kill/cleanup added in Story 2.1.
- Warning payload typed scope and no raw output.
- Tests use injected clock/no sleeps.
