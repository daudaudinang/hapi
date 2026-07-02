# Session-Scoped Terminal Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HAPI session terminals shared across agent modal and editor mode, keep them alive across browser close/reload, and only close them by explicit user action, session archive, idle timeout, or 24-hour hard cap.

**Architecture:** Move session terminal lifecycle ownership from React component mount/unmount to the CLI-side `TerminalManager`. The CLI is the source of truth for session terminal list/limits/timers/output replay; the hub is the authenticated Socket.IO routing/control plane using scope rooms; React views are attach/detach clients. The web modal and editor panel use one reusable session-terminal tabs component; route/browser/modal detach must not kill terminals. Session archive uses an internal hub→CLI cleanup path, not a web-callable destructive event. Machine/project terminals remain legacy behavior in this wave.

**Tech Stack:** Bun, TypeScript, React 19, Socket.IO, xterm.js, Vitest/Bun tests, HAPI shared protocol package `@hapi/protocol`.

**Lifecycle Contract:**
- `detach`: UI socket/view goes away. No process kill. Used by modal close, route switch, browser close/reload, editor tab switch.
- `close-one`: explicit user action on one terminal tab. Kills that terminal only after confirm and frees one slot.
- `close-all-internal`: archive-only internal hub→CLI action. Browser/web socket cannot call it.
- Session terminal state values: `running`, `detached`, `warning_idle`, `warning_age`, `closed_idle`, `closed_age`, `closed_user`, `closed_archive`, `exited`, `lost`.
- Close reasons: `user_close`, `idle_timeout`, `hard_timeout`, `archive`, `process_exit`, `cli_lost`, `spawn_error`.
- Idle = no user input and no terminal output. Socket heartbeat does not reset idle. `terminal:keepalive` is explicit user activity and resets idle, but never resets hard lifetime.
- CLI crash/restart policy: session terminal processes are not durable across CLI process death. On reconnect/list, missing CLI-owned terminals become `lost`; UI shows reason and lets user create a new terminal. CLI startup must not pretend old terminals still exist.
- Max count: only live states (`running`, `detached`, `warning_idle`, `warning_age`) count toward 3/session. Closed/lost/exited terminals do not count after cleanup.

---

## Risk / Impact Review

### User-visible behavior changes
- Closing browser no longer closes session terminal processes.
- Closing agent terminal modal no longer closes terminal processes unless user clicks terminal tab close/stop.
- Agent modal gains multi-terminal tabs like editor terminal pane.
- Terminal idle/age warnings become visible in terminal UI.
- Session archive closes all terminals for that session.

### Data/resource risks
- **High:** orphan shell processes if archive cleanup or hard cap fails. Mitigation: CLI owns a 24-hour hard lifetime timer, archive invokes an internal close-all, and cleanup clears every timer + kills the subprocess.
- **High:** session max-count can be bypassed if only hub registry counts attached sockets. Mitigation: enforce max 3 in CLI `TerminalManager` as source of truth; hub may preflight but must not be authoritative.
- **Medium:** long-running foreground jobs may be killed after 24 hours by design. Mitigation: send an age warning before the hard cap and use clear UI copy.
- **Medium:** terminal output buffers may contain secrets and live in memory up to 24 hours. Mitigation: keep `MAX_OUTPUT_BUFFER_CHARS = 200_000`, never persist/log output, clear buffer on close, and do not include output in terminal list/state.
- **High:** multi-browser create races can exceed max 3. Mitigation: atomic check-and-create in CLI; hub preflight is advisory only; concurrent create test required.
- **High:** child processes can survive shell kill. Mitigation: kill process group, SIGTERM first, SIGKILL after grace timeout, log non-sensitive reason.
- **Medium:** multiple browser tabs controlling same terminal can race. Mitigation: scope rooms, idempotent close, deterministic attached-client handling, and race tests.
- **Medium:** old detach timeout (5 minutes) conflicts with session-lifetime terminals. Mitigation: disable detached cleanup for session-scoped terminals; idle and hard lifetime timers become the only automatic close paths.
- **Medium:** machine/project terminals could regress. Mitigation: session-only shared component path; machine terminal tests remain unchanged and must pass.
- **Medium:** CLI restart loses terminal state. Mitigation: declare terminals `lost`, do not fake persistence, and show recovery UX.

### Security/privacy risks
- Terminal output may contain secrets. Do not store raw terminal output outside CLI memory. Do not log terminal data in hub/web. Clear output buffer on close and never include output in list/state payloads.
- CORS/auth remains unchanged; all terminal list/control events must require existing terminal namespace JWT and namespace checks.
- Destructive close-all must not be exposed as a web terminal event. Only session archive/internal hub code may request close-all for a session.
- All terminal list/create/attach/close-one/keepalive calls must authorize that the socket namespace owns the target session/machine. Web cannot spoof `sessionId`.
- `terminal:list`, `terminal:warning`, output, and close events must route through Socket.IO rooms keyed by exact scope: `terminal:session:${sessionId}` and `terminal:machine:${machineId}`. Never use mutable scope-room subscription; never broadcast all session terminal metadata to every web socket in the namespace.

### Rollback plan
- Revert this feature branch/code changes.
- If terminals are leaked in production, restart active session CLI processes or run session archive; `TerminalManager.closeAll()` kills held terminals when CLI shuts down.
- If only web rollout fails, keep CLI/hub safe defaults: max 3/session, idle close, hard lifetime close.
- Deploy hub + CLI + web from the same build. Do not mix old web with new hub/CLI for this feature because protocol events change.
- Keep feature unflagged only after tests prove browser detach is non-destructive and archive is destructive.

