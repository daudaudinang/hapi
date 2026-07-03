# Story 1.2 CLI TerminalManager Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CLI `TerminalManager` the source of truth for session terminal list, max-3 limit, detach no-kill default, explicit close-one cleanup, and bounded replay.

**Architecture:** `TerminalManager` owns live terminal runtime metadata and exposes `list(): TerminalState[]`. Session managers default to max 3 and detached cleanup disabled; machine managers keep legacy max/detached behavior. Output replay remains CLI-memory only and bounded with a truncation marker.

**Tech Stack:** Bun, TypeScript strict, Bun test, `@hapi/protocol` terminal state types.

---

## File Map

| File | Role | Change |
|---|---|---|
| `cli/src/terminal/TerminalManager.ts` | CLI source of truth for shell processes | Add metadata, list, session defaults, status transitions, bounded replay marker, close reason-aware cleanup. |
| `cli/src/terminal/TerminalManager.test.ts` | CLI lifecycle tests | Add tests for list no output, session detach no kill, max 3, burst create, bounded replay marker, machine legacy boundary. |

## Task 1: Add failing tests for session source-of-truth behavior

**Files:**
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Improve fake spawn utility**

Extend `installFakeSpawn()` to expose spawn count and fake process kill/terminal close state:

```ts
function installFakeSpawn() {
    let latestTerminal: FakeTerminal | null = null
    let latestOptions: SpawnOptions | null = null
    let spawnCount = 0
    const processes: Array<{ killed: boolean; exitCode: number | null; killCalls: string[] }> = []

    Bun.spawn = ((command: string[], options: SpawnOptions) => {
        spawnCount += 1
        latestOptions = options
        const terminal: FakeTerminal = {
            resize: () => {},
            write: () => {},
            close: () => {}
        }
        latestTerminal = terminal
        const proc = {
            terminal,
            killed: false,
            exitCode: null,
            signalCode: null,
            kill: (signal?: string) => {
                proc.killed = true
                proc.killCalls.push(signal ?? 'SIGTERM')
                return true
            },
            killCalls: [] as string[]
        }
        processes.push(proc)
        return proc
    }) as typeof Bun.spawn

    return {
        get spawnCount() { return spawnCount },
        processes,
        emitData(data: string): void {
            if (!latestOptions?.terminal?.data || !latestTerminal) throw new Error('terminal data handler was not registered')
            latestOptions.terminal.data(latestTerminal, new TextEncoder().encode(data))
        }
    }
}
```

- [ ] **Step 2: Add RED tests**

Append tests:

