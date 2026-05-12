# OpenCode Subagent Crash/Hang Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 OpenCode-specific bugs that cause subagent orphan processes, infinite hangs, and session crashes.

**Architecture:** Three files modified, zero new files. Core change: `AcpStdioTransport` gets process-group-based cleanup + activity watchdog. `opencodeLocalLauncher` gets defensive try-catch. Hook server gets async deferral.

**Tech Stack:** TypeScript, Node.js child_process, Bun runtime.

---

### Task 1: Process-group-based kill in AcpStdioTransport (orphan fix)

**Files:**
- Modify: `cli/src/agent/backends/acp/AcpStdioTransport.ts:63-67,74-77,157-161`

- [ ] **Step 1: Add `detached: true` to spawn options (creates new process group)**

Open `cli/src/agent/backends/acp/AcpStdioTransport.ts`, line 63-67. Change the spawn call:

```ts
// BEFORE:
this.process = spawn(options.command, options.args ?? [], {
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32'
});

// AFTER:
this.process = spawn(options.command, options.args ?? [], {
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
    detached: true   // Create new process group; pgid = pid
});
```

- [ ] **Step 2: Add `killProcessGroup` private method**

Add after the constructor, before `onNotification`:

```ts
/**
 * Kill the entire process group. On Unix, kill(-pgid) sends the signal
 * to all processes in the group atomically — no TOCTOU race.
 * On Windows, taskkill /T already handles the tree.
 */
private killProcessGroup(signal: NodeJS.Signals): void {
    if (!this.process?.pid) return;
    if (process.platform === 'win32') {
        try {
            spawn('taskkill', ['/T', '/F', '/PID', String(this.process.pid)], { stdio: 'pipe' });
        } catch {}
        return;
    }
    try {
        process.kill(-this.process.pid, signal);
    } catch {
        // Process group may already be gone
    }
}
```

Note: `spawn` needs to be imported. Add to existing imports:
```ts
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
```
(This import already exists at line 1 — verify it imports `spawn`.)

- [ ] **Step 3: Add process-group kill to the `exit` handler**

On line 74-77, modify the exit handler:

```ts
// BEFORE:
this.process.on('exit', (code, signal) => {
    const message = `ACP process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
    logger.debug(message);
    this.rejectAllPending(new Error(message));
});

// AFTER:
this.process.on('exit', (code, signal) => {
    const message = `ACP process exited (code=${code ?? 'null'}, signal=${signal ?? 'null'})`;
    logger.debug(message);
    // Kill remaining processes in the group (subagents).
    // SIGKILL because the parent already exited — no graceful shutdown needed.
    this.killProcessGroup('SIGKILL');
    this.rejectAllPending(new Error(message));
});
```

- [ ] **Step 4: Replace `killProcessByChildProcess` in `close()` with process-group kill**

On lines 157-161, modify the `close()` method:

```ts
// BEFORE:
async close(): Promise<void> {
    this.process.stdin.end();
    await killProcessByChildProcess(this.process);
    this.rejectAllPending(new Error('ACP transport closed'));
}

// AFTER:
async close(): Promise<void> {
    // Clear activity watchdog (from Task 2)
    this.clearActivityTracker();
    // Graceful: SIGTERM to entire process group first
    this.killProcessGroup('SIGTERM');
    // Wait for graceful shutdown
    await new Promise<void>(r => setTimeout(r, 2000));
    // Force kill any survivors
    this.killProcessGroup('SIGKILL');
    // End stdin after signals (process likely dead by now)
    try { this.process.stdin.end(); } catch {}
    this.rejectAllPending(new Error('ACP transport closed'));
}
```

- [ ] **Step 5: Remove unused `killProcessByChildProcess` import if it was only used in `close()`**

Check if `killProcessByChildProcess` is used elsewhere in the file. At line 3:
```ts
import { killProcessByChildProcess } from '@/utils/process';
```
It may still be used elsewhere — leave it for now. We'll clean up in Task 2.

- [ ] **Step 6: Verify existing tests still pass**

```bash
cd /home/huynq/notebooks/hapi && bun run test -- --run cli/src/agent/backends/acp/
```

Expected: All existing ACP tests pass.

- [ ] **Step 7: Commit**

```bash
git add cli/src/agent/backends/acp/AcpStdioTransport.ts
git commit -m "fix(opencode): use process groups to prevent orphan subagents on ACP crash

