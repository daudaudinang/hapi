# Story 2.2 Idle/Hard Kill Process Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce session terminal idle kill after 4h no input/output and hard kill after 24h total lifetime, with safe process cleanup and deterministic tests.

**Architecture:** `TerminalManager` remains lifecycle source of truth. Session terminals get lifecycle kill timers plus sweep checks; machine terminals keep existing legacy idle/detach behavior. Cleanup uses one idempotent path that clears timers/buffers/refs and tries graceful process-group termination before SIGKILL fallback.

**Tech Stack:** Bun, TypeScript strict, Vitest/Bun test, HAPI shared protocol types.

---

## Files

- Modify: `cli/src/terminal/TerminalManager.ts`
  - Add lifecycle kill scheduler for session terminals.
  - Add `checkLifecycleTimeouts()` sweep.
  - Add process cleanup helper with SIGTERM then SIGKILL grace.
  - Keep machine legacy idle timer separate.
- Modify: `cli/src/terminal/TerminalManager.test.ts`
  - Add fake clock/timer tests for idle kill, hard kill, sweep after clock jump, activity behavior, idempotent cleanup, SIGTERM→SIGKILL fallback, no machine regression.
- No hub/web/shared changes in this story unless tests prove current contracts need a type-only adjustment.

## Invariants

- Session idle warning remains Story 2.1 behavior; warning itself does not kill.
- Session idle kill default: `4 * 60 * 60_000` when `idleTimeoutMs` not provided.
- Machine default idle kill remains `0` unless configured; do not apply 4h session default to machine.
- Hard lifetime kill default: `24 * 60 * 60_000`; keepalive/input/output never reset `hardExpiresAt`.
- `detach`, browser close, modal close, route unmount do not kill session terminals.
- `close`, `closeAll`, idle kill, hard kill all use same idempotent cleanup path.
- Logs must contain no raw terminal output, command text, environment, token, or cwd.

## Task 1: Add deterministic lifecycle timeout scheduler and sweep

**Files:**
- Modify: `cli/src/terminal/TerminalManager.ts`
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add failing tests for idle/hard timeout sweep**

Add tests near existing lifecycle warning tests:

```ts
it('closes session terminal as closed_idle after configured idle timeout', () => {
    let now = 1_000
    const fakeSpawn = installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 200,
        idleWarningMs: 100,
        hardLifetimeMs: 10_000,
        ageWarningBeforeMs: 100,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    now = 1_200
    manager.checkLifecycleTimeouts()

    expect(fakeSpawn.processes[0]?.killCalls[0]).toBe('SIGTERM')
    expect(manager.list()[0]).toMatchObject({
        terminalId: 'terminal-1',
        status: 'closed_idle',
        closeReason: 'idle_timeout'
    })
})

it('closes session terminal as closed_age at hard lifetime despite activity', () => {
    let now = 1_000
    installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 10_000,
        idleWarningMs: 1_000,
        hardLifetimeMs: 500,
        ageWarningBeforeMs: 100,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    now = 1_300
    manager.keepalive('terminal-1')
    now = 1_500
    manager.checkLifecycleTimeouts()

    expect(manager.list()[0]).toMatchObject({
        terminalId: 'terminal-1',
        status: 'closed_age',
        closeReason: 'hard_timeout',
        hardExpiresAt: 1_500
    })
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: FAIL because `checkLifecycleTimeouts` is missing.

- [ ] **Step 3: Implement session lifecycle timeout scheduling and sweep**

Add a kill timer field and injected scheduler options:

```ts
type LifecycleTimerHandle = ReturnType<typeof setTimeout> | unknown

type TerminalRuntime = TerminalSession & {
    proc: Bun.Subprocess
    terminal: Bun.Terminal
    idleTimer: ReturnType<typeof setTimeout> | null
    warningTimer: WarningTimerHandle | null
    lifecycleTimer: LifecycleTimerHandle | null
    detachedTimer: ReturnType<typeof setTimeout> | null
    outputBuffer: string
}
```

Add options:

```ts
scheduleLifecycleCheck?: (callback: () => void, delayMs: number) => LifecycleTimerHandle
clearLifecycleCheck?: (timer: LifecycleTimerHandle) => void
```

Constructor:

```ts
this.idleTimeoutMs = options.idleTimeoutMs
    ?? (isSessionScope ? DEFAULT_PLANNED_IDLE_CLOSE_MS : resolveEnvNumber('HAPI_TERMINAL_IDLE_TIMEOUT_MS', DEFAULT_IDLE_TIMEOUT_MS))
