# Session Recovery Context Design

Date: 2026-05-12 | Updated: 2026-05-14
Status: Final

## Problem

When a Codex or OpenCode session crashes (e.g., 429 Too Many Requests, thread systemError) and user sends "Tiếp tục" (Continue), the LLM loses all conversation context. The resumed session starts a new empty thread, so the LLM cannot continue the previous work.

### Root cause chain

1. `thread/resume` (Codex) or `session/load` (OpenCode) fails because the app-server cannot recover the crashed thread
2. Fallback creates a new empty thread via `thread/start` / `session/new`
3. The new thread has zero conversation history
4. User message "Tiếp tục" arrives with no context → LLM starts fresh, losing all prior work

### Data insight (from real session `2ef485fa`)

- 217 total HAPI messages, but only 1 user + 15 agent chat messages are conversation content
- Chat text totals ~4KB (~1000 tokens) — trivially small, no compaction needed
- 68% of messages are noise: token counts, raw tool outputs, reasoning traces
- **Both Codex and OpenCode use identical message format** (`content.type: "codex"` + `data.type: "message"`)

## Non-goals

- Compacting or summarizing conversation history (chat text is small enough)
- Passing tool call results (too large; single-turn context covers intent)
- Fixing `thread/resume` to work after crash (Codex CLI internal; this is a complementary fix)
- Adding recovery context to Claude flavor (Claude SDK manages its own session state)

## Design

### Key decision: `developerInstructions` injection

Recovery context is injected via `developerInstructions` (Codex) or message prepend (OpenCode).

**Why `developerInstructions` and NOT prepending to user message:**
- `developerInstructions` is a system-level field designed for injecting instructions/context — exactly our use case
- Prepending to user message breaks turn structure: the model treats recovery context as user input
- Codex app-server already processes `developerInstructions` into `developer_instructions` config
- `resolveInstructions()` in `appServerConfig.ts` appends custom instructions to `codexSystemPrompt`, producing a coherent combined instruction

**Critical: Injection point must be BEFORE `resumeThread`/`startThread`**

```
threadParams = buildThreadStartParams({
    ...,
    developerInstructions: recoveryContext  // ← inject here, ONLY ONCE
})

// Both resumeThread and startThread use the SAME threadParams
resumeThread({threadId, ...threadParams})  // resume gets it (ignored if thread has its own context)
startThread(threadParams)                    // fallback gets it (NEW thread — recovery context IS used)
```

This ensures recovery context flows to the new thread regardless of whether resume succeeds or fails.

### Data flow

```
Hub: resumeSession()
  │
  ├─ 1. buildRecoveryContext(oldSessionId)
  │     Extract user messages + agent chat responses from HAPI DB
  │     Format as conversation history
  │
  ├─ 2. Pass recoveryContext in spawn-in-directory RPC (new field)
  │
  └─ 3. CLI receives via --recovery-context arg (base64 encoded)
        │
        ├─ 4. Loop passes recoveryContext to launcher constructor
        │
        └─ 5. Launcher injects into buildThreadStartParams({developerInstructions})
              → flows to BOTH resumeThread AND startThread
              → new thread receives full conversation history in system instructions
```

### Component changes

#### 1. CLI + Hub: spawn payload — new field

```typescript
// cli/src/modules/common/rpcTypes.ts (SpawnSessionOptions) + hub/src/sync/rpcGateway.ts (construct payload)
{
    // ... existing fields ...
    recoveryContext?: string  // NEW: formatted conversation history for crash recovery
}
```

#### 2. Hub: `buildRecoveryContext()` — extract & format

New file: `hub/src/sync/recoveryContext.ts`