### Acceptance criteria
- **AC-SHARED-001:** Agent modal and editor session terminal view show the same session terminal list/count (`0/3`, `1/3`, `2/3`, `3/3`).
- **AC-DETACH-001:** Browser close/reload/route change/modal close/editor tab switch detaches only; no `terminal:close` reaches CLI.
- **AC-CLOSE-001:** User close button kills exactly one terminal after confirm and frees one slot.
- **AC-RACE-001:** 4+ concurrent create requests across 2 sockets produce at most 3 live terminals/session.
- **AC-SCOPE-001:** Session A never receives output/list/warning/close state for Session B.
- **AC-SCOPE-002:** Machine/project terminals keep current behavior and are not included in session terminal list/count/archive cleanup.
- **AC-SEC-001:** Browser/web socket cannot invoke close-all; only internal archive path can.
- **AC-TIMER-001:** Fake clock proves 2h idle warning once, 4h idle kill, 24h hard kill, and keepalive resets idle but not hard lifetime.
- **AC-REPLAY-001:** Reconnect gets bounded replay for the same terminal only, with truncation marker and no cross-session output.
- **AC-ARCHIVE-001:** Archive closes all session terminals through internal hub/CLI path and rejects new terminal create for archived sessions.
- **AC-LOST-001:** CLI crash/restart marks prior session terminals as `lost` in UI, not silently running.
- **AC-OPS-001:** Process cleanup kills shell and child process group with SIGTERM→SIGKILL escalation; no orphan process remains in manual verification.
- **AC-UX-001:** Idle/age warning remains visible after user returns; closed terminals show close reason and CTA to create a new terminal.
- **AC-MANUAL-001:** Manual `sleep 60`: close modal/browser, reopen, process remains alive until explicit close/archive/timeout.

---

## File Map

| File | Role | Change |
|---|---|---|
| `shared/src/socket.ts` | Socket.IO terminal contract | Add scope, terminal state, close reason, list/state/warning/keepalive/internal close-all payload schemas. |
| `cli/src/terminal/TerminalManager.ts` | Owns real shell processes | Add metadata, state machine, close reasons, atomic max 3, list, keepalive, periodic sweep, idle/hard timers, process-group cleanup. |
| `cli/src/terminal/TerminalManager.test.ts` | CLI lifecycle tests | Cover warning, idle close, age close, list, explicit close. |
| `cli/src/api/apiSession.ts` | Session CLI socket bridge | Handle terminal list/close-all events and emit state/warning. |
| `cli/src/api/apiMachine.ts` | Machine CLI socket bridge | Keep machine terminal path compatible; optionally handle list events as no-op or machine scope only. |
| `hub/src/socket/terminalRegistry.ts` | Attached web socket routing registry | Track attached socket→terminal routing only. Do not use it as terminal source of truth after detach. Add room-safe cleanup helpers only. |
| `hub/src/socket/handlers/terminal.ts` | Web terminal namespace handlers | Add scope-room subscribe/list/create/keepalive/explicit close-one; detach on disconnect only; preflight max 3 but rely on CLI. Do not expose close-all to web. |
| `hub/src/socket/handlers/cli/terminalHandlers.ts` | CLI-to-web terminal forwarding | Forward terminal state/warning/list/output/close events to exact scope rooms. |
| `hub/src/socket/server.ts` | Wiring | Set preflight max terminals to 3 and expose an internal session-terminal cleanup function to archive path if needed. |
| `hub/src/sync/syncEngine.ts` | Session archive lifecycle | Before `killSession`, call internal close-all for archived session; do not depend on a web socket event. |
| `hub/src/socket/handlers/terminal.test.ts` | Hub terminal handler tests | Cover detach, max 3 preflight, list, and prove web cannot call close-all. |
| `web/src/hooks/useTerminalSocket.ts` | Web terminal socket hook | Add list, create, attach, close, warning events; no destructive close on unmount by default. |
| `web/src/components/Terminal/SessionTerminalTabs.tsx` | New shared UI component | Multi-tab session terminal UI with lifecycle hint, warning banners, closed/lost state, max 3 UX, and explicit close-one confirm. |
| `web/src/components/modals/TerminalModal.tsx` | Agent modal | Replace single terminal with shared tabs component. |
| `web/src/components/editor/EditorTerminal.tsx` | Editor terminal pane | Use shared component for session-scoped tabs; keep machine-scoped terminals if not in session mode. |
| `web/src/components/editor/EditorLayout.tsx` | Editor page lifecycle | Remove pagehide destructive close for session terminals; keep project cleanup non-destructive unless explicit close. |
| `web/src/routes/sessions/terminal.tsx` | Legacy terminal route | Wrap with shared `SessionTerminalTabs`; unmount detaches only. |
| `web/src/lib/locales/en.ts`, `vi-VN.ts`, `zh-CN.ts` | UI strings | Add warning/limit/age text. |
| Tests under `web/src/**` | Web regression tests | Cover modal multi-tab, browser pagehide no kill, warning banner, max 3 error. |

---

## Implementation Tasks

### Task 1: Extend shared terminal protocol

**Files:**
- Modify: `shared/src/socket.ts`
- Test: `shared/src/socket.test.ts` (create if absent)

- [ ] **Step 1: Add schemas for terminal metadata and lifecycle events**

Add below existing terminal payload schemas, then migrate terminal list/warning/keepalive/state/close reason events to typed scope. For existing `terminal:open/write/resize/close`, either update schemas to typed scope in the same task or add a single normalization helper that accepts legacy `{ sessionId } | { machineId }` and returns typed scope; do not leave mixed scope handling scattered across files.

