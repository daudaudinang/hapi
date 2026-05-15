# Session Recovery Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a crashed Codex/OpenCode session is resumed, inject prior conversation history as `developerInstructions` (Codex) or message prepend (OpenCode) so the LLM continues from where it left off.

**Architecture:** Hub extracts user+agent messages from old session → builds formatted context → passes via spawn RPC → CLI encodes as base64 CLI arg → launcher injects into first thread/turn. Codex uses `developerInstructions` in `buildThreadStartParams`; OpenCode prepends to first user message.

**Tech Stack:** TypeScript, Bun, Zod (validation), Vitest (testing), better-sqlite3 (DB)

---

### Task 1: `buildRecoveryContext()` — core parser

**Files:**
- Create: `hub/src/sync/recoveryContext.ts`
- Create: `hub/src/sync/recoveryContext.test.ts`

- [ ] **Step 1: Write failing test with fixture messages**

Create `hub/src/sync/recoveryContext.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildRecoveryContext } from './recoveryContext'
import type { StoredMessage } from '../store/types'

function msg(overrides: Partial<StoredMessage> = {}): StoredMessage {
    return {
        id: 'msg-1',
        sessionId: 's1',
        content: null,
        createdAt: Date.now(),
        seq: 1,
        localId: null,
        invokedAt: null,
        ...overrides
    }
}

describe('buildRecoveryContext', () => {
    it('returns null for empty messages', () => {
        expect(buildRecoveryContext([])).toBeNull()
    })

    it('returns null when no user messages found', () => {
        const messages: StoredMessage[] = [
            msg({ content: { role: 'agent', content: { type: 'codex', data: { type: 'message', text: 'hello' } } } })
        ]
        expect(buildRecoveryContext(messages)).toBeNull()
    })

    it('builds context from user + agent messages', () => {
        const messages: StoredMessage[] = [
            msg({ seq: 1, content: { role: 'user', content: { type: 'text', text: 'Write a test' } } }),
            msg({ seq: 2, content: { role: 'agent', content: { type: 'codex', data: { type: 'message', text: 'I wrote the test' } } } }),
            msg({ seq: 3, content: { role: 'agent', content: { type: 'codex', data: { type: 'message', text: 'Tests pass' } } } }),
        ]
        const ctx = buildRecoveryContext(messages)
        expect(ctx).not.toBeNull()
        expect(ctx!).toContain('[Previous session context')
        expect(ctx!).toContain('User:')
        expect(ctx!).toContain('Write a test')
        expect(ctx!).toContain('Agent:')
        expect(ctx!).toContain('I wrote the test')
        expect(ctx!).toContain('Tests pass')
        expect(ctx!).toContain('--- End of recovered context ---')
    })

    it('groups multiple turns correctly', () => {
        const messages: StoredMessage[] = [
            msg({ seq: 1, content: { role: 'user', content: { type: 'text', text: 'Task 1' } } }),
            msg({ seq: 2, content: { role: 'agent', content: { type: 'codex', data: { type: 'message', text: 'Doing task 1' } } } }),
            msg({ seq: 3, content: { role: 'user', content: { type: 'text', text: 'Task 2' } } }),
            msg({ seq: 4, content: { role: 'agent', content: { type: 'codex', data: { type: 'message', text: 'Doing task 2' } } } }),
        ]
        const ctx = buildRecoveryContext(messages)
        expect(ctx!).toContain('Task 1')
        expect(ctx!).toContain('Task 2')
        // Two User: sections
        const userCount = (ctx!.match(/^User:$/gm) || []).length
        expect(userCount).toBe(2)
    })

    it('skips tool-call, tool-call-result, reasoning, token_count', () => {
        const messages: StoredMessage[] = [
            msg({ seq: 1, content: { role: 'user', content: { type: 'text', text: 'Hello' } } }),
            msg({ seq: 2, content: { role: 'agent', content: { type: 'codex', data: { type: 'tool-call', name: 'read' } } } }),
            msg({ seq: 3, content: { role: 'agent', content: { type: 'codex', data: { type: 'tool-call-result', output: '...' } } } }),
            msg({ seq: 4, content: { role: 'agent', content: { type: 'codex', data: { type: 'reasoning', text: '...' } } } }),
            msg({ seq: 5, content: { role: 'agent', content: { type: 'codex', data: { type: 'token_count', count: 500 } } } }),
            msg({ seq: 6, content: { role: 'agent', content: { type: 'codex', data: { type: 'message', text: 'Done' } } } }),
        ]
        const ctx = buildRecoveryContext(messages)
        expect(ctx!).toContain('Hello')
        expect(ctx!).toContain('Done')
        expect(ctx!).not.toContain('tool-call')
        expect(ctx!).not.toContain('tool-call-result')
        expect(ctx!).not.toContain('reasoning')
        expect(ctx!).not.toContain('token_count')
    })

    it('includes event messages', () => {
        const messages: StoredMessage[] = [
            msg({ seq: 1, content: { role: 'user', content: { type: 'text', text: 'Hi' } } }),
            msg({ seq: 2, content: { role: 'agent', content: { type: 'event', data: { type: 'message', text: 'Task failed: 429' } } } }),
        ]
        const ctx = buildRecoveryContext(messages)
        expect(ctx!).toContain('Task failed: 429')
    })

    it('silently skips malformed messages', () => {
        const messages: StoredMessage[] = [
            msg({ seq: 1, content: { role: 'user', content: { type: 'text', text: 'Hi' } } }),
            msg({ seq: 2, content: 'not-an-object' }),
            msg({ seq: 3, content: null }),
            msg({ seq: 4, content: { role: 'user' } }), // missing content.type
            msg({ seq: 5, content: { role: 'agent', content: { type: 'codex', data: { type: 'message', text: 'Still works' } } } }),
        ]
        const ctx = buildRecoveryContext(messages)
        expect(ctx!).toContain('Hi')
        expect(ctx!).toContain('Still works')
    })

    it('handles user message without subsequent agent responses', () => {
        const messages: StoredMessage[] = [
            msg({ seq: 1, content: { role: 'user', content: { type: 'text', text: 'Solo question' } } }),
        ]
        const ctx = buildRecoveryContext(messages)
        expect(ctx!).toContain('Solo question')
        expect(ctx!).not.toContain('Agent:')
    })

    it('returns null for messages with only skipped types', () => {
        const messages: StoredMessage[] = [
            msg({ seq: 1, content: { role: 'agent', content: { type: 'codex', data: { type: 'token_count', count: 100 } } } }),
            msg({ seq: 2, content: { role: 'agent', content: { type: 'codex', data: { type: 'reasoning', text: '...' } } } }),
        ]
        expect(buildRecoveryContext(messages)).toBeNull()
    })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd hub && bun test src/sync/recoveryContext.test.ts
```