```ts
it('lists session terminal metadata without output data', () => {
    installFakeSpawn()
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp/project',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 0
    })

    manager.create('terminal-1', 80, 24)

    expect(manager.list()).toEqual([{ 
        scopeType: 'session',
        sessionId: 'session-1',
        terminalId: 'terminal-1',
        label: 'Terminal 1',
        cwd: '/tmp/project',
        cols: 80,
        rows: 24,
        status: 'running',
        closeReason: null,
        createdAt: expect.any(Number),
        lastActivityAt: expect.any(Number),
        idleWarningAt: null,
        hardExpiresAt: expect.any(Number)
    }])
    expect(JSON.stringify(manager.list())).not.toContain('outputBuffer')
})

it('does not close session terminals on detach by default', async () => {
    const fakeSpawn = installFakeSpawn()
    const errors: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: (payload) => errors.push(payload.message),
        idleTimeoutMs: 0
    })

    manager.create('terminal-1', 80, 24)
    manager.detach('terminal-1')
    await new Promise((resolve) => setTimeout(resolve, 5))
    manager.write('terminal-1', 'echo alive\n')

    expect(errors).toEqual([])
    expect(fakeSpawn.processes[0].killed).toBe(false)
    expect(manager.list()[0]?.status).toBe('detached')
})

it('enforces max 3 live session terminals in the CLI manager', () => {
    const fakeSpawn = installFakeSpawn()
    const errors: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: (payload) => errors.push(payload.message),
        idleTimeoutMs: 0
    })

    for (const id of ['t1', 't2', 't3', 't4']) manager.create(id, 80, 24)

    expect(fakeSpawn.spawnCount).toBe(3)
    expect(manager.list().map((item) => item.terminalId)).toEqual(['t1', 't2', 't3'])
    expect(errors).toContain('Too many terminals open (max 3).')
})

it('frees a session slot after explicit close-one', () => {
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

    manager.create('t1', 80, 24)
    manager.create('t2', 80, 24)
    manager.create('t3', 80, 24)
    manager.close('t2')
    manager.create('t4', 80, 24)

    expect(fakeSpawn.spawnCount).toBe(4)
    expect(manager.list().map((item) => item.terminalId)).toEqual(['t1', 't3', 't4'])
})

it('keeps machine terminal detached cleanup behavior and default max unchanged', async () => {
    const fakeSpawn = installFakeSpawn()
    const manager = new TerminalManager({
        machineId: 'machine-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 0,
        detachedTimeoutMs: 1
    })

    for (const id of ['t1', 't2', 't3', 't4']) manager.create(id, 80, 24)
    expect(fakeSpawn.spawnCount).toBe(4)
    manager.detach('t1')
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(manager.list().map((item) => item.terminalId)).toEqual(['t2', 't3', 't4'])
})

it('bounds replay output with a truncation marker', () => {
    const fakeSpawn = installFakeSpawn()
    const outputs: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: (payload) => outputs.push(payload.data),
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 0,
        maxOutputBufferChars: 20
    })

    manager.create('terminal-1', 80, 24)
    fakeSpawn.emitData('abcdefghijklmnopqrstuvwxyz')
    outputs.length = 0
    manager.create('terminal-1', 80, 24, undefined, true)

    expect(outputs[0]).toContain('output truncated')
    expect(outputs[0]!.length).toBeLessThanOrEqual(20)
})
```

- [ ] **Step 3: Verify RED**

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: FAIL because `list()` and `maxOutputBufferChars` do not exist and session defaults still use max 4/detached cleanup.

## Task 2: Implement metadata/list/session defaults/bounded replay

**Files:**
- Modify: `cli/src/terminal/TerminalManager.ts`

- [ ] **Step 1: Import shared types**

Add imports:

```ts
    TerminalState,
    TerminalCloseReason
```

- [ ] **Step 2: Extend runtime/options/defaults**

Change `TerminalRuntime`:

```ts
type TerminalRuntime = TerminalSession & {
    proc: Bun.Subprocess
    terminal: Bun.Terminal
    idleTimer: ReturnType<typeof setTimeout> | null
    detachedTimer: ReturnType<typeof setTimeout> | null
    outputBuffer: string
    label: string
    cwd: string
    createdAt: number
    lastActivityAt: number
    idleWarningAt: number | null
    hardExpiresAt: number
    status: 'running' | 'detached'
    closeReason: null
}
```

Add option:

```ts
    maxOutputBufferChars?: number
    now?: () => number
```

Add defaults:

```ts
const DEFAULT_SESSION_MAX_TERMINALS = 3
const DEFAULT_MACHINE_MAX_TERMINALS = 4
const DEFAULT_HARD_LIFETIME_MS = 24 * 60 * 60_000
const OUTPUT_TRUNCATION_MARKER = '\n[... output truncated ...]\n'
```

Add readonly fields:

```ts
private readonly maxOutputBufferChars: number
private readonly now: () => number
```

Constructor behavior:

```ts
const isSessionScope = Boolean(options.sessionId)
const defaultDetachedTimeout = isSessionScope ? 0 : DEFAULT_DETACHED_TIMEOUT_MS
const defaultMaxTerminals = isSessionScope ? DEFAULT_SESSION_MAX_TERMINALS : DEFAULT_MACHINE_MAX_TERMINALS
this.detachedTimeoutMs = options.detachedTimeoutMs ?? resolveEnvNumberAllowZero('HAPI_TERMINAL_DETACHED_TIMEOUT_MS', defaultDetachedTimeout)
this.maxTerminals = options.maxTerminals ?? resolveEnvNumber('HAPI_TERMINAL_MAX_TERMINALS', defaultMaxTerminals)
this.maxOutputBufferChars = options.maxOutputBufferChars ?? MAX_OUTPUT_BUFFER_CHARS
this.now = options.now ?? Date.now
```