```ts
export const TerminalScopeTypedSchema = z.discriminatedUnion('scopeType', [
    z.object({ scopeType: z.literal('session'), sessionId: z.string().min(1) }),
    z.object({ scopeType: z.literal('machine'), machineId: z.string().min(1) })
])
export type TerminalScopeTyped = z.infer<typeof TerminalScopeTypedSchema>

export const TerminalCloseReasonSchema = z.enum([
    'user_close',
    'idle_timeout',
    'hard_timeout',
    'archive',
    'process_exit',
    'cli_lost',
    'spawn_error'
])
export type TerminalCloseReason = z.infer<typeof TerminalCloseReasonSchema>

export const TerminalStateValueSchema = z.enum([
    'running',
    'detached',
    'warning_idle',
    'warning_age',
    'closed_idle',
    'closed_age',
    'closed_user',
    'closed_archive',
    'exited',
    'lost'
])
export type TerminalStateValue = z.infer<typeof TerminalStateValueSchema>

export const TerminalStateSchema = TerminalScopeTypedSchema.and(z.object({
    terminalId: z.string().min(1),
    label: z.string().min(1),
    cwd: z.string().min(1).optional(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
    status: TerminalStateValueSchema,
    closeReason: TerminalCloseReasonSchema.nullable(),
    createdAt: z.number().int().positive(),
    lastActivityAt: z.number().int().positive(),
    idleWarningAt: z.number().int().positive().nullable(),
    hardExpiresAt: z.number().int().positive()
}))
export type TerminalState = z.infer<typeof TerminalStateSchema>

export const TerminalListRequestSchema = TerminalScopeTypedSchema
export type TerminalListRequest = z.infer<typeof TerminalListRequestSchema>

export const TerminalListPayloadSchema = TerminalScopeTypedSchema.and(z.object({
    terminals: z.array(TerminalStateSchema)
}))
export type TerminalListPayload = z.infer<typeof TerminalListPayloadSchema>

export const TerminalWarningPayloadSchema = TerminalScopeTypedSchema.and(z.object({
    terminalId: z.string().min(1),
    reason: z.enum(['idle', 'age']),
    message: z.string().min(1),
    closesAt: z.number().int().positive()
}))
export type TerminalWarningPayload = z.infer<typeof TerminalWarningPayloadSchema>

export const TerminalKeepalivePayloadSchema = TerminalScopeTypedSchema.and(z.object({
    terminalId: z.string().min(1)
}))
export type TerminalKeepalivePayload = z.infer<typeof TerminalKeepalivePayloadSchema>

// Internal hub→CLI only. Browser/web socket handlers must not accept this event.
export const TerminalCloseAllPayloadSchema = z.object({
    scopeType: z.literal('session'),
    sessionId: z.string().min(1)
})
export type TerminalCloseAllPayload = z.infer<typeof TerminalCloseAllPayloadSchema>
```

- [ ] **Step 2: Add schema tests**

Create `shared/src/socket.test.ts` if missing, or append:

```ts
import { describe, expect, it } from 'bun:test'
import {
    TerminalListPayloadSchema,
    TerminalWarningPayloadSchema,
    TerminalCloseAllPayloadSchema
} from './socket'

describe('terminal socket schemas', () => {
    it('accepts session terminal list payloads', () => {
        const result = TerminalListPayloadSchema.safeParse({
            scopeType: 'session',
            sessionId: 'session-1',
            terminals: [{
                scopeType: 'session',
                sessionId: 'session-1',
                terminalId: 'terminal-1',
                label: 'Terminal 1',
                cols: 80,
                rows: 24,
                status: 'running',
                closeReason: null,
                createdAt: 1,
                lastActivityAt: 1,
                idleWarningAt: null,
                hardExpiresAt: 86_401
            }]
        })
        expect(result.success).toBe(true)
    })

    it('accepts terminal warning payloads', () => {
        expect(TerminalWarningPayloadSchema.safeParse({
            scopeType: 'session',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            reason: 'idle',
            message: 'Terminal has been idle.',
            closesAt: 10
        }).success).toBe(true)
    })

    it('requires a session id for close-all', () => {
        expect(TerminalCloseAllPayloadSchema.safeParse({ scopeType: 'session', sessionId: 'session-1' }).success).toBe(true)
        expect(TerminalCloseAllPayloadSchema.safeParse({ scopeType: 'machine', machineId: 'machine-1' }).success).toBe(false)
    })
})
```

- [ ] **Step 3: Run shared tests**

Run: `bun test shared/src/socket.test.ts`

Expected: PASS.

---

### Task 2: Make CLI `TerminalManager` own durable session terminal lifecycle

**Files:**
- Modify: `cli/src/terminal/TerminalManager.ts`
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add failing tests for policy**

Append tests covering:

```ts
it('emits idle warning before idle cleanup', async () => {
    installFakeSpawn()
    const warnings: string[] = []
    const errors: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: (payload) => errors.push(payload.message),
        onWarning: (payload) => warnings.push(payload.reason),
        idleWarningMs: 50,
        idleTimeoutMs: 150,
        hardLifetimeMs: 1000
    })

    manager.create('terminal-1', 80, 24)
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(warnings).toEqual(['idle'])
    await new Promise((resolve) => setTimeout(resolve, 120))
    manager.write('terminal-1', 'echo gone\n')
    expect(errors).toContain('Terminal not found.')
})

it('resets idle timers on output activity', async () => {
    const fakeSpawn = installFakeSpawn()
    const warnings: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        onWarning: (payload) => warnings.push(payload.reason),
        idleWarningMs: 100,
        idleTimeoutMs: 300,
        hardLifetimeMs: 1000
    })

    manager.create('terminal-1', 80, 24)
    await new Promise((resolve) => setTimeout(resolve, 60))
    fakeSpawn.emitData('still active\n')
    await new Promise((resolve) => setTimeout(resolve, 70))
    expect(warnings).toEqual([])
})

it('closes terminals after hard lifetime even with activity', async () => {
    const fakeSpawn = installFakeSpawn()
    const errors: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: (payload) => errors.push(payload.message),
        idleTimeoutMs: 0,
        hardLifetimeMs: 80
    })

    manager.create('terminal-1', 80, 24)
    fakeSpawn.emitData('activity\n')
    await new Promise((resolve) => setTimeout(resolve, 120))
    manager.write('terminal-1', 'echo gone\n')
    expect(errors).toContain('Terminal not found.')
})

it('lists current terminal state without output data', () => {
    installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 0,
        hardLifetimeMs: 1000
    })

    manager.create('terminal-1', 80, 24)
    expect(manager.list().map((item) => item.terminalId)).toEqual(['terminal-1'])
    expect(JSON.stringify(manager.list())).not.toContain('outputBuffer')
})
```

Expected first run: FAIL because `onWarning`, `idleWarningMs`, `hardLifetimeMs`, and `list()` do not exist yet.

- [ ] **Step 2: Implement lifecycle fields and defaults**