Expected: FAIL — `Cannot find module './recoveryContext'`

- [ ] **Step 3: Implement `buildRecoveryContext()`**

Create `hub/src/sync/recoveryContext.ts`:

```typescript
import type { StoredMessage } from '../store/types'

interface ParsedTurn {
    userText: string
    agentTexts: string[]
}

function safeGet(obj: unknown, path: string[]): unknown {
    let current: unknown = obj
    for (const key of path) {
        if (current === null || current === undefined || typeof current !== 'object') {
            return undefined
        }
        current = (current as Record<string, unknown>)[key]
    }
    return current
}

function safeGetString(obj: unknown, path: string[]): string | undefined {
    const val = safeGet(obj, path)
    return typeof val === 'string' ? val : undefined
}

const HEADER = '[Previous session context - recovered after crash]'
const FOOTER = '--- End of recovered context ---'

export function buildRecoveryContext(messages: StoredMessage[]): string | null {
    const turns: ParsedTurn[] = []
    let currentTurn: ParsedTurn | null = null

    for (const message of messages) {
        try {
            const content = message.content
            if (content === null || content === undefined || typeof content !== 'object') continue

            const record = content as Record<string, unknown>
            const role = typeof record.role === 'string' ? record.role : undefined
            if (!role) continue

            if (role === 'user') {
                const innerContent = record.content
                if (!innerContent || typeof innerContent !== 'object') continue
                const innerType = (innerContent as Record<string, unknown>).type
                if (innerType !== 'text') continue
                const text = typeof (innerContent as Record<string, unknown>).text === 'string'
                    ? (innerContent as Record<string, unknown>).text as string
                    : undefined
                if (!text) continue

                // Start new turn
                currentTurn = { userText: text, agentTexts: [] }
                turns.push(currentTurn)
                continue
            }

            if (role === 'agent') {
                if (!currentTurn) continue // agent message before any user message — skip

                const innerContent = record.content
                if (!innerContent || typeof innerContent !== 'object') continue
                const innerRecord = innerContent as Record<string, unknown>
                const innerType = innerRecord.type

                if (innerType === 'codex' || innerType === 'event') {
                    const data = innerRecord.data
                    if (!data || typeof data !== 'object') continue
                    const dataType = (data as Record<string, unknown>).type
                    if (dataType !== 'message') continue
                    const text = typeof (data as Record<string, unknown>).text === 'string'
                        ? (data as Record<string, unknown>).text as string
                        : undefined
                    if (!text) continue
                    currentTurn.agentTexts.push(text)
                }
                // else: skip reasoning, token_count, tool-call, tool-call-result etc.
            }
        } catch {
            // Malformed message — silently skip
        }
    }

    if (turns.length === 0) return null

    let ctx = `${HEADER}\n\n`
    for (const turn of turns) {
        ctx += `User:\n${turn.userText}\n\n`
        if (turn.agentTexts.length > 0) {
            ctx += `Agent:\n${turn.agentTexts.join('\n')}\n\n`
        }
    }
    ctx += FOOTER

    return ctx
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd hub && bun test src/sync/recoveryContext.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add hub/src/sync/recoveryContext.ts hub/src/sync/recoveryContext.test.ts
git commit -m "feat: add buildRecoveryContext() to extract conversation history from messages"
```

