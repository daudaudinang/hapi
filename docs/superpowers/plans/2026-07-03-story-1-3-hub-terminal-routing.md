# Story 1.3 Hub Terminal Routing and Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add authenticated typed terminal subscribe/list/keepalive routing and exact scope-room forwarding in hub without making hub lifecycle source of truth.

**Architecture:** Web terminal namespace authorizes typed scopes and joins namespace-qualified exact Socket.IO rooms. Hub forwards list/keepalive/create/write/resize/close/detach to the matching CLI socket; CLI-origin list/warning events are forwarded to exact scope rooms. Existing terminal registry remains attach routing only and legacy open/write/resize/close behavior stays compatible.

**Tech Stack:** Bun, TypeScript strict, Socket.IO-style handlers, Zod schemas from `@hapi/protocol`, Bun tests.

---

## File Map

| File | Role | Change |
|---|---|---|
| `hub/src/socket/terminalRooms.ts` | Shared terminal room helper | New helper `terminalScopeRoom(scope)` for session/machine exact rooms. |
| `hub/src/socket/handlers/terminal.ts` | Web terminal namespace handlers | Add typed `terminal:subscribe`, `terminal:unsubscribe`, `terminal:list`, `terminal:keepalive`; authorize scope; join/leave rooms; no `terminal:close-all`. |
| `hub/src/socket/handlers/cli/terminalHandlers.ts` | CLI→web forwarding | Add typed `terminal:list` and `terminal:warning` forwarding to exact scope rooms; add exact room forwarding for ready/output/exit/error while preserving legacy attached-socket emit during migration. |
| `hub/src/socket/handlers/terminal.test.ts` | Web handler tests | Add tests for subscribe/list/keepalive/no close-all/cross-scope rooms, malformed scope rejection, stale CLI room handling, and session idle skip. |
| `hub/src/socket/handlers/cli/terminalHandlers.test.ts` | CLI handler tests | Add tests for exact scope room forwarding, access denial, scope-mismatch schema rejection, and no cross-scope leakage. |

## Task 1: Add failing web terminal handler tests

**Files:**
- Modify: `hub/src/socket/handlers/terminal.test.ts`

- [ ] **Step 1: Extend fake socket/namespace**

Add room support to `FakeSocket`:

```ts
readonly joinedRooms = new Set<string>()
join(room: string): void { this.joinedRooms.add(room) }
leave(room: string): void { this.joinedRooms.delete(room) }
```

- [ ] **Step 2: Add RED tests**

Add tests:

```ts
it('subscribes to an authorized session scope room and requests list from CLI', () => {
    const { terminalSocket, cliNamespace } = createHarness()
    const cliSocket = new FakeSocket('cli-socket-1')
    connectCliSocket(cliNamespace, cliSocket, 'session-1')

    terminalSocket.trigger('terminal:subscribe', { scopeType: 'session', sessionId: 'session-1' })

    expect(terminalSocket.joinedRooms.has('terminal:default:session:session-1')).toBe(true)
    expect(lastEmit(cliSocket, 'terminal:list')?.data).toEqual({ scopeType: 'session', sessionId: 'session-1' })
})

it('rejects subscribe/list/keepalive for a session outside the socket namespace', () => {
    const io = new FakeServer()
    const terminalSocket = new FakeSocket('terminal-socket')
    terminalSocket.data.namespace = 'default'
    const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
    registerTerminalHandlers(terminalSocket as unknown as SocketWithData, {
        io: io as unknown as SocketServer,
        getSession: () => ({ active: true, namespace: 'other' }),
        getMachine: () => ({ active: true, namespace: 'default' }),
        terminalRegistry,
        maxTerminalsPerSocket: 4,
        maxTerminalsPerSession: 3
    })

    terminalSocket.trigger('terminal:subscribe', { scopeType: 'session', sessionId: 'session-1' })
    terminalSocket.trigger('terminal:list', { scopeType: 'session', sessionId: 'session-1' })
    terminalSocket.trigger('terminal:keepalive', { scopeType: 'session', sessionId: 'session-1', terminalId: 't1' })

    expect(terminalSocket.joinedRooms.size).toBe(0)
})

it('forwards typed list and keepalive requests to the matching CLI only', () => {
    const { terminalSocket, cliNamespace } = createHarness()
    const sessionCli = new FakeSocket('session-cli')
    const machineCli = new FakeSocket('machine-cli')
    connectCliSocket(cliNamespace, sessionCli, 'session-1')
    connectMachineCliSocket(cliNamespace, machineCli, 'machine-1')

    terminalSocket.trigger('terminal:list', { scopeType: 'machine', machineId: 'machine-1' })
    terminalSocket.trigger('terminal:keepalive', { scopeType: 'machine', machineId: 'machine-1', terminalId: 'tm' })

    expect(lastEmit(machineCli, 'terminal:list')?.data).toEqual({ scopeType: 'machine', machineId: 'machine-1' })
    expect(lastEmit(machineCli, 'terminal:keepalive')?.data).toEqual({ scopeType: 'machine', machineId: 'machine-1', terminalId: 'tm' })
    expect(lastEmit(sessionCli, 'terminal:list')).toBeUndefined()
    expect(lastEmit(sessionCli, 'terminal:keepalive')).toBeUndefined()
})

it('does not expose close-all as a web terminal event', () => {
    const { terminalSocket, cliNamespace } = createHarness()
    const cliSocket = new FakeSocket('cli-socket-1')
    connectCliSocket(cliNamespace, cliSocket, 'session-1')

    terminalSocket.trigger('terminal:close-all', { scopeType: 'session', sessionId: 'session-1' })

    expect(lastEmit(cliSocket, 'terminal:close-all')).toBeUndefined()
})
```