Add defaults:

```ts
const DEFAULT_IDLE_WARNING_MS = 2 * 60 * 60_000
const DEFAULT_IDLE_TIMEOUT_MS = 4 * 60 * 60_000
const DEFAULT_HARD_LIFETIME_MS = 24 * 60 * 60_000
const DEFAULT_AGE_WARNING_BEFORE_MS = 30 * 60_000
const DEFAULT_SWEEP_INTERVAL_MS = 30_000
const DEFAULT_KILL_GRACE_MS = 5_000
const DEFAULT_MAX_TERMINALS = 3
```

Extend `TerminalRuntime`:

```ts
type TerminalRuntime = TerminalSession & {
    proc: Bun.Subprocess
    terminal: Bun.Terminal
    idleWarningTimer: ReturnType<typeof setTimeout> | null
    idleTimer: ReturnType<typeof setTimeout> | null
    hardLifetimeTimer: ReturnType<typeof setTimeout> | null
    sweepTimer: ReturnType<typeof setInterval> | null
    detachedTimer: ReturnType<typeof setTimeout> | null
    outputBuffer: string
    label: string
    cwd: string
    createdAt: number
    lastActivityAt: number
    idleWarningAt: number | null
    hardExpiresAt: number
    status: 'running' | 'detached' | 'exited'
}
```

Extend options:

```ts
onWarning?: (payload: TerminalWarningPayload) => void
idleWarningMs?: number
hardLifetimeMs?: number
ageWarningBeforeMs?: number
sweepIntervalMs?: number
killGraceMs?: number
now?: () => number
detachedTimeoutMs?: number // session terminals must default to 0/disabled; machine terminals can keep legacy behavior if needed
```

- [ ] **Step 3: Implement timestamp-based timers plus periodic sweep**

Implement:

```ts
private scheduleIdleTimer(runtime: TerminalRuntime): void {
    if (runtime.idleWarningTimer) clearTimeout(runtime.idleWarningTimer)
    if (runtime.idleTimer) clearTimeout(runtime.idleTimer)
    this.clearDetachedTimer(runtime)
    runtime.lastActivityAt = Date.now()
    runtime.idleWarningAt = null

    if (this.idleWarningMs > 0 && this.idleTimeoutMs > this.idleWarningMs) {
        runtime.idleWarningTimer = setTimeout(() => {
            const current = this.terminals.get(runtime.terminalId)
            if (!current) return
            current.idleWarningAt = Date.now()
            this.onWarning?.({
                ...this.scopePayload(),
                terminalId: current.terminalId,
                reason: 'idle',
                message: 'Terminal has been idle and will close if no input or output occurs.',
                closesAt: current.lastActivityAt + this.idleTimeoutMs
            })
        }, this.idleWarningMs)
    }

    if (this.idleTimeoutMs > 0) {
        runtime.idleTimer = setTimeout(() => {
            this.emitError(runtime.terminalId, 'Terminal closed due to inactivity.')
            this.cleanup(runtime.terminalId)
        }, this.idleTimeoutMs)
    }
}
```

Add age warning and hard lifetime timers at create:

```ts
if (this.hardLifetimeMs > 0 && this.ageWarningBeforeMs > 0 && this.hardLifetimeMs > this.ageWarningBeforeMs) {
    setTimeout(() => {
        const current = this.terminals.get(terminalId)
        if (!current) return
        this.onWarning?.({
            ...this.scopePayload(),
            terminalId,
            reason: 'age',
            message: 'Terminal will close automatically after 24 hours.',
            closesAt: current.hardExpiresAt
        })
    }, this.hardLifetimeMs - this.ageWarningBeforeMs)
}
runtime.hardLifetimeTimer = setTimeout(() => {
    this.emitError(terminalId, 'Terminal closed after 24 hours.')
    this.cleanup(terminalId)
}, this.hardLifetimeMs)
```

Cleanup must clear `idleWarningTimer`, `idleTimer`, `hardLifetimeTimer`, `sweepTimer`, `detachedTimer`, and `outputBuffer` before returning.

Do not rely only on `setTimeout`. Add `sweepTerminals()` that compares `now() - lastActivityAt` and `now() - createdAt` so machine sleep/event-loop pause still enforces idle/hard limits on the next tick or activity. Tests should inject `now()` or fake timers; avoid 1ms sleeps.

- [ ] **Step 4: Implement list/closeAll**

Add:

```ts
list(): TerminalState[] {
    return Array.from(this.terminals.values()).map((runtime) => ({
        ...this.scopePayload(),
        terminalId: runtime.terminalId,
        label: runtime.label,
        cwd: runtime.cwd,
        cols: runtime.cols,
        rows: runtime.rows,
        status: runtime.status,
        createdAt: runtime.createdAt,
        lastActivityAt: runtime.lastActivityAt,
        idleWarningAt: runtime.idleWarningAt,
        hardExpiresAt: runtime.hardExpiresAt
    }))
}

closeAll(): void {
    for (const terminalId of Array.from(this.terminals.keys())) {
        this.cleanup(terminalId)
    }
}
```

- [ ] **Step 5: Disable detached cleanup for session terminals**

Session-scoped terminals must not use the legacy 5-minute detach cleanup. Set session `detachedTimeoutMs` default to `0`, keep machine/project terminal behavior unchanged unless explicitly configured.

Add regression test:

```ts
it('does not close session terminals after detach when detached cleanup is disabled', async () => {
    installFakeSpawn()
    const errors: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: (payload) => errors.push(payload.message),
        idleTimeoutMs: 0,
        detachedTimeoutMs: 0,
        hardLifetimeMs: 1000
    })

    manager.create('terminal-1', 80, 24)
    manager.detach('terminal-1')
    await new Promise((resolve) => setTimeout(resolve, 80))
    manager.write('terminal-1', 'echo still alive\n')
    expect(errors).toEqual([])
})
```

- [ ] **Step 6: Enforce max 3 in CLI**