---

### Task 2: `getAllSessionMessages()` wrapper

**Files:**
- Modify: `hub/src/sync/messageService.ts`

- [ ] **Step 1: Add `getAllSessionMessages` method**

In `hub/src/sync/messageService.ts`, after the existing `getMessagesAfter` method (line ~135), add:

```typescript
    /**
     * Fetch all messages for a session up to maxLimit (for recovery context generation).
     * Returns messages in chronological order (oldest first).
     */
    getAllSessionMessages(sessionId: string, maxLimit: number = 1000): StoredMessage[] {
        return this.store.messages.getMessages(sessionId, maxLimit)
    }
```

Need to add the import at top if not already present:
```typescript
import type { StoredMessage } from '../store/types'
```

Check if `StoredMessage` is already imported in `messageService.ts`. If not, add it.

- [ ] **Step 2: Verify typecheck**

```bash
cd hub && bun run typecheck 2>&1 | head -20
```

Or:
```bash
cd /home/huynq/notebooks/hapi && bun typecheck 2>&1 | grep -i "messageService\|error" | head -20
```

Expected: No type errors related to messageService.

- [ ] **Step 3: Commit**

```bash
git add hub/src/sync/messageService.ts
git commit -m "feat: add getAllSessionMessages() for fetching full session message history"
```

---

### Task 3: Hub plumbing — pass recoveryContext through spawn

**Files:**
- Modify: `cli/src/modules/common/rpcTypes.ts`
- Modify: `hub/src/sync/rpcGateway.ts`
- Modify: `hub/src/sync/syncEngine.ts`

- [ ] **Step 1: Add `recoveryContext` to `SpawnSessionOptions`**

In `cli/src/modules/common/rpcTypes.ts`, add one field:

```typescript
export interface SpawnSessionOptions {
    machineId?: string
    directory: string
    sessionId?: string
    resumeSessionId?: string
    approvedNewDirectoryCreation?: boolean
    agent?: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode'
    model?: string
    effort?: string
    modelReasoningEffort?: string
    yolo?: boolean
    permissionMode?: string
    token?: string
    sessionType?: 'simple' | 'worktree'
    worktreeName?: string
    recoveryContext?: string  // NEW
}
```

- [ ] **Step 2: Add `recoveryContext` to `rpcGateway.spawnSession()`**

In `hub/src/sync/rpcGateway.ts`, modify the `spawnSession` method:

**Signature change** (line ~229): add `recoveryContext?: string` param:

```typescript
    async spawnSession(
        machineId: string,
        directory: string,
        agent: 'claude' | 'codex' | 'cursor' | 'gemini' | 'opencode' = 'claude',
        model?: string,
        modelReasoningEffort?: string,
        yolo?: boolean,
        sessionType?: 'simple' | 'worktree',
        worktreeName?: string,
        resumeSessionId?: string,
        effort?: string,
        permissionMode?: PermissionMode,
        recoveryContext?: string  // NEW
    ): Promise<{ type: 'success'; sessionId: string } | { type: 'error'; message: string }> {
```

**Payload construction** (line ~246): add `recoveryContext` to the RPC payload:

```typescript
            const result = await this.machineRpc(
                machineId,
                'spawn-happy-session',
                { type: 'spawn-in-directory', directory, agent, model, modelReasoningEffort, yolo, sessionType, worktreeName, resumeSessionId, effort, permissionMode, recoveryContext }
            )
```

- [ ] **Step 3: Build recovery context in `syncEngine.resumeSession()`**

In `hub/src/sync/syncEngine.ts`, modify the `resumeSession` method. 

First, add the import at top:

```typescript
import { buildRecoveryContext } from './recoveryContext'
```

Then, in `resumeSession()`, after the existing access check and before `spawnSession` call (~line 515-520), add:

```typescript
        // Build recovery context from old session messages (before any merge)
        // Gate to codex + opencode only (Claude handles its own resume; Cursor not verified)
        const recoveryContext = (flavor === 'codex' || flavor === 'opencode')
            ? (() => {
                const oldMessages = this.messageService.getAllSessionMessages(access.sessionId, 500)
                return buildRecoveryContext(oldMessages) ?? undefined
              })()
            : undefined
```

Then, modify the `spawnSession` call to pass `recoveryContext`:

```typescript
        const spawnResult = await this.rpcGateway.spawnSession(
            targetMachine.id,
            metadata.path,
            flavor,
            session.model ?? undefined,
            session.modelReasoningEffort ?? undefined,
            undefined,
            undefined,
            undefined,
            resumeToken,
            session.effort ?? undefined,
            effectivePermissionMode,
            recoveryContext  // NEW
        )
```

- [ ] **Step 4: Update `syncEngine.spawnSession()` to pass through**

In `hub/src/sync/syncEngine.ts`, the `spawnSession` wrapper method (~line 433) currently calls `this.rpcGateway.spawnSession(...)`. Add `recoveryContext` to the delegate call. Since normal (non-resume) spawns don't have recovery context, pass `undefined`:

In the wrapper `spawnSession` method, the existing call is around line 446. No change needed since normal spawns don't pass recoveryContext. But if the wrapper signature also needs updating for future use, leave it for now — YAGNI.

- [ ] **Step 5: Verify typecheck across all packages**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add cli/src/modules/common/rpcTypes.ts hub/src/sync/rpcGateway.ts hub/src/sync/syncEngine.ts
git commit -m "feat: pass recoveryContext through hub spawn flow to CLI"
```

---

### Task 4: CLI runner — encode recoveryContext as base64 CLI arg

**Files:**
- Modify: `cli/src/runner/run.ts`

- [ ] **Step 1: Add `--recovery-context` to `buildCliArgs`**

In `cli/src/runner/run.ts`, in the `buildCliArgs` function (line ~923), add before the `return args`:

```typescript
  if (options.recoveryContext) {
    const encoded = Buffer.from(options.recoveryContext).toString('base64')
    args.push('--recovery-context', encoded)
  }
```

- [ ] **Step 2: Verify typecheck**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck 2>&1 | grep -i "error" | head -10
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add cli/src/runner/run.ts
git commit -m "feat: encode recoveryContext as base64 CLI arg in runner"
```

---

### Task 5: Codex chain — parse arg → loop → launcher → inject

**Files:**
- Modify: `cli/src/commands/codex.ts`
- Modify: `cli/src/codex/runCodex.ts`
- Modify: `cli/src/codex/loop.ts`
- Modify: `cli/src/codex/codexRemoteLauncher.ts`
- Modify: `cli/src/codex/codexLocalLauncher.ts`

- [ ] **Step 1: Parse `--recovery-context` in `codex.ts`**

In `cli/src/commands/codex.ts`, add `recoveryContext` to the options type and add arg parsing.

