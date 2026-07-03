# Story 3.1 Internal Close-All Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hub internal session `terminal:close-all` control path for archive cleanup without exposing any web-callable destructive API.

**Architecture:** Web terminal namespace still has no `terminal:close-all` handler. Hub exposes an internal helper that finds matching CLI sockets by namespace + session room and emits typed `terminal:close-all` only to CLI. CLI session client validates typed session payload and calls `TerminalManager.closeAll()`; registry cleanup removes only hub routing state.

**Tech Stack:** TypeScript, Socket.IO, Bun/Vitest tests, HAPI shared protocol schemas.

---

## Files

- Create: `hub/src/socket/internalTerminalControl.ts`
  - Internal helper for session close-all.
- Modify: `hub/src/socket/terminalRegistry.ts`
  - Add `removeBySession(sessionId)` for routing cleanup only.
- Modify: `hub/src/socket/terminalRegistry.test.ts`
  - Test session-only registry cleanup, machine untouched.
- Modify: `hub/src/socket/handlers/terminal.test.ts`
  - Test helper emits close-all to correct CLI only and web trigger still blocked.
- Modify: `cli/src/api/apiSession.ts`
  - Add typed `terminal:close-all` handler for own session only.
- Modify: `cli/src/api/apiSession.test.ts`
  - Test valid internal close-all calls `TerminalManager.closeAll()` and emits archive-closed list; wrong/malformed ignored.

## Task 1: Hub internal helper

**Files:**
- Create: `hub/src/socket/internalTerminalControl.ts`
- Modify: `hub/src/socket/handlers/terminal.test.ts`

- [ ] Implement helper:

```ts
import { TerminalCloseAllPayloadSchema, type TerminalCloseAllPayload } from '@hapi/protocol'
import type { SocketServer } from './socketTypes'
import type { TerminalRegistry } from './terminalRegistry'

export type CloseSessionTerminalsDeps = {
    io: SocketServer
    terminalRegistry: TerminalRegistry
}

export function closeSessionTerminalsInternal(
    deps: CloseSessionTerminalsDeps,
    input: { namespace: string; sessionId: string }
): number {
    const payload: TerminalCloseAllPayload = {
        scopeType: 'session',
        sessionId: input.sessionId,
        reason: 'archive'
    }
    const parsed = TerminalCloseAllPayloadSchema.safeParse(payload)
    if (!parsed.success) return 0

    const cliNamespace = deps.io.of('/cli')
    const room = cliNamespace.adapter.rooms.get(`session:${input.sessionId}`)
    if (!room) {
        deps.terminalRegistry.removeBySession(input.sessionId)
        return 0
    }

    let emitted = 0
    for (const socketId of room) {
        const cliSocket = cliNamespace.sockets.get(socketId)
        if (!cliSocket || cliSocket.data.namespace !== input.namespace) continue
        cliSocket.emit('terminal:close-all', parsed.data)
        emitted += 1
    }
    deps.terminalRegistry.removeBySession(input.sessionId)
    return emitted
}
```

Important:
- No export to web routes yet; Story 3.2 wires archive path.
- Only session scope; machine scope impossible.
- Helper returns emit count for tests/observability.

- [ ] Tests in `terminal.test.ts`:
  - namespace A session CLI receives `terminal:close-all` with `{ scopeType:'session', sessionId, reason:'archive' }`.
  - namespace B CLI in same room does not receive.
  - machine CLI does not receive.
  - web `terminal:close-all` trigger still does not forward.

## Task 2: Registry session routing cleanup

**Files:**
- Modify: `hub/src/socket/terminalRegistry.ts`
- Modify: `hub/src/socket/terminalRegistry.test.ts`

- [ ] Add method:

```ts
removeBySession(sessionId: string): TerminalRegistryEntry[] {
    const ids = this.terminalsBySession.get(sessionId)
    if (!ids || ids.size === 0) return []
    return Array.from(ids).map((terminalId) => this.remove(terminalId)).filter(Boolean) as TerminalRegistryEntry[]
}
```

- [ ] Tests:
  - registers two session terminals and one machine terminal.
  - `removeBySession('session-1')` removes only session entries.
  - `countForSession('session-1') === 0`; machine count remains.
  - timers are cleared by existing `remove()` path.

## Task 3: CLI session close-all handler

**Files:**
- Modify: `cli/src/api/apiSession.ts`
- Modify: `cli/src/api/apiSession.test.ts`

- [ ] Import `TerminalCloseAllPayloadSchema`.

- [ ] Add socket handler near other terminal handlers:

```ts
this.socket.on('terminal:close-all', (data: unknown) => {
    const parsed = TerminalCloseAllPayloadSchema.safeParse(data)
    if (!parsed.success || parsed.data.scopeType !== 'session' || parsed.data.sessionId !== this.sessionId) {
        return
    }
    this.terminalManager.closeAll()
    this.socket.emit('terminal:list', {
        scopeType: 'session',
        sessionId: this.sessionId,
        terminals: this.terminalManager.list()
    })
})
```