- [ ] **Step 2b: Add RED risk tests from BMAD party review**

Add these test intents in `terminal.test.ts` (exact fake harness shape may follow existing file):

```ts
it('rejects malformed typed scopes without join or CLI emit', () => {
    const { terminalSocket, cliNamespace } = createHarness()
    const cliSocket = new FakeSocket('cli-socket-1')
    connectCliSocket(cliNamespace, cliSocket, 'session-1')

    for (const payload of [
        { sessionId: 'session-1' },
        { scopeType: 'session', sessionId: 'session-1', machineId: 'machine-1' },
        { scopeType: 'machine', sessionId: 'session-1' },
        { scopeType: 'session', sessionId: '' },
        { scopeType: 'session', sessionId: 'session-1', extra: true }
    ]) {
        terminalSocket.trigger('terminal:subscribe', payload)
        terminalSocket.trigger('terminal:list', payload)
    }

    expect(terminalSocket.joinedRooms.size).toBe(0)
    expect(lastEmit(cliSocket, 'terminal:list')).toBeUndefined()
})

it('does not forward list/keepalive when CLI room has stale or wrong-namespace socket ids', () => {
    const { terminalSocket, cliNamespace } = createHarness()
    const wrongNamespaceCli = new FakeSocket('wrong-cli')
    wrongNamespaceCli.data.namespace = 'other'
    cliNamespace.sockets.set(wrongNamespaceCli.id, wrongNamespaceCli)
    cliNamespace.adapter.rooms.set('session:session-1', new Set(['missing-cli', wrongNamespaceCli.id]))

    terminalSocket.trigger('terminal:list', { scopeType: 'session', sessionId: 'session-1' })
    terminalSocket.trigger('terminal:keepalive', { scopeType: 'session', sessionId: 'session-1', terminalId: 't1' })

    expect(lastEmit(wrongNamespaceCli, 'terminal:list')).toBeUndefined()
    expect(lastEmit(wrongNamespaceCli, 'terminal:keepalive')).toBeUndefined()
})

it('keeps session registry idle from killing CLI process while preserving machine legacy close', () => {
    // Use a fake timer or direct onIdle harness if needed.
    // Session entry: onIdle must not emit terminal:close.
    // Machine entry: onIdle still emits terminal:close to preserve legacy behavior.
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
cd hub && bun test src/socket/handlers/terminal.test.ts
```

Expected: FAIL because handlers/room helper are missing.

## Task 2: Implement web subscribe/list/keepalive routing

**Files:**
- Create: `hub/src/socket/terminalRooms.ts`
- Modify: `hub/src/socket/handlers/terminal.ts`

- [ ] **Step 1: Add room helper**

Create `hub/src/socket/terminalRooms.ts`:

```ts
import type { TerminalScopeTyped } from '@hapi/protocol'

export function terminalScopeRoom(namespace: string, scope: TerminalScopeTyped): string {
    const encodedNamespace = encodeURIComponent(namespace)
    return scope.scopeType === 'session'
        ? `terminal:${encodedNamespace}:session:${scope.sessionId}`
        : `terminal:${encodedNamespace}:machine:${scope.machineId}`
}
```

- [ ] **Step 2: Import typed schemas/helpers**

In `terminal.ts`, import:

```ts
import {
    TerminalKeepalivePayloadSchema,
    TerminalListRequestSchema,
    type TerminalKeepalivePayload,
    type TerminalListRequest,
    type TerminalScopeTyped,
    normalizeTerminalScope
} from '@hapi/protocol'
import { terminalScopeRoom } from '../terminalRooms'
```