**Options type** — add field:
```typescript
            const options: {
                startedBy?: 'runner' | 'terminal'
                codexArgs?: string[]
                permissionMode?: CodexPermissionMode
                resumeSessionId?: string
                model?: string
                modelReasoningEffort?: ReasoningEffort
                recoveryContext?: string  // NEW
            } = {}
```

**Arg parsing** — add an `else if` branch before the final `else` (before `unknownArgs.push(arg)`):
```typescript
                } else if (arg === '--recovery-context') {
                    const encoded = commandArgs[++i]
                    if (encoded) {
                        try {
                            options.recoveryContext = Buffer.from(encoded, 'base64').toString('utf-8')
                        } catch {
                            // Malformed base64 — silently ignore, session starts fresh
                        }
                    }
                } else {
                    unknownArgs.push(arg)
                }
```

- [ ] **Step 2: Pass `recoveryContext` through `runCodex.ts`**

In `cli/src/codex/runCodex.ts`:

**Opts type** — add field:
```typescript
export async function runCodex(opts: {
    startedBy?: 'runner' | 'terminal';
    codexArgs?: string[];
    permissionMode?: PermissionMode;
    resumeSessionId?: string;
    model?: string;
    modelReasoningEffort?: ReasoningEffort;
    recoveryContext?: string;  // NEW
}): Promise<void> {
```

**loop() call** — add `recoveryContext` to the call (near line ~120):
```typescript
        await loop({
            path: workingDirectory,
            startingMode,
            messageQueue,
            api,
            session,
            codexArgs: opts.codexArgs,
            codexCliOverrides,
            startedBy,
            permissionMode: currentPermissionMode,
            model: currentModel,
            modelReasoningEffort: currentModelReasoningEffort,
            collaborationMode: currentCollaborationMode,
            resumeSessionId: opts.resumeSessionId,
            recoveryContext: opts.recoveryContext,  // NEW
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                applyCurrentConfigToSession();
            }
        });
```

- [ ] **Step 3: Pass through `loop.ts` to launchers**

In `cli/src/codex/loop.ts`:

**`LoopOptions` interface** — add field:
```typescript
interface LoopOptions {
    path: string;
    startingMode?: 'local' | 'remote';
    startedBy?: 'runner' | 'terminal';
    onModeChange: (mode: 'local' | 'remote') => void;
    messageQueue: MessageQueue2<EnhancedMode>;
    session: ApiSessionClient;
    api: ApiClient;
    codexArgs?: string[];
    codexCliOverrides?: CodexCliOverrides;
    permissionMode?: PermissionMode;
    model?: string;
    modelReasoningEffort?: ReasoningEffort;
    collaborationMode?: CodexCollaborationMode;
    resumeSessionId?: string;
    recoveryContext?: string;  // NEW
    onSessionReady?: (session: CodexSession) => void;
}
```

**`runLocalRemoteSession` call** — change function references to arrow functions:
```typescript
    await runLocalRemoteSession({
        session,
        startingMode: opts.startingMode,
        logTag: 'codex-loop',
        runLocal: (session) => codexLocalLauncher(session, opts.recoveryContext),
        runRemote: (session) => codexRemoteLauncher(session, opts.recoveryContext),
        onSessionReady: opts.onSessionReady
    });
```

- [ ] **Step 4: Inject into `codexRemoteLauncher.ts`**

In `cli/src/codex/codexRemoteLauncher.ts`:

**Function signature** (line ~951) — add `recoveryContext` param:
```typescript
export async function codexRemoteLauncher(session: CodexSession, recoveryContext?: string): Promise<'switch' | 'exit'> {
    const launcher = new CodexRemoteLauncher(session, recoveryContext);
    return launcher.launch();
}
```

**Constructor** (line ~55) — add `recoveryContext` param and store it:
```typescript
    private recoveryContext: string | null = null

    constructor(session: CodexSession, recoveryContext?: string) {
        super(process.env.DEBUG ? session.logPath : undefined);
        this.session = session;
        this.appServerClient = new CodexAppServerClient();
        this.recoveryContext = recoveryContext ?? null;
    }
```

**`runMainLoop`** — in the `if (!hasThread)` block (line ~804), add `developerInstructions` to `buildThreadStartParams`:
```typescript
                if (!hasThread) {
                    const threadParams = buildThreadStartParams({
                        cwd: session.path,
                        mode: message.mode,
                        mcpServers,
                        cliOverrides: session.codexCliOverrides,
                        developerInstructions: this.recoveryContext ?? undefined  // NEW
                    });
                    // ... rest unchanged ...
```