Reason is typed `archive`; `TerminalManager.closeAll()` already closes with archive reason.

- [ ] Tests:
  - valid payload calls `closeAll` once and emits list.
  - wrong session ignored.
  - malformed/machine payload ignored.
  - disconnect still does not call `closeAll`.

## Task 4: Verification

Run:

```bash
cd hub && bun test src/socket/handlers/terminal.test.ts src/socket/terminalRegistry.test.ts
cd cli && bun test src/api/apiSession.test.ts
bun run typecheck
```

Expected: pass.

## BMAD risk checklist

- `close-all` must remain absent from web ClientToServer events and terminal namespace handlers.
- Helper must not accept machine scope.
- Helper must filter namespace, not just session room.
- Registry cleanup is routing cleanup only; CLI remains source of truth lifecycle.
- CLI validates own session id before `closeAll()`.
- Wrong/malformed payload ignored, no destructive action.

---

## BMAD party review patch — must implement before coding

Review result: RED until these corrections are applied.

### Shared contract correction

`TerminalCloseAllPayloadSchema` must include archive reason because internal close-all exists only for archive path:

```ts
export const TerminalCloseAllPayloadSchema = z.object({
    scopeType: z.literal('session'),
    sessionId: z.string().min(1),
    reason: z.literal('archive')
}).strict()
```

Update `shared/src/socket.test.ts`:
- accept `{ scopeType:'session', sessionId:'s1', reason:'archive' }`
- reject missing reason
- reject machine scope
- reject extra keys
- preserve compile guard: `ClientToServerEvents['terminal:close-all']` must remain type error.

### Registry namespace isolation

Add namespace to entries:

```ts
export type TerminalRegistryEntry = {
    terminalId: string
    sessionId?: string
    machineId?: string
    namespace: string
    socketId: string
    cliSocketId: string
    idleTimer: ReturnType<typeof setTimeout> | null
}
```

Update register options to require `namespace` for new object-style register calls. Legacy overload may use empty namespace only for old tests, but new code must pass real namespace from terminal socket.

Add:

```ts
removeBySession(sessionId: string, namespace: string): TerminalRegistryEntry[]
entriesForSession(sessionId: string, namespace: string): TerminalRegistryEntry[]
```

Rules:
- remove only entries where both `sessionId` and `namespace` match.
- never remove machine entries.
- same `sessionId` in different namespace remains.

### Hub register path update

When web terminal `terminal:create` registers, pass namespace:

```ts
terminalRegistry.register({ terminalId, sessionId, machineId, namespace, socketId: socket.id, cliSocketId })
```

Any test harness registering terminals must include namespace.

### Internal helper correction: avoid multi-CLI list race

Create `hub/src/socket/internalTerminalControl.ts` with selection:

1. Compute `registryEntries = terminalRegistry.entriesForSession(sessionId, namespace)`.
2. If entries exist, target unique `cliSocketId`s from those entries only.
   - This targets CLIs that actually own known routing state.
   - Prevent stale same-session CLI from emitting empty list after owner list.
3. If no entries exist, fallback to matching CLI sockets in room `session:<sessionId>` with same namespace.
   - This allows archive cleanup before any web terminal attachment.
4. Emit `{ scopeType:'session', sessionId, reason:'archive' }` only to selected sockets.
5. Cleanup registry with `removeBySession(sessionId, namespace)` after emit.
6. Return emit count.

Never accept machine scope in helper API.

### Tests required

Add `hub/src/socket/internalTerminalControl.test.ts`:
- emits close-all with reason archive to owning CLI only.
- namespace B same sessionId does not receive, and registry B remains.
- machine CLI/entries not touched.
- when no registry entries exist, fallback emits to matching session room CLI in namespace.
- duplicate CLI same session/namespace: if registry entries owned by one CLI, only owner receives.

Update `hub/src/socket/terminalRegistry.test.ts`:
- namespace A/B same sessionId isolation.
- `entriesForSession` returns namespace-scoped entries.
- `removeBySession(sessionId, namespace)` removes only matching entries.

Update `cli/src/api/apiSession.test.ts`:
- valid close-all calls `TerminalManager.closeAll()` once.
- emitted list contains terminal with `status:'closed_archive'` and `closeReason:'archive'`.
- wrong session ignored.
- missing reason/machine/extra key ignored.
- disconnect still does not call closeAll.

Update `hub/src/socket/handlers/terminal.test.ts`:
- web trigger `terminal:close-all` still not forwarded.
- normal web terminal handler has no close-all listener exposed.

### Verification correction

Run:

```bash
cd shared && bun test src/socket.test.ts
cd hub && bun test src/socket/internalTerminalControl.test.ts src/socket/handlers/terminal.test.ts src/socket/terminalRegistry.test.ts src/socket/handlers/cli/terminalHandlers.test.ts
cd cli && bun test src/api/apiSession.test.ts
bun run typecheck
```