Add test that creates `terminal-1`, `terminal-2`, `terminal-3`, then rejects `terminal-4` with stable code `TERMINAL_LIMIT_REACHED` / message `Too many terminals open (max 3).` even if no hub registry entries exist. Add concurrent create test using `Promise.all`/synchronous burst; assert Bun.spawn called only 3 times. Add close reason tests for `user_close`, `idle_timeout`, `hard_timeout`, `archive`, `process_exit`, `cli_lost`. Add `closeAllForSession` idempotence test.

- [ ] **Step 7: Implement process-group cleanup**

When closing a terminal, kill shell and child process group. Preferred behavior:

```ts
private cleanup(terminalId: string, reason: TerminalCloseReason): void {
    const runtime = this.terminals.get(terminalId)
    if (!runtime) return
    this.terminals.delete(terminalId)
    this.clearAllTimers(runtime)
    runtime.outputBuffer = ''
    try { runtime.proc.kill('SIGTERM') } catch {}
    setTimeout(() => {
        if (!runtime.proc.killed && runtime.proc.exitCode === null) {
            try { runtime.proc.kill('SIGKILL') } catch {}
        }
    }, this.killGraceMs)
    try { runtime.terminal.close() } catch {}
    this.emitLifecycle('terminal_closed', { terminalId, reason })
}
```

Test with fake subprocess that ignores SIGTERM and requires SIGKILL.

- [ ] **Step 8: Run CLI terminal tests**

Run: `bun test cli/src/terminal/TerminalManager.test.ts`

Expected: PASS.

---

### Task 3: Add hub terminal list/control plane and safe archive cleanup

**Files:**
- Modify: `hub/src/socket/handlers/terminal.ts`
- Modify: `hub/src/socket/handlers/cli/terminalHandlers.ts`
- Modify: `hub/src/sync/syncEngine.ts`
- Modify: `hub/src/socket/handlers/terminal.test.ts`

- [ ] **Step 1: Add failing hub tests**

Add tests:

```ts
it('enforces max 3 session terminals', () => {
    const { terminalSocket, cliNamespace } = createHarness({ maxTerminalsPerSession: 3 })
    const cliSocket = new FakeSocket('cli-socket-1')
    connectCliSocket(cliNamespace, cliSocket, 'session-1')

    for (const terminalId of ['t1', 't2', 't3', 't4']) {
        terminalSocket.trigger('terminal:create', { sessionId: 'session-1', terminalId, cols: 80, rows: 24 })
    }

    expect(lastEmit(terminalSocket, 'terminal:error')?.data).toEqual({
        terminalId: 't4',
        message: 'Too many terminals open for this session (max 3).'
    })
})

it('requests terminal list from CLI for a session', () => {
    const { terminalSocket, cliNamespace } = createHarness()
    const cliSocket = new FakeSocket('cli-socket-1')
    connectCliSocket(cliNamespace, cliSocket, 'session-1')

    terminalSocket.trigger('terminal:list', { sessionId: 'session-1' })

    expect(lastEmit(cliSocket, 'terminal:list')?.data).toEqual({ sessionId: 'session-1' })
})

it('does not expose close-all as a web terminal event', () => {
    const { terminalSocket, cliNamespace } = createHarness()
    const cliSocket = new FakeSocket('cli-socket-1')
    connectCliSocket(cliNamespace, cliSocket, 'session-1')

    terminalSocket.trigger('terminal:close-all', { scopeType: 'session', sessionId: 'session-1' })

    expect(lastEmit(cliSocket, 'terminal:close-all')).toBeUndefined()
})
```

- [ ] **Step 2: Implement web `terminal:list` and internal close-all helper**

In `hub/src/socket/handlers/terminal.ts`, import schemas and add:

```ts
socket.on('terminal:list', (data: unknown) => {
    const parsed = TerminalListRequestSchema.safeParse(data)
    if (!parsed.success) return
    const { sessionId, machineId } = parsed.data
    const scope = sessionId ? { sessionId } : machineId ? { machineId } : null
    if (!scope) return
    const cliSocketId = pickCliSocketId(scope)
    if (!cliSocketId) {
        socket.emit('terminal:list', { ...scope, terminals: [] })
        return
    }
    cliNamespace.sockets.get(cliSocketId)?.emit('terminal:list', scope)
})

// Do not add a web-callable terminal:close-all handler here.
// Close-all belongs to internal archive cleanup only.
```

Add an internal helper outside the web socket handler, e.g. in `hub/src/socket/sessionTerminalControl.ts`:

```ts
export function closeAllSessionTerminals(input: {
    io: SocketServer
    terminalRegistry: TerminalRegistry
    namespace: string
    sessionId: string
}): void {
    const cliNamespace = input.io.of('/cli')
    const room = cliNamespace.adapter.rooms.get(`session:${input.sessionId}`)
    input.terminalRegistry.removeBySession(input.sessionId)
    if (!room) return
    for (const socketId of room) {
        const cliSocket = cliNamespace.sockets.get(socketId)
        if (cliSocket?.data.namespace === input.namespace) {
            cliSocket.emit('terminal:close-all', { scopeType: 'session', sessionId: input.sessionId })
        }
    }
}
```

Add `removeBySession(sessionId)` to `TerminalRegistry` for attached routing cleanup only.

- [ ] **Step 3: Forward CLI list/warning/state to exact scope rooms**

Do not store mutable scope-room subscription on socket data. On web `terminal:subscribe`, authorize the scope and join exactly one or more rooms:

```ts
function terminalScopeRoom(scope: TerminalScopeTyped): string {
    return scope.scopeType === 'session'
        ? `terminal:session:${scope.sessionId}`
        : `terminal:machine:${scope.machineId}`
}

socket.on('terminal:subscribe', (data: unknown) => {
    const parsed = TerminalListRequestSchema.safeParse(data)
    if (!parsed.success) return
    if (!authorizeScope(socket, parsed.data)) return
    socket.join(terminalScopeRoom(parsed.data))
    forwardListRequestToCli(parsed.data)
})

socket.on('terminal:unsubscribe', (data: unknown) => {
    const parsed = TerminalListRequestSchema.safeParse(data)
    if (!parsed.success) return
    socket.leave(terminalScopeRoom(parsed.data))
})
```