- [ ] **Step 3: Add list method and typed scope helper**

Add public method:

```ts
list(): TerminalState[] {
    return Array.from(this.terminals.values()).map((runtime) => ({
        ...this.typedScopePayload(),
        terminalId: runtime.terminalId,
        label: runtime.label,
        cwd: runtime.cwd,
        cols: runtime.cols,
        rows: runtime.rows,
        status: runtime.status,
        closeReason: runtime.closeReason,
        createdAt: runtime.createdAt,
        lastActivityAt: runtime.lastActivityAt,
        idleWarningAt: runtime.idleWarningAt,
        hardExpiresAt: runtime.hardExpiresAt
    }))
}
```

Add helper:

```ts
private typedScopePayload(): { scopeType: 'session'; sessionId: string } | { scopeType: 'machine'; machineId: string } {
    if (this.sessionId) return { scopeType: 'session', sessionId: this.sessionId }
    if (this.machineId) return { scopeType: 'machine', machineId: this.machineId }
    throw new Error('TerminalManager scope is not configured')
}
```

- [ ] **Step 4: Populate runtime metadata at create**

Before `runtime` object:

```ts
const now = this.now()
```

Runtime fields:

```ts
label: `Terminal ${this.terminals.size + 1}`,
cwd: sessionPath,
createdAt: now,
lastActivityAt: now,
idleWarningAt: null,
hardExpiresAt: now + DEFAULT_HARD_LIFETIME_MS,
status: 'running',
closeReason: null
```

When attaching existing terminal, set:

```ts
existing.status = 'running'
existing.lastActivityAt = this.now()
```

- [ ] **Step 5: Update activity/detach/close behavior**

`markActivity(runtime)` should update timestamp:

```ts
runtime.lastActivityAt = this.now()
runtime.idleWarningAt = null
this.scheduleIdleTimer(runtime)
```

`detach()` should mark status before scheduling:

```ts
runtime.status = 'detached'
```

`close()` should pass reason:

```ts
close(terminalId: string): void {
    this.cleanup(terminalId, 'user_close')
}
```

`closeAll()` should pass archive/internal neutral reason for now:

```ts
this.cleanup(terminalId, 'archive')
```

`onExit` should call:

```ts
this.cleanup(terminalId, 'process_exit')
```

- [ ] **Step 6: Bound replay with truncation marker**

Replace `appendOutputBuffer` overflow logic:

```ts
if (runtime.outputBuffer.length > this.maxOutputBufferChars) {
    const keepLength = Math.max(0, this.maxOutputBufferChars - OUTPUT_TRUNCATION_MARKER.length)
    runtime.outputBuffer = `${OUTPUT_TRUNCATION_MARKER}${runtime.outputBuffer.slice(-keepLength)}`
}
```

- [ ] **Step 7: Keep cleanup idempotent and clear resources**

Change signature:

```ts
private cleanup(terminalId: string, reason: TerminalCloseReason): void
```

Before deleting:

```ts
runtime.outputBuffer = ''
runtime.closeReason = reason as never
```

Do not log raw output. Keep existing kill/terminal close behavior.

- [ ] **Step 8: Verify GREEN**

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
bun run typecheck
```

Expected: pass.

## Self-Review Checklist

- Session default max is 3; machine default remains 4.
- Session detached timeout default is 0; machine default remains 5 minutes.
- `list()` returns metadata only and no raw output.
- Replay buffer always <= configured max and includes truncation marker when truncated.
- Explicit close frees slot and kills one terminal only.
- No hub/web/API behavior changed in this story.

## Party Review Required Corrections

Apply these corrections before implementation. They override earlier snippets if there is conflict.

### Correction 1: Session defaults must ignore legacy env

Session terminals must not be affected by legacy env defaults for max terminals or detached timeout. Machine terminals keep legacy env behavior.

Use this constructor logic:

```ts
const isSessionScope = Boolean(options.sessionId)