this.scheduleLifecycleCheck = options.scheduleLifecycleCheck ?? ((callback, delayMs) => setTimeout(callback, delayMs))
this.clearLifecycleCheck = options.clearLifecycleCheck ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>))
```

Add methods:

```ts
checkLifecycleTimeouts(): void {
    if (!this.sessionId) return
    const now = this.now()
    const due: Array<{ terminalId: string; reason: TerminalCloseReason }> = []
    for (const record of this.terminalRecords.values()) {
        if (!this.isLiveStatus(record.status)) continue
        if (now >= record.hardExpiresAt) {
            due.push({ terminalId: record.terminalId, reason: 'hard_timeout' })
            continue
        }
        if (this.idleTimeoutMs > 0 && now - record.lastActivityAt >= this.idleTimeoutMs) {
            due.push({ terminalId: record.terminalId, reason: 'idle_timeout' })
        }
    }
    for (const item of due) this.cleanup(item.terminalId, item.reason)
    for (const runtime of this.terminals.values()) this.scheduleLifecycleTimer(runtime)
}

private scheduleLifecycleTimer(runtime: TerminalRuntime): void {
    if (!this.sessionId) return
    if (runtime.lifecycleTimer) {
        this.clearLifecycleCheck(runtime.lifecycleTimer)
        runtime.lifecycleTimer = null
    }
    const record = this.terminalRecords.get(runtime.terminalId)
    if (!record || !this.isLiveStatus(record.status)) return
    const dueTimes = [record.hardExpiresAt]
    if (this.idleTimeoutMs > 0) dueTimes.push(record.lastActivityAt + this.idleTimeoutMs)
    const delayMs = Math.max(0, Math.min(...dueTimes) - this.now())
    runtime.lifecycleTimer = this.scheduleLifecycleCheck(() => {
        runtime.lifecycleTimer = null
        this.checkLifecycleTimeouts()
    }, delayMs)
    const maybeUnref = (runtime.lifecycleTimer as { unref?: () => void } | null)?.unref
    if (typeof maybeUnref === 'function') maybeUnref.call(runtime.lifecycleTimer)
}
```

Call `scheduleLifecycleTimer(runtime)` after create, reattach, resize, warning checks, and `markRealActivity()` for session terminals. Do not call it for machine terminals.

- [ ] **Step 4: Run focused tests**

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: PASS.

## Task 2: Cleanup idempotency, resource clearing, and process-group termination

**Files:**
- Modify: `cli/src/terminal/TerminalManager.ts`
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add failing tests for SIGTERM→SIGKILL fallback and idempotency**

Enhance fake process to expose optional `pid` and avoid automatically marking killed when test asks for stubborn process:

```ts
const processes: Array<{ killed: boolean; exitCode: number | null; killCalls: string[]; pid: number }> = []
```

Add tests:

```ts
it('cleanup is idempotent and sends SIGTERM only once for repeated close', () => {
    const fakeSpawn = installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 0
    })

    manager.create('terminal-1', 80, 24)
    manager.close('terminal-1')
    manager.close('terminal-1')

    expect(fakeSpawn.processes[0]?.killCalls).toEqual(['SIGTERM'])
    expect(manager.list()[0]).toMatchObject({ status: 'closed_user', closeReason: 'user_close' })
})

it('escalates stubborn terminal cleanup from SIGTERM to SIGKILL after grace', () => {
    const fakeSpawn = installFakeSpawn({ markKilledOnKill: false })
    const timers: Array<() => void> = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 0,
        processKillGraceMs: 50,
        scheduleProcessKillGrace: (callback) => {
            timers.push(callback)
            return callback
        },
        clearProcessKillGrace: () => {}
    })

    manager.create('terminal-1', 80, 24)
    manager.close('terminal-1')
    expect(fakeSpawn.processes[0]?.killCalls).toEqual(['SIGTERM'])

    timers[0]!()
    expect(fakeSpawn.processes[0]?.killCalls).toEqual(['SIGTERM', 'SIGKILL'])
})
```

- [ ] **Step 2: Implement process cleanup helper**

Add options:

```ts
processKillGraceMs?: number
scheduleProcessKillGrace?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout> | unknown
clearProcessKillGrace?: (timer: ReturnType<typeof setTimeout> | unknown) => void
```

Add constants:

```ts
const DEFAULT_PROCESS_KILL_GRACE_MS = 2_000
```

Add helper:

```ts
private terminateProcess(runtime: TerminalRuntime, reason: TerminalCloseReason): void {
    if (runtime.proc.killed || runtime.proc.exitCode !== null) return
    try {
        this.sendProcessSignal(runtime.proc, 'SIGTERM')
    } catch (error) {
        logger.debug('[TERMINAL] Failed to send terminal SIGTERM', {
            terminalId: runtime.terminalId,
            reason,
            error
        })
    }
    const graceTimer = this.scheduleProcessKillGrace(() => {
        if (runtime.proc.killed || runtime.proc.exitCode !== null) return
        try {
            this.sendProcessSignal(runtime.proc, 'SIGKILL')
        } catch (error) {
            logger.debug('[TERMINAL] Failed to send terminal SIGKILL', {
                terminalId: runtime.terminalId,
                reason,
                error
            })
        }
    }, this.processKillGraceMs)
    const maybeUnref = (graceTimer as { unref?: () => void } | null)?.unref
    if (typeof maybeUnref === 'function') maybeUnref.call(graceTimer)
}

