# Story 3.2 Archive Flow Terminal Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire archive session flow to internal close-all so session terminals are stopped on archive and archived sessions reject new terminal work.

**Architecture:** `SyncEngine.archiveSession()` calls injected best-effort close-all before/with existing `killSession`, then marks session inactive via `handleSessionEnd`. Socket terminal create already rejects inactive sessions; Story 3.2 adds regression tests for archive race/offline/machine boundary. Hub helper from Story 3.1 remains internal only.

**Tech Stack:** TypeScript, Socket.IO, SyncEngine, Bun tests.

---

## Files

- Modify: `hub/src/socket/server.ts`
  - Return `terminalRegistry` from `createSocketServer()`.
- Modify: `hub/src/index.ts`
  - Pass `closeSessionTerminalsInternal` dependency into `SyncEngine`.
- Modify: `hub/src/sync/syncEngine.ts`
  - Add optional archive terminal cleanup dependency.
  - Call it best-effort in `archiveSession()` using session namespace.
- Modify: `hub/src/sync/sessionModel.test.ts`
  - Add archive cleanup tests on SyncEngine.
- Modify: `hub/src/socket/handlers/terminal.test.ts`
  - Add race regression: create rejected after session becomes inactive; machine unaffected.

## Task 1: Inject archive close-all into SyncEngine

**Files:**
- Modify: `hub/src/sync/syncEngine.ts`

- [ ] Add type:

```ts
type CloseSessionTerminals = (input: { namespace: string; sessionId: string }) => void | Promise<void>
```

- [ ] Constructor gets optional 5th param:

```ts
constructor(store, io, rpcRegistry, sseManager, private readonly closeSessionTerminals?: CloseSessionTerminals) { ... }
```

- [ ] In `archiveSession(sessionId)`:

```ts
async archiveSession(sessionId: string): Promise<void> {
    const session = this.sessionCache.getSession(sessionId)
    if (session) {
        try {
            await this.closeSessionTerminals?.({ namespace: session.namespace, sessionId })
        } catch {
            // best effort terminal cleanup; archive still completes
        }
    }
    try {
        await this.rpcGateway.killSession(sessionId)
    } catch {
        // Best-effort: CLI may already be disconnected — still mark session ended
    }
    this.handleSessionEnd({ sid: sessionId, time: Date.now(), reason: 'terminated' })
}
```

Important:
- Do not block archive forever; no retry loop here.
- If session missing, do not call close-all; keep existing behavior.

## Task 2: Wire production server

**Files:**
- Modify: `hub/src/socket/server.ts`
- Modify: `hub/src/index.ts`

- [ ] `createSocketServer()` return includes `terminalRegistry`:

```ts
return { io, engine, rpcRegistry, terminalRegistry }
```

- [ ] Import `closeSessionTerminalsInternal` in `hub/src/index.ts`.

- [ ] Construct SyncEngine with dependency:

```ts
syncEngine = new SyncEngine(
    store,
    socketServer.io,
    socketServer.rpcRegistry,
    sseManager,
    (input) => closeSessionTerminalsInternal({ io: socketServer.io, terminalRegistry: socketServer.terminalRegistry }, input)
)
```

## Task 3: SyncEngine tests

**Files:**
- Modify: `hub/src/sync/sessionModel.test.ts`

Add tests near archive/session end tests:

- [ ] CLI online path:
  - create active session with namespace.
  - inject `closeSessionTerminals` spy and `rpcGateway.killSession` spy/stub if existing test harness permits.
  - call `archiveSession(session.id)`.
  - expect close-all called with `{ namespace, sessionId }` before/alongside kill.
  - expect session inactive.

- [ ] CLI offline path:
  - injected close-all throws; `killSession` throws.
  - archive still marks session inactive and end reason terminated.

If direct `rpcGateway` stubbing is awkward, use dependency close-all spy only and existing session inactive assertion. Keep tests focused on new dependency.

## Task 4: Terminal create/archive race and machine boundary

**Files:**
- Modify: `hub/src/socket/handlers/terminal.test.ts`

- [ ] Existing inactive create test covers create rejected when inactive. Add explicit archive-style race test:
  - Terminal socket namespace default.
  - `getSession` closure returns active true initially, then false after simulated archive.
  - First create while active can open.
  - Set `active=false`.
  - Second create rejected with session inactive/unavailable.

- [ ] Machine boundary:
  - Same test or separate: machine create still works when session active flag false, because machine scope uses `getMachine`, not session archive.

## Task 5: Verification

Run:

```bash
cd hub && bun test src/sync/sessionModel.test.ts src/socket/handlers/terminal.test.ts src/socket/internalTerminalControl.test.ts
bun run typecheck
```

Optional focused:

```bash
cd hub && bun test src/socket/handlers/cli/terminalHandlers.test.ts src/socket/terminalRegistry.test.ts
```

## BMAD risk checklist

- Archive must complete if CLI offline or close-all throws.
- close-all must happen before or with killSession, not after session disappears.
- Archived/inactive sessions reject new terminal create.
- Machine/project terminal creation remains legacy and unaffected by session archive.
- No web `close-all` exposure.
- No long waits/retry loops in archive path.

---

## BMAD party review patch — must implement before coding

Review result: RED until archive race is closed.

### Archive order correction

`archiveSession()` must mark session inactive before any awaited cleanup/kill call:

```ts
async archiveSession(sessionId: string): Promise<void> {
    const session = this.sessionCache.getSession(sessionId)
    const namespace = session?.namespace

    // Close create/list race immediately. Terminal handlers see active=false now.
    this.handleSessionEnd({ sid: sessionId, time: Date.now(), reason: 'terminated' })

    if (namespace) {
        try {
            this.closeSessionTerminals?.({ namespace, sessionId })
        } catch {
            // Best-effort terminal cleanup; archive already completed logically.
        }
    }

    try {
        await this.rpcGateway.killSession(sessionId)
    } catch {
        // Best-effort: CLI may already be disconnected.
    }
}
```

Rules:
- Capture namespace before `handleSessionEnd`.
- `closeSessionTerminals` dependency must be synchronous/non-blocking. Use type:

```ts
type CloseSessionTerminals = (input: { namespace: string; sessionId: string }) => void
```

- Do not await close-all helper.
- Do not call `handleSessionEnd` twice.
- If session missing, `handleSessionEnd` remains safe/no-op through cache, but cleanup is skipped.

### Race test required

In `hub/src/sync/sessionModel.test.ts` or focused sync test:

- Stub `rpcGateway.killSession` to return a pending Promise.
- Call `const archivePromise = engine.archiveSession(session.id)` and do not await.
- Immediately assert `engine.getSession(session.id)?.active === false`.
- Through terminal handler or direct getSession closure, attempt `terminal:create` while kill pending.
- Expect `terminal:error` with “Session is inactive or unavailable.” and no `terminal:open` to CLI.
- Resolve pending kill and await `archivePromise`.

If wiring full terminal handler in sync test is too heavy, add a handler test with `getSession` reading the same session object after archive starts.

### Inactive list/subscribe test

Add terminal handler regression:
- inactive session `terminal:subscribe` does not join room.
- inactive session `terminal:list` does not emit to CLI.

### Offline behavior

Test close-all throws and kill throws after early inactive:
- `archiveSession()` resolves.
- session stays inactive.
- no unhandled rejection.

### Machine boundary

Terminal handler test:
- session inactive does not block machine `terminal:create` when `getMachine` active.