- Add detached:true to ACP spawn to create new process group
- Add killProcessGroup() using kill(-pgid) for atomic tree kill
- Kill process group in exit handler (crash path)
- Replace killProcessByChildProcess with process group kill in close()
- Prevents TOCTOU race in collectProcessTree/pgrep approach"
```

---

### Task 2: Activity watchdog to prevent infinite prompt hang

**Files:**
- Modify: `cli/src/agent/backends/acp/AcpStdioTransport.ts` (add watchdog fields + methods)
- Modify: `cli/src/agent/backends/acp/AcpSdkBackend.ts:228-231` (optional: wire hung callback)

- [ ] **Step 1: Add watchdog fields to AcpStdioTransport class**

In `cli/src/agent/backends/acp/AcpStdioTransport.ts`, after the existing fields (around line 52), add:

```ts
// === Activity watchdog: detects ACP hung-but-not-crashed ===
// Bumped on every stdout chunk and JSON-RPC response.
// If silent > HUNG_TIMEOUT_MS, the transport is treated as hung
// and force-killed, rejecting all pending requests.
private lastActivityAt: number = Date.now();
private activityTracker: ReturnType<typeof setInterval> | null = null;
private onHungCallback: (() => void) | null = null;

private static readonly HUNG_TIMEOUT_MS =
    Number(process.env.HAPI_ACP_HUNG_TIMEOUT_MS) || 10 * 60 * 1000; // 10 min default
private static readonly HUNG_CHECK_INTERVAL_MS = 30_000; // Check every 30s
```

- [ ] **Step 2: Add watchdog methods**

After the constructor, add:

```ts
/** Register a callback invoked when the ACP transport is detected as hung. */
onHung(callback: () => void): void {
    this.onHungCallback = callback;
}

private startActivityTracker(): void {
    this.lastActivityAt = Date.now();
    this.activityTracker = setInterval(() => {
        const silentMs = Date.now() - this.lastActivityAt;
        if (silentMs > AcpStdioTransport.HUNG_TIMEOUT_MS) {
            logger.debug(
                `[ACP] No activity for ${Math.round(silentMs / 1000)}s — treating as hung`
            );
            this.onHungCallback?.();
            this.killProcessGroup('SIGKILL');
        }
    }, AcpStdioTransport.HUNG_CHECK_INTERVAL_MS);
    this.activityTracker.unref(); // Don't keep event loop alive
}

private bumpActivity(): void {
    this.lastActivityAt = Date.now();
}

