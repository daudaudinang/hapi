# Story 4.3 Replay Memory and Secret-Safe Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and patch replay buffer bounds, secret-safe lifecycle logs, and cleanup buffer clearing for session terminals.

**Architecture:** Keep CLI `TerminalManager` as only owner of raw terminal output. Add tests around existing buffer cap, lifecycle payloads, and logger sanitization. Patch only if tests expose gaps; no raw output/env/typed input/commands leave CLI memory except live `terminal:output` stream.

**Tech Stack:** TypeScript, Bun test, HAPI shared socket schemas, CLI fake `Bun.spawn` terminal harness.

---

## File Structure

- Modify `cli/src/terminal/TerminalManager.test.ts`: add focused regression tests for default 200,000 replay cap, secret-safe list/warning payloads, log sanitization, and buffer clearing for all close paths.
- Modify `cli/src/terminal/TerminalManager.ts`: export `MAX_OUTPUT_BUFFER_CHARS` only if needed for tests; add metadata-only lifecycle logging helper only if tests reveal raw/secret log risk.
- Modify `shared/src/socket.test.ts`: add schema rejection/serialization check proving terminal state/list/warning payloads do not model raw output/input/env/command fields if missing.

---

### Task 1: Replay buffer default-cap regression

**Files:**
- Modify: `cli/src/terminal/TerminalManager.ts`
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Export the default cap constant for direct assertion**

Patch `cli/src/terminal/TerminalManager.ts`:

```ts
export const MAX_OUTPUT_BUFFER_CHARS = 200_000
```

- [ ] **Step 2: Add default cap test**

Append to `cli/src/terminal/TerminalManager.test.ts`:

```ts
it('uses 200000 chars as the default replay buffer cap with a truncation marker', () => {
    const fakeSpawn = installFakeSpawn()
    const outputs: string[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp',
        onReady: () => {},
        onOutput: (payload) => outputs.push(payload.data),
        onExit: () => {},
        onError: () => {},
        idleTimeoutMs: 0
    })

    manager.create('terminal-1', 80, 24)
    fakeSpawn.emitData(`prefix-secret-${'x'.repeat(200_100)}`)
    outputs.length = 0
    manager.create('terminal-1', 80, 24, undefined, true)

    expect(outputs).toHaveLength(1)
    expect(outputs[0]!.length).toBeLessThanOrEqual(MAX_OUTPUT_BUFFER_CHARS)
    expect(outputs[0]).toContain('output truncated')
    expect(outputs[0]).not.toContain('prefix-secret')
})
```

Also update import:

```ts
import { MAX_OUTPUT_BUFFER_CHARS, TerminalManager } from './TerminalManager'
```

- [ ] **Step 3: Run focused test**

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: pass after export/import fix.

---

### Task 2: Payload secret-safety regression

**Files:**
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add warning/list payload secret test**

Append:

```ts
it('keeps list and warning payloads metadata-only without terminal secrets', () => {
    let now = 1_000
    const fakeSpawn = installFakeSpawn()
    const warnings: TerminalWarningPayload[] = []
    const manager = new TerminalManager({
        sessionId: 'session-1',
        getSessionPath: () => '/tmp/project',
        onReady: () => {},
        onOutput: () => {},
        onExit: () => {},
        onError: () => {},
        onWarning: (payload) => warnings.push(payload),
        idleTimeoutMs: 10_000,
        idleWarningMs: 100,
        hardLifetimeMs: 60_000,
        now: () => now
    })

    manager.create('terminal-1', 80, 24)
    manager.write('terminal-1', 'export OPENAI_API_KEY=sk-secret\n')
    fakeSpawn.emitData('token=SECRET_OUTPUT cookie=session-secret\n')
    now = 1_100
    manager.checkLifecycleWarnings()

    const serialized = JSON.stringify({ list: manager.list(), warnings })
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('SECRET_OUTPUT')
    expect(serialized).not.toContain('cookie=session-secret')
    expect(serialized).not.toContain('export OPENAI_API_KEY')
    expect(serialized).not.toContain('outputBuffer')
    expect(serialized).not.toContain('env')
    expect(serialized).not.toContain('command')
    expect(TerminalWarningPayloadSchema.safeParse(warnings[0]).success).toBe(true)
})
```

- [ ] **Step 2: Run focused test**

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: pass; if `env` false-positive appears because of normal text, assert forbidden exact secret keys instead.

---

### Task 3: Lifecycle log sanitizer regression

**Files:**
- Modify: `cli/src/terminal/TerminalManager.test.ts`
- Modify if needed: `cli/src/terminal/TerminalManager.ts`

- [ ] **Step 1: Mock logger and spawn error with secret**

Append:

```ts
it('sanitizes lifecycle log errors without message stack cwd env or output secrets', () => {
    const originalDebug = logger.debug
    const logs: unknown[] = []
    logger.debug = ((message: string, metadata?: unknown) => {
        logs.push({ message, metadata })
    }) as typeof logger.debug

    try {
        Bun.spawn = (() => {
            const error = new Error('spawn failed token=SECRET_TOKEN cwd=/secret/project') as Error & { code?: string }
            error.code = 'EACCES'
            error.stack = 'stack with SECRET_STACK and OPENAI_API_KEY=sk-secret'
            throw error
        }) as unknown as typeof Bun.spawn

        const errors: string[] = []
        const manager = new TerminalManager({
            sessionId: 'session-1',
            getSessionPath: () => '/tmp/secret-project',
            onReady: () => {},
            onOutput: () => {},
            onExit: () => {},
            onError: (payload) => errors.push(payload.message),
            idleTimeoutMs: 0
        })

        manager.create('terminal-1', 80, 24)

        const serialized = JSON.stringify(logs)
        expect(errors).toEqual(['Failed to spawn terminal.'])
        expect(serialized).toContain('EACCES')
        expect(serialized).not.toContain('SECRET_TOKEN')
        expect(serialized).not.toContain('SECRET_STACK')
        expect(serialized).not.toContain('sk-secret')
        expect(serialized).not.toContain('/tmp/secret-project')
        expect(serialized).not.toContain('/secret/project')
        expect(serialized).not.toContain('message')
        expect(serialized).not.toContain('stack')
    } finally {
        logger.debug = originalDebug
    }
})
```

Add import at top if missing:

```ts
import { logger } from '@/ui/logger'
```

- [ ] **Step 2: If test fails, patch only sanitizer/log metadata**

Allowed fix in `TerminalManager.ts`:

```ts
function sanitizeTerminalError(error: unknown): { name?: string; code?: string } {
    if (!(error instanceof Error)) return {}
    const errorWithCode = error as Error & { code?: unknown }
    const code = typeof errorWithCode.code === 'string' ? errorWithCode.code : undefined
    return { name: error.name, code }
}
```

Do not add raw error, message, stack, cwd, env, output, or command to log metadata.

- [ ] **Step 3: Run focused test**

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: pass.

---

### Task 4: Cleanup clears replay buffer for all close paths

**Files:**
- Modify: `cli/src/terminal/TerminalManager.test.ts`

- [ ] **Step 1: Add helper and tests for user/archive/process-exit/hard cleanup**

Append:

```ts
it('clears replay buffers for user archive hard-timeout and process-exit cleanup paths', () => {
    const reasons: Array<{
        name: string
        close: (manager: TerminalManager, fakeSpawn: ReturnType<typeof installFakeSpawn>, setNow: (value: number) => void) => void
    }> = [
        { name: 'user', close: (manager) => manager.close('terminal-1') },
        { name: 'archive', close: (manager) => manager.closeAll() },
        { name: 'hard', close: (manager, _fakeSpawn, setNow) => { setNow(2_000); manager.checkLifecycleTimeouts() } },
        { name: 'process_exit', close: (_manager, fakeSpawn) => fakeSpawn.emitExit(0) }
    ]

    for (const item of reasons) {
        let now = 1_000
        const fakeSpawn = installFakeSpawn()
        const outputs: string[] = []
        const manager = new TerminalManager({
            sessionId: `session-${item.name}`,
            getSessionPath: () => '/tmp',
            onReady: () => {},
            onOutput: (payload) => outputs.push(payload.data),
            onExit: () => {},
            onError: () => {},
            idleTimeoutMs: 0,
            hardLifetimeMs: 1_000,
            now: () => now
        })

        manager.create('terminal-1', 80, 24)
        fakeSpawn.emitData(`secret output ${item.name}\n`)
        item.close(manager, fakeSpawn, (value) => { now = value })
        outputs.length = 0
        manager.create('terminal-1', 80, 24, undefined, true)

        expect(outputs, item.name).toEqual([])
        expect(JSON.stringify(manager.list()), item.name).not.toContain('secret output')
    }
})
```

- [ ] **Step 2: Run focused test**

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
```

Expected: pass.

---

### Task 5: Shared schema no-raw-fields regression

**Files:**
- Modify: `shared/src/socket.test.ts`

- [ ] **Step 1: Add exact schema reject check if absent**

Append:

```ts
it('rejects raw terminal output fields in state payloads', () => {
    const payload = {
        scopeType: 'session',
        sessionId: 'session-1',
        terminals: [{
            scopeType: 'session',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            label: 'Terminal 1',
            cwd: '/tmp',
            cols: 80,
            rows: 24,
            status: 'running',
            closeReason: null,
            createdAt: 1,
            lastActivityAt: 1,
            idleWarningAt: null,
            hardExpiresAt: 2,
            outputBuffer: 'secret',
            data: 'typed secret',
            env: { OPENAI_API_KEY: 'sk-secret' },
            command: 'export TOKEN=secret'
        }]
    }

    expect(TerminalListPayloadSchema.safeParse(payload).success).toBe(false)
})
```

If current schemas intentionally strip unknown fields rather than fail, patch schemas to `.strict()` for terminal state/list/warning objects so raw fields cannot silently pass validation.

- [ ] **Step 2: Run shared tests**

Run:

```bash
cd shared && bun test src/socket.test.ts
```

Expected: pass.

---

### Task 6: Story 4.3 verification

Run:

```bash
cd cli && bun test src/terminal/TerminalManager.test.ts
cd shared && bun test src/socket.test.ts
bun run typecheck
```

Expected:
- CLI terminal tests pass.
- Shared socket tests pass.
- Typecheck passes.

Do not claim completion unless all commands above have fresh passing output.