```typescript
export function buildRecoveryContext(
    messages: StoredMessage[]
): string | null {
    // Step 1: Parse and filter messages
    // - Extract: role="user" + content.type="text" → user message
    // - Extract: role="agent" + content.type="codex" + data.type="message" → agent response
    // - Extract: role="agent" + content.type="event" + data.type="message" → event message
    // - Skip: reasoning, token_count, tool-call, tool-call-result
    // - Wrap each message parse in try-catch; malformed messages silently skipped

    // Step 2: Group into turns
    // - Each user message starts a new turn
    // - All subsequent agent messages belong to that turn until next user message

    // Step 3: Format
    // [Previous session context - recovered after crash]
    //
    // User:
    // <user message text>
    //
    // Agent:
    // <agent response 1>
    // <agent response 2>
    //
    // --- End of recovered context ---

    if (no turns found) return null
    return formattedContext
}
```

Parser logic: **same for Codex and OpenCode** (verified from real DB data — both use `content.type: "codex"` + `data.type: "message"`).

Also handle `content.type: "event"` + `data.type: "message"` (e.g., "Task failed: 429 Too Many Requests") — these are important context markers.

#### 3. Hub: `resumeSession()` — build before spawn

```typescript
// hub/src/sync/syncEngine.ts

async resumeSession(sessionId, namespace, opts?) {
    // ... existing access check ...

    // Build recovery context BEFORE merge (messages still in old session)
    // Fetch all messages from old session (add getAllSessionMessages to MessageService)
    const messages = this.messageService.getAllSessionMessages(sessionId, 1000)
    const recoveryContext = buildRecoveryContext(messages)

    const spawnResult = await this.rpcGateway.spawnSession(
        // ... existing params ...
        recoveryContext  // NEW
    )
}
```

#### 4. Hub: `rpcGateway.ts` — pass through

```typescript
async spawnSession(..., recoveryContext?: string) {
    return await this.sendRpc(machineId, 'spawn-in-directory', {
        // ... existing fields ...
        recoveryContext
    })
}
```

#### 5. CLI runner: `run.ts` — CLI arg encoding

```typescript
// buildCliArgs:
if (options.recoveryContext) {
    const encoded = Buffer.from(options.recoveryContext).toString('base64')
    args.push('--recovery-context', encoded)
}
```

#### 6. CLI commands: parse `--recovery-context`

```typescript
// commands/codex.ts, commands/opencode.ts:
if (arg === '--recovery-context') {
    const encoded = commandArgs[++i]
    options.recoveryContext = encoded
        ? Buffer.from(encoded, 'base64').toString('utf-8')
        : undefined
}
```

#### 7. CLI Codex: inject via `developerInstructions`

**`runCodex.ts`:** pass recoveryContext to loop

```typescript
export async function runCodex(opts: {
    // ... existing ...
    recoveryContext?: string  // NEW
}) {
    // ... bootstrap ...
    await loop({
        // ... existing ...
        resumeSessionId: opts.resumeSessionId,
        recoveryContext: opts.recoveryContext,  // NEW
    })
}
```

**`loop.ts`:** pass to CodexSession / launcher

```typescript
interface LoopOptions {
    // ... existing ...
    recoveryContext?: string  // NEW
}

export async function loop(opts: LoopOptions): Promise<void> {
    const session = new CodexSession({
        // ... existing ...
    })

    await runLocalRemoteSession({
        session,
        // ... existing ...
        runLocal: (session) => codexLocalLauncher(session, opts.recoveryContext),
        runRemote: (session) => codexRemoteLauncher(session, opts.recoveryContext),
    })
}
```

**`codexRemoteLauncher.ts`:** inject into `buildThreadStartParams`

```typescript
// CodexRemoteLauncher constructor:
constructor(session: CodexSession, recoveryContext?: string) {
    // ... existing ...
    this.recoveryContext = recoveryContext ?? null
}

// In runMainLoop, when building threadParams:
const threadParams = buildThreadStartParams({
    cwd: session.path,
    mode: message.mode,
    mcpServers,
    cliOverrides: session.codexCliOverrides,
    developerInstructions: this.recoveryContext ?? undefined  // NEW
})

// Both resumeThread and startThread use this threadParams:
if (resumeCandidate) {
    const resumeResponse = await appServerClient.resumeThread({
        threadId: resumeCandidate,
        ...threadParams  // recoveryContext flows here via developerInstructions
    })
}

if (!threadId) {
    const threadResponse = await appServerClient.startThread(threadParams)
    // recoveryContext flows here via developerInstructions
}

// Mark consumed after first successful thread creation:
if (hasThread) {
    this.recoveryContext = null  // don't re-inject on subsequent messages
}
```