In `hub/src/socket/handlers/cli/terminalHandlers.ts`, parse and forward to the room:

```ts
socket.on('terminal:list', (data: unknown) => {
    const parsed = TerminalListPayloadSchema.safeParse(data)
    if (!parsed.success) return
    terminalNamespace.to(terminalScopeRoom(parsed.data)).emit('terminal:list', parsed.data)
})

socket.on('terminal:warning', (data: unknown) => {
    const parsed = TerminalWarningPayloadSchema.safeParse(data)
    if (!parsed.success) return
    terminalNamespace.to(terminalScopeRoom(parsed.data)).emit('terminal:warning', parsed.data)
})
```

Add tests proving Session A socket never receives Session B list/warning/output and machine sockets never receive session events.

- [ ] **Step 4: Archive closes session terminals**

Add a concrete internal cleanup dependency to `SyncEngine`, e.g. constructor option `closeAllSessionTerminals?: (sessionId: string, namespace: string) => void`. Wire it from `hub/src/index.ts` using the socket server and `TerminalRegistry`. Do not route this through web `terminal:close-all`.

Target behavior in `archiveSession(sessionId)`: get session first; if missing return; mark/handle session inactive so new terminal creates are rejected; call internal close-all best-effort; then kill session. If CLI offline, session is still archived and future list returns empty/lost, not running. Add tests for archive while terminal create is in-flight.

```ts
async archiveSession(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId)
    if (!session) return
    try {
        this.closeAllSessionTerminals?.(sessionId, session.namespace)
    } catch {}
    try {
        await this.rpcGateway.killSession(sessionId)
    } catch {}
    this.handleSessionEnd({ sid: sessionId, time: Date.now(), reason: 'terminated' })
}
```

- [ ] **Step 5: Run hub tests**

Run: `bun test hub/src/socket/handlers/terminal.test.ts hub/src/socket/handlers/cli/terminalHandlers.test.ts`

Expected: PASS.

---

### Task 4: Wire CLI session API events, keepalive, and close reasons

**Files:**
- Modify: `cli/src/api/apiSession.ts`
- Modify: `cli/src/api/apiMachine.ts` only if protocol imports need compatibility
- Test: `cli/src/api/apiSession.test.ts`

- [ ] **Step 1: Add handlers**

In `apiSession.ts`:

```ts
this.socket.on('terminal:list', handleTerminalEvent(TerminalListRequestSchema, () => {
    this.socket.emit('terminal:list', {
        scopeType: 'session',
        sessionId: this.sessionId,
        terminals: this.terminalManager.list()
    })
}))

this.socket.on('terminal:close-all', handleTerminalEvent(TerminalCloseAllPayloadSchema, () => {
    this.terminalManager.closeAll()
    this.socket.emit('terminal:list', {
        scopeType: 'session',
        sessionId: this.sessionId,
        terminals: []
    })
}))
```

When creating `TerminalManager`, pass:

```ts
onWarning: (payload) => this.socket.emit('terminal:warning', payload)
```

- [ ] **Step 2: Add API session tests**

Mock `TerminalManager` and assert:
- receiving `terminal:list` emits current list.
- receiving `terminal:close-all` calls `closeAll()`.
- `terminal:keepalive` calls `terminalManager.keepalive(terminalId)` and resets idle only.
- explicit one-terminal close uses reason `user_close`.
- `onWarning` emits `terminal:warning`.
- creating four terminals emits the max-3 error from CLI even if hub preflight is absent.
- list payload contains no terminal output text.

- [ ] **Step 3: Run CLI API tests**

Run: `bun test cli/src/api/apiSession.test.ts cli/src/api/apiMachine.test.ts`

Expected: PASS.

---

### Task 5: Create shared web session terminal tabs UI

**Files:**
- Create: `web/src/components/Terminal/SessionTerminalTabs.tsx`
- Modify: `web/src/hooks/useTerminalSocket.ts`
- Test: `web/src/components/Terminal/SessionTerminalTabs.test.tsx`

- [ ] **Step 1: Extend `useTerminalSocket` API**

Add state:

```ts
type TerminalMeta = {
    terminalId: string
    label: string
    cwd?: string
    cols: number
    rows: number
    status: 'running' | 'detached' | 'exited'
    createdAt: number
    lastActivityAt: number
    idleWarningAt: number | null
    hardExpiresAt: number
    warning?: { reason: 'idle' | 'age'; message: string; closesAt: number }
}
```

Expose:

```ts
terminals: TerminalMeta[]
listTerminals: () => void
createTerminal: (cols: number, rows: number, cwd?: string) => void
closeTerminal: (terminalId: string) => void
keepaliveTerminal: (terminalId: string) => void
```

Do not expose `closeAllTerminals` in web hook. Close-all is internal archive-only.

Important: keep existing `close()` for explicit destructive close, but make UI unmount call `disconnect()` unless user clicked close.

- [ ] **Step 2: Build `SessionTerminalTabs`**

Component props:

```ts
type SessionTerminalTabsProps = {
    sessionId: string
    compact?: boolean
    onAddToChat?: (text: string) => void
}
```

Behavior:
- On mount: connect socket, emit `terminal:list`; attach to CLI-owned terminal IDs returned by the list.
- If list empty: create first terminal on first resize/mount; generated terminal IDs must remain stable in CLI list after browser reload.
- `+` creates terminal only if current count < 3; still handle CLI max-limit error as source of truth.
- `x` means close-one/kill one terminal, not detach. It shows confirm: “Stop process and close”.
- Add lifecycle hint visible near tab header: “Đóng cửa sổ không dừng terminal. Terminal sống theo session và tự dừng theo giới hạn thời gian.”
- Warning banner appears for active terminal if `warning` exists or `idleWarningAt !== null`; warning state from list must render even if event fired while user was away.
- Tab badge `⚠` appears for warning terminals.
- Closed/lost terminal state must not vanish immediately; show reason and CTA “Tạo terminal mới”.
- Max 3 UX: show `n/3`; disable plus at 3/3 with copy “Session này đã có 3/3 terminal. Đóng một terminal cũ trước khi tạo terminal mới.”
- `Keep terminal` emits `terminal:keepalive` that resets idle timer without writing to shell.