**Consume after first thread creation** — after the `!hasThread` block closes (after `hasThread = true` is set, around line ~855), add:
```typescript
                    // Consume recovery context after first successful thread creation
                    if (hasThread && this.recoveryContext) {
                        this.recoveryContext = null
                    }
```

The exact location: after the `if (!hasThread) { ... }` block's closing `}`, before the turn logic. Find the code that looks like:

```typescript
                if (!hasThread) {
                    // ... thread creation ...
                    hasThread = true;
                }

                // Turn logic follows...
```

Add the consumption right after the `}`:
```typescript
                }

                // Consume recovery context after first successful thread creation
                if (hasThread && this.recoveryContext) {
                    this.recoveryContext = null
                }

                // ... turn logic ...
```

- [ ] **Step 5: Add no-op param to `codexLocalLauncher.ts`**

In `cli/src/codex/codexLocalLauncher.ts` (line ~13):

**Function signature** — add unused `_recoveryContext` param:
```typescript
export async function codexLocalLauncher(session: CodexSession, _recoveryContext?: string): Promise<'switch' | 'exit'> {
```

No other changes needed — local mode reads its own transcript.

- [ ] **Step 6: Verify typecheck**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add cli/src/commands/codex.ts cli/src/codex/runCodex.ts cli/src/codex/loop.ts cli/src/codex/codexRemoteLauncher.ts cli/src/codex/codexLocalLauncher.ts
git commit -m "feat: wire recoveryContext through Codex chain into developerInstructions"
```

---

### Task 6: OpenCode chain — parse arg → loop → launcher → prepend

**Files:**
- Modify: `cli/src/commands/opencode.ts`
- Modify: `cli/src/opencode/runOpencode.ts`
- Modify: `cli/src/opencode/loop.ts`
- Modify: `cli/src/opencode/opencodeRemoteLauncher.ts`

- [ ] **Step 1: Parse `--recovery-context` in `opencode.ts`**

In `cli/src/commands/opencode.ts`:

**Options type** — add field:
```typescript
            const options: {
                startedBy?: 'runner' | 'terminal'
                startingMode?: 'local' | 'remote'
                permissionMode?: OpencodePermissionMode
                model?: string
                modelReasoningEffort?: string
                resumeSessionId?: string
                recoveryContext?: string  // NEW
            } = {}
```

**Arg parsing** — add `else if` before the closing `}` of the for loop:
```typescript
                } else if (arg === '--recovery-context') {
                    const encoded = commandArgs[++i]
                    if (encoded) {
                        try {
                            options.recoveryContext = Buffer.from(encoded, 'base64').toString('utf-8')
                        } catch {
                            // Malformed base64 — silently ignore, session starts fresh
                        }
                    }
                }