private sendProcessSignal(proc: Bun.Subprocess, signal: 'SIGTERM' | 'SIGKILL'): void {
    const pid = (proc as { pid?: number }).pid
    if (pid && process.platform !== 'win32') {
        try {
            process.kill(-pid, signal)
            return
        } catch {
            // Fall back to Bun subprocess kill below.
        }
    }
    proc.kill(signal)
}
```

Use `terminateProcess(runtime, reason)` in `cleanup()` instead of `runtime.proc.kill()`.

Important: if tests run with fake positive `pid`, avoid actually signaling process group by setting fake `pid` undefined unless test stubs `process.kill` safely.

- [ ] **Step 3: Clear lifecycle timers and buffer refs in cleanup**

In `cleanup()`:

```ts
if (runtime.lifecycleTimer) {
    this.clearLifecycleCheck(runtime.lifecycleTimer)
    runtime.lifecycleTimer = null
}
if (runtime.idleTimer) {
    clearTimeout(runtime.idleTimer)
    runtime.idleTimer = null
}
runtime.outputBuffer = ''
this.terminals.delete(terminalId)
```

Keep idempotency: if runtime missing, return without changing closed metadata.

- [ ] **Step 4: Run focused tests**

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: PASS.

## Task 3: Regression gates for machine legacy, logging safety, and full verification

**Files:**
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add regression tests**

Add tests:

```ts
it('does not apply session default 4h idle timeout to machine terminals', () => {
    let now = 1_000
    const fakeSpawn = installFakeSpawn()
    const manager = new TerminalManager({
        machineId: 'machine-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        now: () => now,
        detachedTimeoutMs: 0
    })

    manager.create('machine-terminal', 80, 24)
    now = 1_000 + 4 * 60 * 60_000
    manager.checkLifecycleTimeouts()

    expect(fakeSpawn.processes[0]?.killCalls).toEqual([])
    expect(manager.list()[0]).toMatchObject({ status: 'running', closeReason: null })
})

it('clears replay buffer on idle cleanup so closed state has no output replay', () => {
    let now = 1_000
    const fakeSpawn = installFakeSpawn()
    const outputs: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: (payload) => outputs.push(payload.data),
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 100,
        hardLifetimeMs: 1_000,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    fakeSpawn.emitData('secret-like output should not replay after cleanup\n')
    now = 1_100
    manager.checkLifecycleTimeouts()
    outputs.length = 0
    manager.create('terminal-1', 80, 24, undefined, true)

    expect(outputs).toEqual([])
})
```

- [ ] **Step 2: Verify no secret-bearing logs added**

Search manually:

```bash
grep -n "logger\.debug.*TERMINAL" cli/src/terminal/TerminalManager.ts
```

Expected: new logs include metadata (`terminalId`, `reason`, `error`) only; no output, command, env, token, or cwd.

- [ ] **Step 3: Run story verification**

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts src/api/apiSession.test.ts
cd cli && bun run test
bun run typecheck
```

Expected: PASS.

From repo root:

```bash
bun run typecheck
```

Expected: PASS.

## BMAD party risk checklist

- Race with Story 2.1 warning timers: lifecycle kill timers must be separate from warning timers.
- Browser/modal detach: `detach()` still cannot call cleanup for session terminals.
- Machine/project legacy: no 4h default idle kill for machine.
- Timer fake-clock: tests use injected `now()` and injected schedulers; no 4h sleeps.
- Process cleanup: SIGTERM first, SIGKILL after grace, idempotent close avoids duplicate signal storm.
- Output replay memory: buffer cleared during cleanup.
- Secret leakage: cleanup logs must not include raw command/output/env/cwd/token.

---

## BMAD party review patch — must implement before coding

Review result: RED until these additions are covered.

### Activity-gated sweep

Add `enforceLifecycleBeforeUse(terminalId): boolean`:

```ts
private enforceLifecycleBeforeUse(terminalId: string): boolean {
    if (!this.sessionId) return true
    const record = this.terminalRecords.get(terminalId)
    if (!record || !this.isLiveStatus(record.status)) return false
    const reason = this.lifecycleCloseReason(record)
    if (!reason) return true
    this.cleanup(terminalId, reason)
    return false
}

private lifecycleCloseReason(record: TerminalMetadataRecord): TerminalCloseReason | null {
    const now = this.now()
    if (now >= record.hardExpiresAt) return 'hard_timeout'
    if (this.idleTimeoutMs > 0 && now - record.lastActivityAt >= this.idleTimeoutMs) return 'idle_timeout'
    return null
}
```

