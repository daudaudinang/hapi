# Story 1.5 Machine Project Legacy Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock regression boundaries so session terminal lifecycle does not change machine/project terminal behavior in this wave.

**Architecture:** Treat Story 1.5 as regression hardening. Add focused tests and small guard fixes only. Session terminals use shared `SessionTerminalTabs`; machine/project terminals keep legacy `useTerminalSocket` single-terminal path, legacy max/default detached cleanup, and machine rooms/events. Hub routing remains namespace-qualified for web-facing terminal rooms and legacy machine CLI rooms for CLI lookup.

**Tech Stack:** TypeScript strict, Vitest/Bun tests, Socket.IO handler fakes.

---

## File Map

| File | Role | Change |
|---|---|---|
| `cli/src/api/apiMachine.test.ts` | Machine API regression | Add tests for machine terminal open/write/resize/close/detach, disconnect closeAll legacy, and no new session list lifecycle. |
| `cli/src/terminal/TerminalManager.test.ts` | Manager session/machine split | Ensure machine max/default detached cleanup remains legacy and machine list not counted as session. |
| `hub/src/socket/handlers/terminal.test.ts` | Hub boundary | Add/confirm machine events do not join/session room, machine max not capped by session max 3, close-all unavailable, detach-only disconnect. |
| `hub/src/socket/handlers/cli/terminalHandlers.test.ts` | CLI→web boundary | Add/confirm machine list/output/warning exact machine room not session room. |
| `web/src/components/editor/EditorTerminal.test.tsx` | Editor boundary | Add/confirm machine tabs do not render `SessionTerminalTabs`, no `n/3`, still use legacy hook. |
| `web/src/components/editor/EditorLayout.test.tsx` | Pagehide/project switch boundary | Confirm session tab cleanup non-destructive; machine close legacy path preserved. |
| `_bmad-output/planning-artifacts/session-terminal-lifecycle-dev-readiness.md` | Dev notes | Add short note: machine/project durability out of scope this wave. |

## Task 1: CLI machine API regression tests

**Files:**
- Modify: `cli/src/api/apiMachine.test.ts`

- [ ] **Step 1: Mock TerminalManager with event capture**

Add a hoisted mock for `TerminalManager` if not already present, preserving current opencode tests. Capture calls:

```ts
const terminalManagerInstances: Array<{
    create: ReturnType<typeof vi.fn>
    write: ReturnType<typeof vi.fn>
    resize: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    detach: ReturnType<typeof vi.fn>
    closeAll: ReturnType<typeof vi.fn>
}> = []
```

- [ ] **Step 2: Add machine terminal legacy event tests**

Test intents:

```ts
it('keeps machine terminal events on the legacy single-terminal path', () => {
    // Create ApiMachineClient for machine-1.
    // Trigger socket server events terminal:open/write/resize/close/detach with { machineId:'machine-1', terminalId:'tm' }.
    // Expect TerminalManager create/write/resize/close/detach called.
    // Expect no session list/keepalive handlers required for machine client.
})

it('ignores terminal events for another machine id', () => {
    // Trigger machineId other; expect manager methods not called.
})
```

## Task 2: TerminalManager split regression

**Files:**
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add or confirm machine legacy max/detached tests**

Ensure tests assert:
- machine manager default max remains legacy value (4 from existing behavior), not session max 3.
- machine detached cleanup still kills after configured detached timeout.
- session manager detach still does not schedule legacy detached cleanup.
- machine `list()` payload has `scopeType:'machine'` and is not counted in session max tests.

## Task 3: Hub machine/session room boundary tests

**Files:**
- Modify: `hub/src/socket/handlers/terminal.test.ts`
- Modify: `hub/src/socket/handlers/cli/terminalHandlers.test.ts`

- [ ] **Step 1: Web terminal namespace machine boundary**

Add/confirm tests:

```ts
it('allows four machine terminals through hub even when session max is three', () => {
    // create harness with maxTerminalsPerSession: 3 but machine path should use machine/per-socket legacy boundary, not session max.
    // create four machine terminals; expect no max 3 machine error and four terminal:open emits.
})

it('does not put machine terminal events into a session room', () => {
    // Subscribe machine scope and session scope with same id text.
    // Expect joinedRooms contains terminal:<namespace>:machine:<machineId> only for machine subscribe.
    // Expect no terminal:<namespace>:session:<machineId>.
})
```

- [ ] **Step 2: CLI machine forwarding boundary**

Add/confirm tests:

```ts
it('forwards machine output/list/warning/ready/exit/error only to the machine room', () => {
    // Trigger machine payload.
    // Expect roomEmits include terminal:default:machine:machine-1:*.
    // Expect no terminal:default:session:machine-1:* for all stream/list/warning events.
})
```

## Task 4: Web editor machine legacy boundary tests

**Files:**
- Modify: `web/src/components/editor/EditorTerminal.test.tsx`
- Modify: `web/src/components/editor/EditorLayout.test.tsx`

- [ ] **Step 1: Editor machine tab must not use shared session tabs**

Mock `SessionTerminalTabs` and assert:
- Session tab renders shared tabs.
- Machine tab renders legacy `TerminalView`/`useTerminalSocket`.
- Machine tab renders real/mocked `TerminalView`, calls legacy `useTerminalSocket({ machineId, sessionId: '' })`, and does not render `SessionTerminalTabs` or session count `0/3`, `1/3`, etc.
- Machine tab plus/close behavior remains old editor terminal tab behavior.

- [ ] **Step 2: Pagehide/project switch boundary**

Update/add tests:
- Mixed session + machine case: pagehide/project switch calls machine legacy close callback only; session shared tabs must not register destructive close.
- Session terminal registered through shared tabs does not register destructive close; pagehide does not call session close.
- Machine terminal close callback still called on project switch/pagehide if legacy tests previously expected it.

## Task 5: Dev note

**Files:**
- Modify: `_bmad-output/planning-artifacts/session-terminal-lifecycle-dev-readiness.md`

Add note:

```md
### Machine/project terminal boundary
Machine/project terminal durability is explicitly out of scope for this wave. They keep legacy single-terminal UI and cleanup behavior. Session lifecycle stories must not count machine terminals toward session max, include them in session archive cleanup, or route machine terminal events into session rooms.
```

## Task 6: Verification

Run:

```bash
cd cli && bun test src/api/apiMachine.test.ts src/terminal/TerminalManager.test.ts
cd ../hub && bun test src/socket/handlers/terminal.test.ts src/socket/handlers/cli/terminalHandlers.test.ts src/socket/terminalRegistry.test.ts
cd ../web && bun run test -- src/components/editor/EditorTerminal.test.tsx src/components/editor/EditorLayout.test.tsx src/components/Terminal/SessionTerminalTabs.test.tsx
cd /home/huynq/notebooks/hapi && bun run typecheck
```

Expected: pass.

## Self-Review Checklist

- Machine/project terminal still uses legacy `useTerminalSocket` path.
- Machine/project terminal does not render session count `n/3`.
- Machine TerminalManager max/detached cleanup not changed to session behavior.
- Machine hub events never land in session rooms.
- Session pagehide remains detach-only; machine pagehide/project switch legacy close remains if old behavior expected it.
- Dev note explicitly marks machine/project durability out of scope.