- [ ] **Step 3: Add helpers inside `registerTerminalHandlers`**

Add:

```ts
const authorizeScope = (scope: TerminalScopeTyped): boolean => {
    if (!namespace) return false
    if (scope.scopeType === 'session') {
        const session = getSession(scope.sessionId)
        return Boolean(session && session.active && session.namespace === namespace)
    }
    const machine = getMachine(scope.machineId)
    return Boolean(machine && machine.active && machine.namespace === namespace)
}

const legacyScopeFromTyped = (scope: TerminalScopeTyped): { sessionId: string } | { machineId: string } => (
    scope.scopeType === 'session' ? { sessionId: scope.sessionId } : { machineId: scope.machineId }
)

const forwardToCli = (event: 'terminal:list' | 'terminal:keepalive', payload: TerminalListRequest | TerminalKeepalivePayload): void => {
    if (!authorizeScope(payload)) return
    const cliSocketId = pickCliSocketId(legacyScopeFromTyped(payload))
    if (!cliSocketId) return
    const cliSocket = cliNamespace.sockets.get(cliSocketId)
    if (!cliSocket || cliSocket.data.namespace !== namespace) return
    cliSocket.emit(event, payload)
}
```

- [ ] **Step 4: Add socket handlers**

Add before `terminal:create`:

```ts
socket.on('terminal:subscribe', (data: unknown) => {
    const parsed = TerminalListRequestSchema.safeParse(data)
    if (!parsed.success) return
    if (!authorizeScope(parsed.data)) return
    socket.join(terminalScopeRoom(namespace, parsed.data))
    forwardToCli('terminal:list', parsed.data)
})

socket.on('terminal:unsubscribe', (data: unknown) => {
    const parsed = TerminalListRequestSchema.safeParse(data)
    if (!parsed.success) return
    socket.leave(terminalScopeRoom(namespace, parsed.data))
})

socket.on('terminal:list', (data: unknown) => {
    const parsed = TerminalListRequestSchema.safeParse(data)
    if (!parsed.success) return
    forwardToCli('terminal:list', parsed.data)
})

socket.on('terminal:keepalive', (data: unknown) => {
    const parsed = TerminalKeepalivePayloadSchema.safeParse(data)
    if (!parsed.success) return
    forwardToCli('terminal:keepalive', parsed.data)
})
```

Do not add a `terminal:close-all` handler. Web `terminal:close-all` must stay unregistered and must not forward to CLI.

- [ ] **Step 5: Keep legacy create routing compatible**

In `terminal:create`, replace manual `scope` construction with:

```ts
const typedScope = normalizeTerminalScope(parsed.data)
const scope = typedScope ? legacyScopeFromTyped(typedScope) : null
```

Keep legacy emitted `terminal:open` payload unchanged for Story 1.3.

- [ ] **Step 6: Verify GREEN for web handler**

Run:

```bash
cd hub && bun test src/socket/handlers/terminal.test.ts
```

Expected: pass.

## Task 3: Add CLI list/warning room forwarding tests and implementation

**Files:**
- Modify: `hub/src/socket/handlers/cli/terminalHandlers.test.ts`
- Modify: `hub/src/socket/handlers/cli/terminalHandlers.ts`

- [ ] **Step 1: Extend fake namespace with room emitter**

In CLI terminal handler test, update `FakeNamespace`:

```ts
readonly sockets = new Map<string, FakeSocket>()
readonly roomEmits: EmittedEvent[] = []
to(room: string): { emit: (event: string, data: unknown) => boolean } {
    return {
        emit: (event, data) => {
            this.roomEmits.push({ event: `${room}:${event}`, data })
            return true
        }
    }
}
```

- [ ] **Step 2: Add RED tests**

Add tests:

```ts
it('forwards typed terminal list payloads to the exact session room', () => {
    const cliSocket = new FakeSocket('cli-socket')
    const terminalNamespace = new FakeNamespace()
    const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
    registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
        terminalRegistry,
        terminalNamespace: terminalNamespace as never,
        resolveSessionAccess: () => ({ ok: true, value: {} as StoredSession }),
        resolveMachineAccess: () => ({ ok: true, value: {} as never }),
        emitAccessError: () => { throw new Error('Unexpected access error') }
    })

    cliSocket.trigger('terminal:list', {
        scopeType: 'session',
        sessionId: 'session-1',
        terminals: []
    })

    expect(terminalNamespace.roomEmits).toEqual([{
        event: 'terminal:default:session:session-1:terminal:list',
        data: { scopeType: 'session', sessionId: 'session-1', terminals: [] }
    }])
})

it('forwards terminal warnings only to the exact machine room', () => {
    const cliSocket = new FakeSocket('cli-socket')
    const terminalNamespace = new FakeNamespace()
    const terminalRegistry = new TerminalRegistry({ idleTimeoutMs: 0 })
    registerTerminalHandlers(cliSocket as unknown as CliSocketWithData, {
        terminalRegistry,
        terminalNamespace: terminalNamespace as never,
        resolveSessionAccess: () => ({ ok: true, value: {} as StoredSession }),
        resolveMachineAccess: () => ({ ok: true, value: {} as never }),
        emitAccessError: () => { throw new Error('Unexpected access error') }
    })

    cliSocket.trigger('terminal:warning', {
        scopeType: 'machine',
        machineId: 'machine-1',
        terminalId: 'tm',
        reason: 'idle',
        message: 'idle',
        closesAt: 10
    })

    expect(terminalNamespace.roomEmits).toEqual([{
        event: 'terminal:default:machine:machine-1:terminal:warning',
        data: { scopeType: 'machine', machineId: 'machine-1', terminalId: 'tm', reason: 'idle', message: 'idle', closesAt: 10 }
    }])
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
cd hub && bun test src/socket/handlers/cli/terminalHandlers.test.ts
```

Expected: FAIL because list/warning forwarding missing.

- [ ] **Step 4: Implement CLI list/warning forwarding**

In `terminalHandlers.ts`, import:

```ts
    TerminalListPayloadSchema,
    TerminalWarningPayloadSchema
```

Import room helper:

```ts
import { terminalScopeRoom } from '../../terminalRooms'
```

Add handlers:

```ts
const authorizeTypedScope = (scope: TerminalScopeTyped): boolean => {
    if (scope.scopeType === 'session') {
        const access = resolveSessionAccess(scope.sessionId)
        if (!access.ok) {
            emitAccessError('session', scope.sessionId, access.reason)
            return false
        }
        return true
    }
    const access = resolveMachineAccess(scope.machineId)
    if (!access.ok) {
        emitAccessError('machine', scope.machineId, access.reason)
        return false
    }
    return true
}

socket.on('terminal:list', (data: unknown) => {
    const parsed = TerminalListPayloadSchema.safeParse(data)
    if (!parsed.success) return
    if (!authorizeTypedScope(parsed.data)) return
    terminalNamespace.to(terminalScopeRoom(namespace, parsed.data)).emit('terminal:list', parsed.data)
})

socket.on('terminal:warning', (data: unknown) => {
    const parsed = TerminalWarningPayloadSchema.safeParse(data)
    if (!parsed.success) return
    if (!authorizeTypedScope(parsed.data)) return
    terminalNamespace.to(terminalScopeRoom(namespace, parsed.data)).emit('terminal:warning', parsed.data)
})
```

Do not use terminal registry for list/warning room forwarding. Authorize with `resolveSessionAccess` / `resolveMachineAccess` before room emit; denied scopes call `emitAccessError` and emit nothing.

- [ ] **Step 4b: Forward CLI ready/output/exit/error to exact rooms too**

Keep existing attached-socket emit for backward compatibility. Also emit valid and authorized terminal stream events to `terminalScopeRoom(normalizeTerminalScope(parsed.data))`. Tests must prove:

```ts
it('forwards terminal output to exact room after access check and keeps legacy attached socket emit', () => {
    // Register terminal in registry, trigger CLI terminal:output.
    // Expect attached terminal socket receives legacy output.
    // Expect terminalNamespace.to('terminal:default:session:session-1').emit('terminal:output', payload).
    // Expect no machine room emit.
})

it('does not emit terminal output room when access denied', () => {
    // resolveSessionAccess returns { ok: false, reason: 'access-denied' }.
    // Expect emitAccessError called and no room emit.
})
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
cd hub && bun test src/socket/handlers/terminal.test.ts src/socket/handlers/cli/terminalHandlers.test.ts
bun run typecheck
```

Expected: pass.

## Self-Review Checklist

- Web close-all remains unhandled.
- Scope auth checks namespace and active status; room names include encoded namespace to prevent same-id cross-namespace leak.
- Subscribe/list/keepalive use typed scope.
- CLI list/warning forwards to exact room only.
- Legacy create/write/resize/close still works.
- Terminal registry remains attach routing only; not lifecycle source of truth. Hub server `TerminalRegistry.onIdle` must not send destructive `terminal:close` for session entries; machine entries keep legacy behavior in this wave.