```

- [ ] **Step 2: Pass through `runOpencode.ts`**

In `cli/src/opencode/runOpencode.ts`:

**Opts type** — add field:
```typescript
export async function runOpencode(opts: {
    startedBy?: 'runner' | 'terminal';
    startingMode?: 'local' | 'remote';
    permissionMode?: PermissionMode;
    model?: string;
    modelReasoningEffort?: string;
    resumeSessionId?: string;
    recoveryContext?: string;  // NEW
} = {}): Promise<void> {
```

**`opencodeLoop` call** (line ~174) — add `recoveryContext`:
```typescript
        await opencodeLoop({
            path: workingDirectory,
            startingMode,
            startedBy,
            messageQueue,
            session,
            api,
            permissionMode: currentPermissionMode,
            model: sessionModel ?? undefined,
            modelReasoningEffort: sessionModelReasoningEffort ?? undefined,
            resumeSessionId: opts.resumeSessionId,
            recoveryContext: opts.recoveryContext,  // NEW
            hookServer,
            hookUrl,
            onModeChange: createModeChangeHandler(session),
            onSessionReady: (instance) => {
                sessionWrapperRef.current = instance;
                syncSessionMode();
            }
        });
```

- [ ] **Step 3: Pass through `loop.ts` to launcher**

In `cli/src/opencode/loop.ts`:

**`OpencodeLoopOptions` interface** — add field:
```typescript
interface OpencodeLoopOptions {
    path: string;
    startingMode?: 'local' | 'remote';
    startedBy?: 'runner' | 'terminal';
    onModeChange: (mode: 'local' | 'remote') => void;
    messageQueue: MessageQueue2<OpencodeMode>;
    session: ApiSessionClient;
    api: ApiClient;
    permissionMode?: PermissionMode;
    model?: string;
    modelReasoningEffort?: string;
    resumeSessionId?: string;
    recoveryContext?: string;  // NEW
    hookServer: OpencodeHookServer;
    hookUrl: string;
    onSessionReady?: (session: OpencodeSession) => void;
}
```

**`runLocalRemoteSession` call** — change `runRemote` to arrow function passing `recoveryContext`:
```typescript
    await runLocalRemoteSession({
        session,
        startingMode: opts.startingMode,
        logTag: 'opencode-loop',
        runLocal: (instance) => opencodeLocalLauncher(instance, {
            hookServer: opts.hookServer,
            hookUrl: opts.hookUrl
        }),
        runRemote: (instance) => opencodeRemoteLauncher(instance, opts.recoveryContext),
        onSessionReady: opts.onSessionReady
    });
```

- [ ] **Step 4: Inject via message prepend in `opencodeRemoteLauncher.ts`**

In `cli/src/opencode/opencodeRemoteLauncher.ts`:

**Constructor** (line ~55) — add `recoveryContext` param:
```typescript
    private recoveryContext: string | null = null
    private recoveryContextConsumed = false

    constructor(session: OpencodeSession, recoveryContext?: string) {
        super(process.env.DEBUG ? session.logPath : undefined);
        this.session = session;
        this.recoveryContext = recoveryContext ?? null;
    }
```

**Function export** (bottom of file) — add param:
```typescript
export async function opencodeRemoteLauncher(
    session: OpencodeSession,
    recoveryContext?: string
): Promise<'switch' | 'exit'> {
    const launcher = new OpencodeRemoteLauncher(session, recoveryContext);
    return launcher.launch();
}
```

**Message prepend** — modify the first-prompt injection block (~line 200). Current code:
```typescript
            let messageText = batch.message;
            if (!this.instructionsSent) {
                messageText = `${TITLE_INSTRUCTION}\n\n${batch.message}`;
                this.instructionsSent = true;
            }
```

Replace with:
```typescript
            let messageText = batch.message;
            if (!this.instructionsSent) {
                const parts: string[] = [TITLE_INSTRUCTION]
                if (this.recoveryContext && !this.recoveryContextConsumed) {
                    parts.push(this.recoveryContext)
                    this.recoveryContextConsumed = true
                }
                parts.push(batch.message)
                messageText = parts.join('\n\n')
                this.instructionsSent = true
            }
```

- [ ] **Step 5: Verify typecheck**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck 2>&1 | tail -20
```

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add cli/src/commands/opencode.ts cli/src/opencode/runOpencode.ts cli/src/opencode/loop.ts cli/src/opencode/opencodeRemoteLauncher.ts
git commit -m "feat: wire recoveryContext through OpenCode chain into message prepend"
```

---

### Task 7: End-to-end verification

**Files:** None (verification only)

- [ ] **Step 1: Run all existing tests**

```bash
cd /home/huynq/notebooks/hapi && bun run test 2>&1 | tail -30
```

Expected: All existing tests pass (no regression).

- [ ] **Step 2: Run recoveryContext unit tests**

```bash
cd hub && bun test src/sync/recoveryContext.test.ts
```

Expected: ALL PASS.

- [ ] **Step 3: Full typecheck**

```bash
cd /home/huynq/notebooks/hapi && bun typecheck
```

Expected: No errors across all packages.

- [ ] **Step 4: Manual verification checklist**

For manual testing after deployment:

1. Start a Codex remote session, send a message, let it respond
2. Kill the session (simulate crash)
3. Click "Tiếp tục" from web UI
4. Verify the new session's first thread includes recovery context via `developerInstructions`
   - Check hub logs or inspect the `thread/start` payload
5. Send "What were we working on?" → LLM should reference prior conversation
6. Repeat for OpenCode session

- [ ] **Step 5: Commit any final adjustments**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: end-to-end verification of session recovery context"
```