**`codexLocalLauncher.ts`:** pass through (local mode gets context from transcript file)

```typescript
export async function codexLocalLauncher(session: CodexSession, _recoveryContext?: string): Promise<'switch' | 'exit'> {
    // Local mode: Codex CLI reads its own transcript on resume
    // recoveryContext not needed — codex resume <id> handles it natively
    // ...
}
```

#### 8. CLI OpenCode: inject via message prepend

OpenCode ACP doesn't have `developerInstructions`. Prepend to first message instead.

**`opencodeRemoteLauncher.ts`:**

```typescript
class OpencodeRemoteLauncher {
    private recoveryContext: string | null = null
    private recoveryContextConsumed = false

    constructor(session: OpencodeSession, recoveryContext?: string) {
        this.recoveryContext = recoveryContext ?? null
    }

    // In runMainLoop, before first prompt():
    if (!this.instructionsSent) {
        const parts = [TITLE_INSTRUCTION]
        if (this.recoveryContext && !this.recoveryContextConsumed) {
            parts.push(this.recoveryContext)
            this.recoveryContextConsumed = true
        }
        parts.push(batch.message)
        messageText = parts.join("\n\n")
        this.instructionsSent = true
    }
}
```

### `developerInstructions` composition (Codex)

In `appServerConfig.ts`, `resolveInstructions()` works as:
```typescript
developerInstructions = baseInstructions
    ? `${baseInstructions}\n\n${customInstructions}`
    : customInstructions
```

Where `baseInstructions` = `codexSystemPrompt` (title instruction) and `customInstructions` = recovery context.

Result:
```
ALWAYS when you start a new chat, call the title tool...

[Previous session context - recovered after crash]

User:
<original prompt>

Agent:
<agent responses>

--- End of recovered context ---
```

This is coherent: system instructions + recovery context + task, exactly how `developerInstructions` is designed to work.

### Thread retry safety

If `thread_status_failure` occurs mid-session:
- `hasThread = false` → next message iteration re-enters `!hasThread` branch
- But `recoveryContext` was already consumed (`this.recoveryContext = null`)
- New thread starts without recovery context → LLM is in same state as before (no context)
- This is acceptable: thread failure after context injection means the context was already processed by one thread attempt

If user wants to retry again, they would need to trigger another resume flow (which rebuilds context from DB).

### Context format — real example

With session `2ef485fa-76fa-44ef-8dee-e4a2cbeb6e36`:

```
[Previous session context - recovered after crash]

User:
Mình đang phát triển Plugin System cho Clawith — deploy Docker image lên K8s dưới dạng plugin MCP, quản lý qua 3 tầng: PluginDefinition → CompanyPlugin → MCPServer → Tool...

Agent:
Let me start by reading all the relevant files to understand the current state.
Now let me read the full current state of each file and the spec.
## Review Results
### 1. frontend/src/pages/Layout.tsx ✅ OK
### 2. frontend/src/pages/PluginStore.tsx — needs update()
...
Both fixes verified. Now the main task — adding the Plugins tab to EnterpriseSettings.
Let me verify all the changes were correctly applied.

--- End of recovered context ---
```

~4KB, negligible vs 200K+ context window.

### Edge cases