this.detachedTimeoutMs = options.detachedTimeoutMs
    ?? (isSessionScope ? 0 : resolveEnvNumberAllowZero('HAPI_TERMINAL_DETACHED_TIMEOUT_MS', DEFAULT_DETACHED_TIMEOUT_MS))

this.maxTerminals = options.maxTerminals
    ?? (isSessionScope ? DEFAULT_SESSION_MAX_TERMINALS : resolveEnvNumber('HAPI_TERMINAL_MAX_TERMINALS', DEFAULT_MACHINE_MAX_TERMINALS))
```

Add RED test:

```ts
it('ignores legacy env max and detached defaults for session terminals', async () => {
    const previousMax = process.env.HAPI_TERMINAL_MAX_TERMINALS
    const previousDetached = process.env.HAPI_TERMINAL_DETACHED_TIMEOUT_MS
    process.env.HAPI_TERMINAL_MAX_TERMINALS = '4'
    process.env.HAPI_TERMINAL_DETACHED_TIMEOUT_MS = '1'

    try {
        const fakeSpawn = installFakeSpawn()
        const manager = new TerminalManager({
            sessionId: 's1',
            getSessionPath: () => '/tmp',
            onReady: () => {},
            onOutput: () => {},
            onExit: () => {},
            onError: () => {},
            idleTimeoutMs: 0
        })

        for (const id of ['t1', 't2', 't3', 't4']) manager.create(id, 80, 24)
        expect(fakeSpawn.spawnCount).toBe(3)

        manager.detach('t1')
        await new Promise((resolve) => setTimeout(resolve, 5))
        expect(fakeSpawn.processes[0]?.killed).toBe(false)
    } finally {
        if (previousMax === undefined) delete process.env.HAPI_TERMINAL_MAX_TERMINALS
        else process.env.HAPI_TERMINAL_MAX_TERMINALS = previousMax
        if (previousDetached === undefined) delete process.env.HAPI_TERMINAL_DETACHED_TIMEOUT_MS
        else process.env.HAPI_TERMINAL_DETACHED_TIMEOUT_MS = previousDetached
    }
})
```

### Correction 2: Detach order must mark detached before timeout guard

Use this implementation:

```ts
detach(terminalId: string): void {
    const runtime = this.terminals.get(terminalId)
    if (!runtime) return

    runtime.status = 'detached'
    runtime.lastActivityAt = this.now()

    if (this.detachedTimeoutMs <= 0) return

    this.clearDetachedTimer(runtime)
    runtime.detachedTimer = setTimeout(() => {
        this.cleanup(runtime.terminalId, 'process_exit')
    }, this.detachedTimeoutMs)
}
```

### Correction 3: Replay bound test must use feasible buffer size

Use `maxOutputBufferChars: 64`, not 20. Assert:

```ts
expect(outputs[0]).toContain('output truncated')
expect(outputs[0]!.length).toBeLessThanOrEqual(64)
expect(outputs[0]).not.toContain('abcde')
```

### Correction 4: List must not leak raw output text

In list metadata test, emit output before list and assert:

```ts
fakeSpawn.emitData('SECRET_OUTPUT_DO_NOT_LIST')
const serialized = JSON.stringify(manager.list())
expect(serialized).not.toContain('SECRET_OUTPUT_DO_NOT_LIST')
expect(serialized).not.toContain('outputBuffer')
expect(serialized).not.toContain('data')
expect(TerminalStateSchema.safeParse(manager.list()[0]).success).toBe(true)
```

### Correction 5: Close-one must kill exactly one process

In close-one test, assert after `manager.close('t2')`:

```ts
expect(fakeSpawn.processes[0]?.killed).toBe(false)
expect(fakeSpawn.processes[1]?.killed).toBe(true)
expect(fakeSpawn.processes[2]?.killed).toBe(false)
```

Track fake terminal close if useful:

```ts
const terminal: FakeTerminal & { closed: boolean } = {
    closed: false,
    resize: () => {},
    write: () => {},
    close: () => { terminal.closed = true }
}
```

### Correction 6: Add same-tick burst max-3 test

```ts
it('does not exceed max 3 when create is called in a same-tick burst', async () => {
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

    await Promise.all(['t1', 't2', 't3', 't4'].map(async (id) => manager.create(id, 80, 24)))

    expect(fakeSpawn.spawnCount).toBe(3)
    expect(manager.list()).toHaveLength(3)
})
```

### Correction 7: Labels must not duplicate after close

Use monotonically increasing label counter or terminal id-derived labels. Add test if implementation uses counter:

```ts
it('does not duplicate labels after closing a terminal and creating another', () => {
    installFakeSpawn()
    const manager = new TerminalManager({ sessionId: 's1', getSessionPath: () => '/tmp', onReady: () => {}, onOutput: () => {}, onExit: () => {}, onError: () => {}, idleTimeoutMs: 0 })
    manager.create('t1', 80, 24)
    manager.create('t2', 80, 24)
    manager.close('t2')
    manager.create('t3', 80, 24)
    expect(manager.list().map((item) => item.label)).toEqual(['Terminal 1', 'Terminal 3'])
})
```

## Spec Review Required Corrections

### Correction 8: Closed metadata must remain observable but not count live

Story 1.2 requires explicit close-one to show `closed_user` / `user_close` while freeing a slot. Implement metadata records separate from live runtimes.

Required behavior:
- `list()` returns terminal metadata records including closed records.
- Max-3 live count uses only live runtimes/states, not all records.
- `close(terminalId)` kills/removes runtime, clears output, and updates metadata record to `status: 'closed_user'`, `closeReason: 'user_close'`.
- Closed records have no raw output and do not replay.
- Creating a new terminal after close succeeds because closed records do not count.

Add RED test by updating close-one test:

```ts
manager.create('t1', 80, 24)
manager.create('t2', 80, 24)
manager.create('t3', 80, 24)
manager.close('t2')