- [ ] **Step 3: Add UI tests**

Test cases:
- renders multiple terminals from list.
- plus disabled or error shown at 3 terminals.
- warning banner shown for idle warning.
- unmount calls `disconnect`, not `closeTerminal`.
- `Keep terminal` emits keepalive and clears idle warning state.
- explicit close calls `closeTerminal`.

Run: `bun test web/src/components/Terminal/SessionTerminalTabs.test.tsx`

Expected: PASS.

---

### Task 6: Replace agent modal single terminal with shared tabs

**Files:**
- Modify: `web/src/components/modals/TerminalModal.tsx`
- Test: create/update `web/src/components/modals/TerminalModal.test.tsx`

- [ ] **Step 1: Replace duplicated terminal logic**

Simplify modal body:

```tsx
export function TerminalModal(props: { sessionId: string; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={(open) => { if (!open) props.onClose() }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Terminal</DialogTitle>
                </DialogHeader>
                <SessionTerminalTabs sessionId={props.sessionId} compact />
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 2: Test modal does not close terminal on modal close**

Mock `SessionTerminalTabs`, close modal, assert no destructive terminal call happens in modal. The child component owns detach on unmount.

Run: `bun test web/src/components/modals/TerminalModal.test.tsx`

Expected: PASS.

---

### Task 7: Update editor terminal behavior without breaking machine terminals

**Files:**
- Modify: `web/src/components/editor/EditorTerminal.tsx`
- Modify: `web/src/components/editor/EditorLayout.tsx`
- Modify tests: `web/src/components/editor/EditorTerminal.test.tsx`, `EditorLayout.test.tsx`

- [ ] **Step 1: Session-scoped tabs use shared component**

In `EditorTerminal`, if a tab has `sessionId`, render session shared component for that session. If a tab has `machineId`, keep existing machine terminal path for project terminal.

- [ ] **Step 2: Remove destructive pagehide for session terminals**

Change `EditorLayout` pagehide behavior:

```ts
const handlePageHide = () => {
    // Do not close session terminals on browser close; socket detach handles it.
    clearPersistedEditorState()
}
```

For this feature, only session terminals become durable. Machine/project terminals keep existing cleanup behavior. Split registered close functions by scope so `pagehide` and project switch do not close session-scoped terminals but may still close machine-scoped terminals.

- [ ] **Step 3: Update tests**

Existing tests expecting pagehide close must change:

```ts
it('does not close session terminals on page unload', () => {
    // register session terminal close; dispatch pagehide; expect close not called
})
```

Keep project switch cleanup test for machine terminals if behavior retained.

Run: `bun test web/src/components/editor/EditorLayout.test.tsx web/src/components/editor/EditorTerminal.test.tsx`

Expected: PASS.

---

### Task 8: Update legacy terminal route

**Files:**
- Modify: `web/src/routes/sessions/terminal.tsx`
- Modify: `web/src/routes/sessions/terminal.test.tsx`

- [ ] **Step 1: Replace route contents with `SessionTerminalTabs`**

Replace the legacy single-terminal page with `SessionTerminalTabs sessionId={sessionId}`. Do not keep the old single-terminal cleanup path.

- [ ] **Step 2: Update route test**

Change expectation from “closes remote terminal when leaving page” to “detaches socket and does not close remote terminal when leaving page”.

Run: `bun test web/src/routes/sessions/terminal.test.tsx`

Expected: PASS.

---

### Task 9: Update archive confirmation copy for running terminals

**Files:**
- Modify: `web/src/components/SessionHeader.tsx`
- Modify: `web/src/components/SessionList.tsx`
- Modify: `web/src/components/Dashboard/index.tsx` if dashboard archive action reuses separate confirm copy
- Test: related archive confirm tests under `web/src/components/**`

- [ ] **Step 1: Show destructive terminal impact in archive confirm**

When archiving a session, if terminal list/count for that session is available and count > 0, confirm copy must include:

```text
Archive session sẽ dừng tất cả terminal đang chạy trong session này. Hành động này không hoàn tác terminal.
```

Show count: `Terminal đang chạy: n/3`.

- [ ] **Step 2: Add tests**

Test archive confirm includes terminal impact copy when session terminal count > 0, and does not show misleading copy when count is 0/unknown.

---

### Task 10: Add localized warning and limit copy

**Files:**
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/vi-VN.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] **Step 1: Add strings**

English:

```ts
'terminal.warning.idle': 'This terminal has had no input or output for 2 hours. Keep it running if you still need it; otherwise it will stop after 4 hours idle.',
'terminal.warning.age': 'This terminal will stop at the 24-hour session limit.',
'terminal.limit.max': 'This session already has 3/3 terminals. Close an old terminal before creating a new one.',
'terminal.close.confirmTitle': 'Close terminal?',
'terminal.close.confirmDescription': 'This will stop the running process and close this terminal.',
'terminal.close.confirm': 'Stop process and close',
'terminal.keepAlive': 'Keep terminal',
'terminal.lifecycleHint': 'Closing the window does not stop the terminal. Terminals live with the session and stop automatically by time limits.',
'terminal.closed.idle': 'Stopped after 4 hours without input or output.',
'terminal.closed.age': 'Stopped after reaching the 24-hour limit.',
'terminal.closed.archive': 'Stopped because the session was archived.',
'terminal.closed.lost': 'Terminal was lost because the CLI disconnected or restarted.',
'terminal.createNew': 'Create new terminal'
```

Vietnamese:

```ts
'terminal.warning.idle': 'Terminal này không có input/output trong 2 giờ. Nếu vẫn cần dùng, chọn Giữ chạy. Nếu không, hệ thống sẽ tự dừng sau 4 giờ không hoạt động.',
'terminal.warning.age': 'Terminal này sẽ tự dừng khi đạt giới hạn 24 giờ.',
'terminal.limit.max': 'Session này đã có 3/3 terminal. Đóng một terminal cũ trước khi tạo terminal mới.',
'terminal.close.confirmTitle': 'Đóng terminal?',
'terminal.close.confirmDescription': 'Thao tác này sẽ dừng process đang chạy và đóng terminal này.',
'terminal.close.confirm': 'Dừng process và đóng',
'terminal.keepAlive': 'Giữ terminal',
'terminal.lifecycleHint': 'Đóng cửa sổ không dừng terminal. Terminal sống theo session và tự dừng theo giới hạn thời gian.',
'terminal.closed.idle': 'Đã dừng vì không có input/output trong 4 giờ.',
'terminal.closed.age': 'Đã dừng vì đạt giới hạn 24 giờ.',
'terminal.closed.archive': 'Đã dừng vì session được archive.',
'terminal.closed.lost': 'Terminal bị mất vì CLI ngắt kết nối hoặc restart.',
'terminal.createNew': 'Tạo terminal mới'
```

Chinese:

```ts
'terminal.warning.idle': '此终端 2 小时内没有输入或输出。如仍需使用，请选择继续运行；否则系统会在空闲 4 小时后停止。',
'terminal.warning.age': '此终端将在达到 24 小时限制时自动停止。',
'terminal.limit.max': '此会话已有 3/3 个终端。请先关闭一个旧终端再创建新的终端。',
'terminal.close.confirmTitle': '关闭终端？',
'terminal.close.confirmDescription': '此操作会停止正在运行的进程并关闭此终端。',
'terminal.close.confirm': '停止进程并关闭',
'terminal.keepAlive': '保持终端运行',
'terminal.lifecycleHint': '关闭窗口不会停止终端。终端跟随会话生命周期，并会按时间限制自动停止。',
'terminal.closed.idle': '由于 4 小时内没有输入或输出，终端已停止。',
'terminal.closed.age': '由于达到 24 小时限制，终端已停止。',
'terminal.closed.archive': '由于会话已归档，终端已停止。',
'terminal.closed.lost': '由于 CLI 断开连接或重启，终端已丢失。',
'terminal.createNew': '创建新终端'
```

- [ ] **Step 2: Run web typecheck**

Run: `bun run typecheck:web`

Expected: PASS.

---

### Task 11: End-to-end verification and regression sweep

**Files:**
- No source changes unless failures reveal defects.

- [ ] **Step 1: Run focused tests**

```bash
bun test shared/src/socket.test.ts
bun test cli/src/terminal/TerminalManager.test.ts cli/src/api/apiSession.test.ts cli/src/api/apiMachine.test.ts
bun test hub/src/socket/handlers/terminal.test.ts hub/src/socket/handlers/cli/terminalHandlers.test.ts
bun test web/src/components/Terminal/SessionTerminalTabs.test.tsx web/src/components/modals/TerminalModal.test.tsx web/src/components/editor/EditorTerminal.test.tsx web/src/components/editor/EditorLayout.test.tsx web/src/routes/sessions/terminal.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Run full test suite if focused checks pass**

```bash
bun run test
```

Expected: exit 0. If unrelated pre-existing failures appear, capture exact failures and do not hide them.

- [ ] **Step 4: Manual browser check**

Manual scenarios:
1. Open session terminal modal, create 3 tabs, fourth attempt shows max limit.
2. Run `sleep 60`, close modal, reopen modal, same terminal tab still exists and process is still running.
3. Open editor mode for same session, terminal list matches modal.
4. Close browser tab, reopen HAPI, session terminals still listed and replay output works; no `terminal:close` emitted on pagehide for session terminals.
5. Click close on one terminal tab, only that process closes.
6. Archive session, all session terminal tabs disappear and CLI terminals are killed.
7. Open two browser tabs for same session terminal; verify explicit close in one tab closes terminal in both, while closing one browser tab only detaches.
8. Try 10 concurrent create actions against one session; verify exactly 3 terminals exist and UI shows max-limit copy.
9. Verify Session A never receives Session B terminal list/output/warning.
10. Verify archived session rejects new terminal create.
11. Verify CLI restart shows prior terminal as lost or absent with recovery CTA, not running.
12. Verify child process cleanup with a command that spawns a child process; no child remains after close.
13. Use test-only env for idle timers (`HAPI_TERMINAL_IDLE_WARNING_MS=2000`, `HAPI_TERMINAL_IDLE_TIMEOUT_MS=5000`, `HAPI_TERMINAL_HARD_LIFETIME_MS=10000`) and verify warning then auto-close.

Expected: all scenarios match policy.

---


## Observability / No-Secret Logging

Add lifecycle logs/metrics without raw terminal data:

- `terminal_created`
- `terminal_attached`
- `terminal_detached`
- `terminal_create_denied_max`
- `terminal_idle_warning`
- `terminal_killed_idle`
- `terminal_killed_hard_age`
- `terminal_killed_archive`
- `terminal_killed_user`
- `terminal_lost_cli`
- `terminal_kill_failed`
- `terminal_orphan_reaped`

Allowed fields: `namespace`, `sessionId`, `terminalId`, `reason`, `ageMs`, `idleMs`, `clientCount`, `liveCount`. Do not log raw output, typed input, command lines, environment variables, provider keys, tokens, cookies.

---

## Self-Review

- Spec coverage: covers shared modal/editor source, session lifecycle, browser/modal/editor detach, close-one, max 3/session enforced by CLI atomically, idle warning, 4-hour idle kill, age warning, 24-hour hard kill, internal archive cleanup, no web close-all, scope-room forwarding, session-only durability, machine regression boundary, CLI restart lost state, process-group cleanup, UX warnings, and observability.
- Placeholder scan: no unresolved placeholder markers; any implementation choice with branch is explicit.
- Type consistency: schemas use `TerminalState`, `TerminalListPayload`, `TerminalWarningPayload`, `TerminalCloseAllPayload` across shared/CLI/hub/web.
- Scope check: plan is large but cohesive; all changes serve one lifecycle feature. Machine terminal durability is explicitly out of scope unless chosen in Task 7.