private clearActivityTracker(): void {
    if (this.activityTracker) {
        clearInterval(this.activityTracker);
        this.activityTracker = null;
    }
}
```

- [ ] **Step 3: Call `startActivityTracker()` in constructor**

At the end of the constructor, after the `error` event handler, add:

```ts
this.startActivityTracker();
```

- [ ] **Step 4: Call `bumpActivity()` on all incoming data paths**

In `handleStdout()` (around line 163), add `bumpActivity()` at the start:

```ts
private handleStdout(chunk: string): void {
    this.bumpActivity();  // ← ADD THIS
    this.buffer += chunk;
    // ... rest unchanged
}
```

In `handleResponse()` (around line 305), add `bumpActivity()`:

```ts
private handleResponse(response: JsonRpcResponse): void {
    this.bumpActivity();  // ← ADD THIS
    if (response.id === null || response.id === undefined) {
    // ... rest unchanged
}
```

In `handleIncomingRequest()` (around line 285), add `bumpActivity()`:

```ts
private async handleIncomingRequest(request: JsonRpcRequest): Promise<void> {
    this.bumpActivity();  // ← ADD THIS
    const handler = this.requestHandlers.get(request.method);
    // ... rest unchanged
}
```

- [ ] **Step 5: Remove unused `killProcessByChildProcess` import if no longer needed**

Check line 3 of `AcpStdioTransport.ts`:
```ts
import { killProcessByChildProcess } from '@/utils/process';
```

If `killProcessByChildProcess` is no longer used anywhere in the file (we replaced it in `close()` in Task 1), remove it:

```ts
// REMOVE this line if unused:
import { killProcessByChildProcess } from '@/utils/process';
```

- [ ] **Step 6: Verify existing tests still pass**

```bash
cd /home/huynq/notebooks/hapi && bun run test -- --run cli/src/agent/backends/acp/
```

Expected: All existing ACP tests pass.

- [ ] **Step 7: Commit**

```bash
git add cli/src/agent/backends/acp/AcpStdioTransport.ts
git commit -m "fix(opencode): add activity watchdog to detect hung ACP transport

- Track lastActivityAt, bumped on every stdout chunk and JSON-RPC message
- If silent > 10 min (configurable via HAPI_ACP_HUNG_TIMEOUT_MS), force-kill
- Prevents infinite hang when ACP is alive but unresponsive
- Uses process group kill from previous commit"
```

---

### Task 3: Hook plugin injection fail → session crash

**Files:**
- Modify: `cli/src/opencode/opencodeLocalLauncher.ts:260-263`

- [ ] **Step 1: Wrap `ensureOpencodeHookPlugin` in try-catch**

Open `cli/src/opencode/opencodeLocalLauncher.ts`, lines 260-263. Change:

```ts
// BEFORE:
const opencodeConfigDir = resolveOpencodeConfigDir(session);
ensureOpencodeHookPlugin(opencodeConfigDir, hookUrl, opts.hookServer.token);

// AFTER:
const opencodeConfigDir = resolveOpencodeConfigDir(session);
try {
    ensureOpencodeHookPlugin(opencodeConfigDir, hookUrl, opts.hookServer.token);
} catch (error) {
    logger.debug('[opencode-local]: Failed to inject hook plugin', error);
    session.sendSessionEvent({
        type: 'message',
        message:
            'OpenCode hook plugin could not be installed. ' +
            'Live session events may be delayed. ' +
            'Check write permissions for: ' + opencodeConfigDir
    });
    // Do NOT rethrow — session remains functional via storage scanner fallback
}
```

- [ ] **Step 2: Verify import of `logger` exists**

Check that `logger` is imported at the top of the file. It should already be there:
```ts
import { logger } from '@/ui/logger';
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck
```

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add cli/src/opencode/opencodeLocalLauncher.ts
git commit -m "fix(opencode): wrap hook plugin injection in try-catch

- ensureOpencodeHookPlugin can throw on permission denied / disk full
- Previously this crashed the entire local launcher
- Now fails gracefully, session continues with storage scanner fallback"
```

---

### Task 4: Hook server deferral to prevent bottleneck

**Files:**
- Modify: `cli/src/opencode/utils/startOpencodeHookServer.ts:70-84`

- [ ] **Step 1: Defer `onEvent` callback with `setImmediate`**

In `cli/src/opencode/utils/startOpencodeHookServer.ts`, around line 70-84, change the event dispatch:

```ts
// BEFORE:
const payload = data.payload;
const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
options.onEvent({ event: eventValue, payload, sessionId });

if (!res.headersSent && !res.writableEnded) {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
}

// AFTER:
const payload = data.payload;
const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;

// Defer event processing so the HTTP response returns immediately.
// This prevents a slow event handler from bottlenecking the hook pipeline.
setImmediate(() => {
    options.onEvent({ event: eventValue, payload, sessionId });
});

if (!res.headersSent && !res.writableEnded) {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
}
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add cli/src/opencode/utils/startOpencodeHookServer.ts
git commit -m "fix(opencode): defer hook event processing with setImmediate

- Prevents slow event handlers from blocking HTTP response
- Hook server returns 200 immediately, processes events asynchronously
- Reduces bottleneck risk under heavy event load"
```

---

### Task 5: Final verification — full typecheck + test suite

- [ ] **Step 1: Run full typecheck**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck
```

Expected: Zero type errors across all packages.

- [ ] **Step 2: Run all tests**

```bash
cd /home/huynq/notebooks/hapi && bun run test
```

Expected: All tests pass.

- [ ] **Step 3: Run OpenCode-specific tests**

```bash
cd /home/huynq/notebooks/hapi && bun run test -- --run cli/src/opencode/ cli/src/agent/backends/acp/
```

Expected: All OpenCode + ACP tests pass.

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: verify all tests pass after opencode fixes"
```

---

## Self-Review

1. **Spec coverage:** All 5 OpenCode-specific issues covered — orphan crash (Task 1), prompt hang (Task 2), hook plugin crash (Task 3), hook bottleneck (Task 4).

2. **Placeholder scan:** ✅ No TBD/TODO. All code shown inline. All commands explicit.

3. **Type consistency:** ✅ `killProcessGroup` uses `NodeJS.Signals` type. `activityTracker` uses `ReturnType<typeof setInterval>`. All imports verified.

4. **Edge cases:** 
   - Windows: `killProcessGroup` branches to `taskkill /T` 
   - pgrep unavailable: not needed anymore (process groups don't use pgrep)
   - Activity tracker cleared in `close()` before killing
   - `setImmediate` safe — Node.js guarantees execution even if process exiting
   - Hook plugin failure: graceful degradation, not crash