Call it before actions can refresh/use an expired terminal:

- top of `write()` before shell write
- top of `keepalive()` before `markRealActivity`
- top of `resize()` before resize
- `create(existing)` before setting running/resizing/replay
- terminal output callback before `appendOutputBuffer`, `onOutput`, or `markRealActivity`
- `detach()` before setting detached

If it returns false, do not write shell, do not keepalive, do not replay, do not append output, do not change `lastActivityAt`.

### Extra required tests

Add tests beyond Task 1:

```ts
it('enforces expired idle timeout before keepalive can refresh activity', () => {
    let now = 1_000
    installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 100,
        hardLifetimeMs: 10_000,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    now = 1_100
    manager.keepalive('terminal-1')

    expect(manager.list()[0]).toMatchObject({
        status: 'closed_idle',
        closeReason: 'idle_timeout',
        lastActivityAt: 1_100
    })
})

it('enforces expired idle timeout before write can reach shell', () => {
    let now = 1_000
    const fakeSpawn = installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 100,
        hardLifetimeMs: 10_000,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    now = 1_100
    manager.write('terminal-1', 'echo should-not-write\n')

    expect(fakeSpawn.terminals[0]?.writes).toEqual([])
    expect(manager.list()[0]).toMatchObject({ status: 'closed_idle', closeReason: 'idle_timeout' })
})

it('enforces expired hard timeout before output callback can mark activity', () => {
    let now = 1_000
    const fakeSpawn = installFakeSpawn()
    const outputs: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: (payload) => outputs.push(payload.data),
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 10_000,
        hardLifetimeMs: 100,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    now = 1_100
    fakeSpawn.emitData('late output must be dropped')

    expect(outputs).toEqual([])
    expect(manager.list()[0]).toMatchObject({ status: 'closed_age', closeReason: 'hard_timeout' })
})

it('uses 4h idle timeout by default for session terminals', () => {
    let now = 1_000
    installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    now = 1_000 + 4 * 60 * 60_000
    manager.checkLifecycleTimeouts()

    expect(manager.list()[0]).toMatchObject({ status: 'closed_idle', closeReason: 'idle_timeout' })
})

it('uses 24h hard lifetime by default and does not reset it on activity', () => {
    let now = 1_000
    installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 25 * 60 * 60_000,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    now = 1_000 + 23 * 60 * 60_000 + 59 * 60_000
    manager.keepalive('terminal-1')
    now = 1_000 + 24 * 60 * 60_000
    manager.checkLifecycleTimeouts()

    expect(manager.list()[0]).toMatchObject({ status: 'closed_age', closeReason: 'hard_timeout' })
})
```

### Process cleanup correction

Add to runtime:

```ts
processKillGraceTimer: ReturnType<typeof setTimeout> | unknown | null
processExited: boolean
```

Rules:

- Set `processExited = true` in `onExit` before cleanup.
- Store `processKillGraceTimer` after SIGTERM.
- Cancel `processKillGraceTimer` when process exits or cleanup finalizes.
- SIGKILL fallback must check `runtime.processExited || runtime.proc.exitCode !== null`, not `runtime.proc.killed`.
- `proc.killed` may mean “signal sent”, not “dead”. Do not let it suppress SIGKILL.

### Process group strategy

Preferred:

- Try `process.kill(-pid, signal)` when pid is available on non-Windows.
- Fall back to `proc.kill(signal)` if process group signal fails.
- Manual verification must be recorded: shell spawns `sleep`, close/timeout, no child remains.

Implementation note:

- Bun spawn terminal may not guarantee new process group. Do not claim full process-tree guarantee from unit tests alone.
- Story done can say: “process-group signal attempted; manual child-process cleanup checklist remains required.”

### Log safety correction

Add `sanitizeTerminalError(error)` helper and use it in new terminal lifecycle logs:

```ts
function sanitizeTerminalError(error: unknown): { name?: string; code?: string; message?: string } {
    if (!(error instanceof Error)) return { message: String(error).slice(0, 200) }
    const code = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : undefined
    return { name: error.name, code, message: error.message.slice(0, 200) }
}
```

Never log:

- terminal output
- shell command text
- environment
- cwd
- token/API URL
- stack trace

### Attached refs note

`TerminalManager` does not hold browser/modal attached refs. Hub registry owns socket attachments. Story 2.2 cleanup only clears CLI runtime refs: timers, output buffer, subprocess reference from `terminals` map, warning age record.