| Case | Behavior |
|------|----------|
| Session has no user messages | `buildRecoveryContext` → null, no `--recovery-context` arg |
| Session has 20+ turns | All included (chat text <50KB for realistic sessions) |
| `recoveryContext` is null | Normal flow, `developerInstructions` falls back to `codexSystemPrompt` only |
| `thread/resume` succeeds | Context injected via `developerInstructions` but app-server uses its own stored context; no harm |
| `thread/start` fallback | Context injected via `developerInstructions`; LLM receives full history |
| Thread fails mid-session | `recoveryContext` consumed; new thread starts without context (same as current behavior) |
| User sends messages before first turn processes | Context already set in thread params, not affected |
| Malformed message in DB | Skipped silently, rest of context still built |
| Claude flavor session | No recovery context (Claude SDK handles resume internally) |
| Local mode (Codex) | `recoveryContext` not needed — CLI reads its own transcript file on resume |

### Risks & tradeoffs

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Agent messages are intent, not work product | Medium | Accepted — still far better than zero context. Tool results excluded deliberately (too large) |
| Band-aid, not root cause fix | Low | Accepted — complements future `thread/resume` fix |
| `developerInstructions` may be ignored by model on resume | Low | Only matters for fallback `thread/start`; resume uses its own stored context |
| OpenCode message prepend less reliable than `developerInstructions` | Medium | Accepted — no `developerInstructions` equivalent in ACP |
| `resolveInstructions()` concatenates recovery context after `codexSystemPrompt` | Low | Intended behavior — system instructions + recovery context is coherent |

## Scope

- **New file**: `hub/src/sync/recoveryContext.ts` (1 file, ~80 LOC)
- **Hub**: `syncEngine.ts`, `rpcGateway.ts` (2 files, ~10 LOC change)
- **CLI**: `rpcTypes.ts` (1 file, ~1 LOC)
- **Hub**: `messageService.ts` (~5 LOC, new getAllSessionMessages wrapper)
- **CLI runner**: `run.ts` (~3 LOC)
- **CLI commands**: `codex.ts`, `opencode.ts` (~6 LOC each)
- **CLI Codex**: `runCodex.ts`, `loop.ts`, `codexRemoteLauncher.ts`, `codexLocalLauncher.ts` (~20 LOC total)
- **CLI OpenCode**: `runOpencode.ts`, `loop.ts`, `opencodeRemoteLauncher.ts` (~15 LOC total)

Total: ~12 files, ~150 LOC added.

## Testing

- **Unit**: `buildRecoveryContext` with fixture messages (various flavors, malformed, empty)
- **Unit**: base64 encode/decode roundtrip in `buildCliArgs` / command parsing
- **Unit**: `resolveInstructions()` composition with recovery context
- **Manual**: trigger session crash → send "Tiếp tục" → verify LLM has context in `developerInstructions`

## Success criteria

1. After session crash, user types "Tiếp tục" → LLM receives conversation history via `developerInstructions` (Codex) or message prepend (OpenCode)
2. LLM can reference previous work ("as we discussed...", "continuing from where we left off...")
3. Recovery context is invisible in chat UI (only in system-level prompt, not shown to user)
4. No regression: sessions without crash work exactly as before
5. No regression: normal `thread/resume` success path unaffected (context in `developerInstructions` is informational)

---

## Self-Review (2026-05-14)

1. **OpenCode format verified**: Both Codex and OpenCode use `content.type: "codex"` + `data.type: "message"`. One parser.
2. **Injection point corrected**: `developerInstructions` must be injected into `buildThreadStartParams()` call, BEFORE both `resumeThread` and `startThread`. Both paths receive the same `threadParams`.
3. **`resolveInstructions()` confirmed**: Appends custom instructions after `codexSystemPrompt`. Recovery context becomes part of `developer_instructions` config. Coherent composition.
4. **OpenCode fallback**: ACP has no `developerInstructions`. System prompt prefix (prepend to first message) is the best available option.
5. **Thread retry**: `recoveryContext` consumed after first thread creation. If thread fails, new thread starts without context — same as current behavior before this fix.
6. **Local mode**: Codex local mode reads its own transcript on resume (`codex resume <id>`). Recovery context not needed.
7. **Event messages**: `content.type: "event"` + `data.type: "message"` (e.g., "Task failed: 429 Too Many Requests") included in context — important crash context markers.