expect(fakeSpawn.processes[0]?.killed).toBe(false)
expect(fakeSpawn.processes[1]?.killed).toBe(true)
expect(fakeSpawn.processes[2]?.killed).toBe(false)
expect(manager.list().find((item) => item.terminalId === 't2')).toMatchObject({
    status: 'closed_user',
    closeReason: 'user_close'
})

manager.create('t4', 80, 24)
expect(fakeSpawn.spawnCount).toBe(4)
expect(manager.list().filter((item) => ['running', 'detached'].includes(item.status)).map((item) => item.terminalId)).toEqual(['t1', 't3', 't4'])
```

### Correction 9: Replay isolation test

Add RED test:

```ts
it('replays only the requested terminal output', () => {
    const fakeSpawn = installFakeSpawn()
    const outputs: string[] = []
    const manager = new TerminalManager({ sessionId: 's1', getSessionPath: () => '/tmp', onReady: () => {}, onOutput: (payload) => outputs.push(`${payload.terminalId}:${payload.data}`), onExit: () => {}, onError: () => {}, idleTimeoutMs: 0 })

    manager.create('t1', 80, 24)
    fakeSpawn.emitData('ONE')
    manager.create('t2', 80, 24)
    fakeSpawn.emitData('TWO')

    outputs.length = 0
    manager.create('t1', 80, 24, undefined, true)

    expect(outputs).toEqual(['t1:ONE'])
})
```

If current fake utility only emits to latest terminal, enhance it to store per-terminal data handlers or latest by terminal id.

### Correction 10: Verification command correction

For CLI tests use package-relative command:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Root command `bun test cli/src/terminal/TerminalManager.test.ts` is known to fail path alias resolution and must not be used as evidence.
