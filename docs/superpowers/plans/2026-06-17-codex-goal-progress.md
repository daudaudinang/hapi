# Codex Goal Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support Codex native `/goal` in HAPI remote sessions, including live goal progress in chat/status UI.

**Architecture:** HAPI should call Codex app-server's native goal APIs instead of simulating a loop. CLI maps `/goal` text to `thread/goal/*` requests, converts goal notifications into normal HAPI agent events, and the web derives the latest goal from those events for timeline + composer status display.

**Tech Stack:** TypeScript strict, Bun workspaces, Vitest, React, assistant-ui, Codex app-server JSON-RPC.


---

## Risk coverage amendments — 2026-06-17

These amendments override older snippets below if they conflict.

1. **Do not interrupt active Codex turns for `/goal`.** Native Codex handles `thread/goal/set|get|clear` as goal-control API calls. HAPI must not call `interruptActiveTurn()` or `resetCurrentTurnState()` for goal set/pause/resume/clear, otherwise a harmless progress-control command can abort real work.
2. **Keep `/goal` out of normal slash expansion before queueing.** `runCodex.ts` currently expands known slash commands before messages reach the remote launcher. Add a dedicated `parseCodexGoalCommand()` check before that resolver so `/goal ...` is queued unchanged and handled by the app-server path. This also makes native `/goal` win over a custom prompt named `goal`.
3. **Do not drop pending user messages.** Add/use an isolated queue push that does not clear existing pending items. `/goal` should be processed as its own command, but must not discard queued user text.
4. **Notifications are authoritative for visible progress.** For goal set/pause/resume/clear, the command handler should call Codex and rely on `thread/goal/updated|cleared` notifications for chat/status updates. Only emit visible HAPI status for `/goal` get, unsupported syntax, or API errors. This avoids duplicate “Goal active” messages.
5. **Old/disabled Codex goal API must degrade safely.** If `thread/goal/*` fails because the method/feature is unavailable, show a concise status message and do not fall through into a normal Codex turn containing the literal `/goal`.
6. **Progress display format:** no budget → `goal active · 12k tokens · 1m 30s`; with budget → `goal active · 12k/200k tokens · 1m 30s`. `200k` is `tokenBudget` from Codex, not a HAPI default.
7. **Web state v1 limitation accepted:** latest goal is derived from loaded `codex_goal` events. A session opened without recent goal events may not show a chip until the next goal event. Persisting latest goal in session metadata is out of scope for this iteration.
8. **Manual turn expectations:** HAPI must not call `thread/turn/start` directly for `/goal`, but native Codex may later auto-continue the goal internally and emit normal turn events. Tests should assert “no direct HAPI user turn for the slash command,” not “no Codex turn event can ever occur.”
9. **Autocomplete scope:** add `/goal` to both backend and frontend Codex slash-command lists so it appears next to `/clear`, `/compact`, etc.
10. **Review gates:** each implementation task must be followed by focused tests and a subagent review of the touched area before moving to the next high-impact area.
11. **No empty thread for read/no-op controls:** only `/goal <objective>` may create a Codex thread. `/goal`, `/goal clear`, `/goal pause`, and `/goal resume` must use an existing current/resumable thread or return a visible no-op status.

---

## File structure / ownership

| File | Responsibility |
|---|---|
| `cli/src/codex/appServerTypes.ts` | Local TypeScript shape for Codex app-server goal requests/responses. |
| `cli/src/codex/codexAppServerClient.ts` | Thin JSON-RPC client wrappers for `thread/goal/set`, `thread/goal/get`, `thread/goal/clear`. |
| `cli/src/codex/utils/goalCommands.ts` | Parse native Codex `/goal` commands without expanding them as prompts. |
| `cli/src/codex/utils/goalCommands.test.ts` | Unit tests for `/goal` parsing. |
| `cli/src/codex/utils/slashCommands.ts` | Existing slash resolver remains for non-goal commands; native `/goal` bypasses it. |
| `cli/src/codex/runCodex.ts` | Detect native `/goal` before slash expansion and queue it as an isolated command without clearing pending messages. |
| `cli/src/utils/MessageQueue2.ts` | Add isolated push without clearing queued user messages. |
| `cli/src/codex/utils/appServerEventConverter.ts` | Convert app-server goal notifications to HAPI events. |
| `cli/src/codex/utils/appServerEventConverter.test.ts` | Unit tests for goal notification conversion. |
| `cli/src/codex/codexRemoteLauncher.ts` | Execute parsed goal commands against the current Codex thread and forward goal events to the web. |
| `cli/src/codex/codexRemoteLauncher.test.ts` | Integration-ish tests with mocked app-server client. |
| `cli/src/modules/common/slashCommands.ts` | Backend slash autocomplete list includes Codex `/goal`. |
| `web/src/lib/codexSlashCommands.ts` | Frontend fallback slash autocomplete includes Codex `/goal`. |
| `web/src/lib/codexSlashCommands.test.ts` | Frontend slash command tests. |
| `web/src/chat/types.ts` | Add typed Codex goal event/state. |
| `web/src/chat/normalizeAgent.ts` | Normalize `codex_goal` payloads as agent events. |
| `web/src/chat/presentation.ts` | Human label for goal timeline events. |
| `web/src/chat/reducer.ts` | Derive latest goal progress from normalized event messages. |
| `web/src/components/AssistantChat/StatusBar.tsx` | Render goal progress chip near composer. |
| `web/src/components/SessionChat.tsx` | Pass latest goal to `HappyComposer` / `StatusBar`. |
| `web/src/chat/normalize.test.ts`, `web/src/chat/presentation.test.ts`, `web/src/chat/reducerEvents.test.ts` or `web/src/chat/reducerTimeline.test.ts` | Web-side tests. |

---

## Data contract

Use one HAPI event payload for both timeline and status progress:

```ts
export type CodexGoalStatus = 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete'

export type CodexGoalState = {
    threadId: string
    objective: string
    status: CodexGoalStatus
    tokenBudget: number | null
    tokensUsed: number
    timeUsedSeconds: number
    createdAt: number
    updatedAt: number
}

export type CodexGoalEvent =
    | { type: 'codex-goal'; action: 'updated'; goal: CodexGoalState }
    | { type: 'codex-goal'; action: 'cleared'; threadId: string }
```

CLI `sendAgentMessage` payload shape:

```ts
{
    type: 'codex_goal',
    action: 'updated',
    goal: { threadId, objective, status, tokenBudget, tokensUsed, timeUsedSeconds, createdAt, updatedAt },
    id: randomUUID()
}
```

and:

```ts
{
    type: 'codex_goal',
    action: 'cleared',
    threadId,
    id: randomUUID()
}
```

---

### Task 1: Add Codex goal API types and client methods

**Files:**
- Modify: `cli/src/codex/appServerTypes.ts`
- Modify: `cli/src/codex/codexAppServerClient.ts`

- [ ] **Step 1: Add goal types to `appServerTypes.ts`**

Add after `ThreadCompactStartResponse`:

```ts
export type ThreadGoalStatus = 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete';

export interface ThreadGoal {
    threadId: string;
    objective: string;
    status: ThreadGoalStatus;
    tokenBudget: number | null;
    tokensUsed: number;
    timeUsedSeconds: number;
    createdAt: number;
    updatedAt: number;
}

export interface ThreadGoalSetParams {
    threadId: string;
    objective?: string | null;
    status?: ThreadGoalStatus | null;
    tokenBudget?: number | null;
}

export interface ThreadGoalSetResponse {
    goal: ThreadGoal;
    [key: string]: unknown;
}

export interface ThreadGoalGetParams {
    threadId: string;
}

export interface ThreadGoalGetResponse {
    goal: ThreadGoal | null;
    [key: string]: unknown;
}

export interface ThreadGoalClearParams {
    threadId: string;
}

export interface ThreadGoalClearResponse {
    cleared: boolean;
    [key: string]: unknown;
}
```

- [ ] **Step 2: Import goal types in `codexAppServerClient.ts`**

Extend the existing import from `./appServerTypes`:

```ts
import type {
    InitializeParams,
    InitializeResponse,
    ModelListParams,
    ModelListResponse,
    ThreadStartParams,
    ThreadStartResponse,
    ThreadResumeParams,
    ThreadResumeResponse,
    TurnStartParams,
    TurnStartResponse,
    TurnInterruptParams,
    TurnInterruptResponse,
    ThreadCompactStartParams,
    ThreadCompactStartResponse,
    ThreadGoalSetParams,
    ThreadGoalSetResponse,
    ThreadGoalGetParams,
    ThreadGoalGetResponse,
    ThreadGoalClearParams,
    ThreadGoalClearResponse
} from './appServerTypes';
```

- [ ] **Step 3: Add client methods after `compactThread`**

```ts
    async setThreadGoal(
        params: ThreadGoalSetParams,
        options?: { signal?: AbortSignal }
    ): Promise<ThreadGoalSetResponse> {
        const response = await this.sendRequest('thread/goal/set', params, {
            signal: options?.signal,
            timeoutMs: 30_000
        });
        return response as ThreadGoalSetResponse;
    }

    async getThreadGoal(
        params: ThreadGoalGetParams,
        options?: { signal?: AbortSignal }
    ): Promise<ThreadGoalGetResponse> {
        const response = await this.sendRequest('thread/goal/get', params, {
            signal: options?.signal,
            timeoutMs: 30_000
        });
        return response as ThreadGoalGetResponse;
    }

    async clearThreadGoal(
        params: ThreadGoalClearParams,
        options?: { signal?: AbortSignal }
    ): Promise<ThreadGoalClearResponse> {
        const response = await this.sendRequest('thread/goal/clear', params, {
            signal: options?.signal,
            timeoutMs: 30_000
        });
        return response as ThreadGoalClearResponse;
    }
```

- [ ] **Step 4: Typecheck CLI**

Run:

```bash
bun run typecheck:cli
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cli/src/codex/appServerTypes.ts cli/src/codex/codexAppServerClient.ts
git commit -m "feat: add Codex goal app-server client methods"
```

---

### Task 2: Parse native Codex `/goal` commands and expose autocomplete

**Files:**
- Add: `cli/src/codex/utils/goalCommands.ts`
- Add: `cli/src/codex/utils/goalCommands.test.ts`
- Modify: `cli/src/modules/common/slashCommands.ts`
- Modify: `web/src/lib/codexSlashCommands.ts`
- Modify: `web/src/lib/codexSlashCommands.test.ts`

- [ ] **Step 1: Write failing CLI goal parser tests**

Add `cli/src/codex/utils/goalCommands.test.ts` with cases for:

```ts
parseCodexGoalCommand('/goal ship the feature')
// => { action: 'set', objective: 'ship the feature' }
parseCodexGoalCommand('/goal')
// => { action: 'get' }
parseCodexGoalCommand('/goal pause')
// => { action: 'set-status', status: 'paused' }
parseCodexGoalCommand('/goal resume')
// => { action: 'set-status', status: 'active' }
parseCodexGoalCommand('/goal clear')
// => { action: 'clear' }
parseCodexGoalCommand('/goal edit')
// => { action: 'unsupported', message: '<short guidance>' }
parseCodexGoalCommand('/clear')
// => null
```

- [ ] **Step 2: Implement `parseCodexGoalCommand` in a new file**

Do not add `kind: 'goal'` to `resolveCodexSlashCommand()`. That resolver expands custom prompts and existing slash commands before queueing; native `/goal` must bypass that path.

Suggested type:

```ts
export type CodexGoalCommand =
    | { action: 'get' }
    | { action: 'clear' }
    | { action: 'set'; objective: string }
    | { action: 'set-status'; status: 'active' | 'paused' }
    | { action: 'unsupported'; message: string };
```

Parsing rules:
- `/goal` => get
- `/goal clear|reset|off|cancel` => clear
- `/goal pause` => paused
- `/goal resume` => active
- `/goal edit` => unsupported because HAPI has no modal goal editor yet
- `/goal <anything else>` => set objective
- non-goal slash/text => null

- [ ] **Step 3: Add `/goal` to CLI builtin list**

In `cli/src/modules/common/slashCommands.ts`, add to `codex` builtins after `compact`:

```ts
        { name: 'goal', description: 'Set, view, pause, resume, or clear a Codex task goal', source: 'builtin' },
```

- [ ] **Step 4: Add `/goal` to web fallback builtin list**

In `web/src/lib/codexSlashCommands.ts`, add to `codex` builtins after `compact`:

```ts
        { name: 'goal', description: 'Set, view, pause, resume, or clear a Codex task goal', source: 'builtin' },
```

- [ ] **Step 5: Update web slash test**

In `web/src/lib/codexSlashCommands.test.ts`, add `'goal'` to the expected `arrayContaining` list.

- [ ] **Step 6: Run tests**

```bash
cd cli && bun test src/codex/utils/goalCommands.test.ts
cd ../web && bun test src/lib/codexSlashCommands.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add cli/src/codex/utils/goalCommands.ts cli/src/codex/utils/goalCommands.test.ts cli/src/modules/common/slashCommands.ts web/src/lib/codexSlashCommands.ts web/src/lib/codexSlashCommands.test.ts
git commit -m "feat: parse Codex goal slash command"
```

---

### Task 2b: Preserve native `/goal` before slash expansion and isolate without dropping queue

**Files:**
- Modify: `cli/src/codex/runCodex.ts`
- Modify: `cli/src/utils/MessageQueue2.ts`
- Add/modify tests near existing queue and Codex slash tests.

- [ ] Add `pushIsolate(message, mode, localId?)` to `MessageQueue2`: same isolation behavior as `pushIsolateAndClear`, but does not clear pending messages.
- [ ] In `runCodex.ts`, call `parseCodexGoalCommand(text)` before `resolveCodexSlashCommand()`. If it returns a command, skip prompt expansion and queue the original trimmed `/goal...` via `pushIsolate`.
- [ ] Keep existing `/clear` and `/compact` behavior unchanged; they may still use `pushIsolateAndClear`.
- [ ] Tests must prove `/goal` is not expanded as a custom prompt and does not clear already queued messages.

**Risk covered:** native `/goal` reaches the remote launcher, custom `goal.md` does not steal it, and pending user text is not lost.

---

### Task 3: Convert Codex goal notifications to HAPI events

**Files:**
- Modify: `cli/src/codex/utils/appServerEventConverter.ts`
- Modify: `cli/src/codex/utils/appServerEventConverter.test.ts`

- [ ] **Step 1: Write failing converter tests**

Append to `AppServerEventConverter` tests:

```ts
    it('maps thread goal updated notifications', () => {
        const converter = new AppServerEventConverter();
        const events = converter.handleNotification('thread/goal/updated', {
            threadId: 'thread-1',
            turnId: null,
            goal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status: 'active',
                tokenBudget: 200000,
                tokensUsed: 12000,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        });

        expect(events).toEqual([{
            type: 'codex_goal',
            action: 'updated',
            threadId: 'thread-1',
            turnId: null,
            goal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status: 'active',
                tokenBudget: 200000,
                tokensUsed: 12000,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        }]);
    });

    it('maps thread goal cleared notifications', () => {
        const converter = new AppServerEventConverter();
        const events = converter.handleNotification('thread/goal/cleared', { threadId: 'thread-1' });

        expect(events).toEqual([{
            type: 'codex_goal',
            action: 'cleared',
            threadId: 'thread-1'
        }]);
    });
```

- [ ] **Step 2: Run failing converter test**

```bash
cd cli && bun test src/codex/utils/appServerEventConverter.test.ts
```

Expected: FAIL because goal notifications are ignored/unknown.

- [ ] **Step 3: Add helper functions to converter**

In `appServerEventConverter.ts`, add near helper functions:

```ts
function normalizeGoalStatus(value: unknown): string | null {
    const status = asString(value);
    if (!status) return null;
    return ['active', 'paused', 'blocked', 'usageLimited', 'budgetLimited', 'complete'].includes(status)
        ? status
        : null;
}

function normalizeThreadGoal(value: unknown): Record<string, unknown> | null {
    const goal = asRecord(value);
    if (!goal) return null;
    const threadId = asString(goal.threadId ?? goal.thread_id);
    const objective = asString(goal.objective);
    const status = normalizeGoalStatus(goal.status);
    const tokensUsed = asNumber(goal.tokensUsed ?? goal.tokens_used);
    const timeUsedSeconds = asNumber(goal.timeUsedSeconds ?? goal.time_used_seconds);
    const createdAt = asNumber(goal.createdAt ?? goal.created_at);
    const updatedAt = asNumber(goal.updatedAt ?? goal.updated_at);
    if (!threadId || !objective || !status || tokensUsed === null || timeUsedSeconds === null || createdAt === null || updatedAt === null) {
        return null;
    }
    return {
        threadId,
        objective,
        status,
        tokenBudget: asNumber(goal.tokenBudget ?? goal.token_budget),
        tokensUsed,
        timeUsedSeconds,
        createdAt,
        updatedAt
    };
}
```

- [ ] **Step 4: Map direct goal notifications**

In `handleNotification`, after `thread/status/changed` handling and before `turn/started`:

```ts
        if (method === 'thread/goal/updated') {
            const threadId = asString(paramsRecord.threadId ?? paramsRecord.thread_id);
            const turnId = asString(paramsRecord.turnId ?? paramsRecord.turn_id);
            const goal = normalizeThreadGoal(paramsRecord.goal);
            if (!threadId || !goal) return events;
            events.push({
                type: 'codex_goal',
                action: 'updated',
                threadId,
                turnId,
                goal
            });
            return events;
        }

        if (method === 'thread/goal/cleared') {
            const threadId = asString(paramsRecord.threadId ?? paramsRecord.thread_id);
            if (!threadId) return events;
            events.push({
                type: 'codex_goal',
                action: 'cleared',
                threadId
            });
            return events;
        }
```

- [ ] **Step 5: Run converter tests**

```bash
cd cli && bun test src/codex/utils/appServerEventConverter.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/src/codex/utils/appServerEventConverter.ts cli/src/codex/utils/appServerEventConverter.test.ts
git commit -m "feat: convert Codex goal progress events"
```

---

### Task 4: Execute `/goal` in Codex remote launcher

**Files:**
- Modify: `cli/src/codex/codexRemoteLauncher.ts`
- Modify: `cli/src/codex/codexRemoteLauncher.test.ts`

- [ ] **Step 1: Extend mocked app-server client in tests**

In the hoisted `harness`, add:

```ts
    setGoalCalls: [] as Array<{ threadId: string; objective?: string | null; status?: string | null; tokenBudget?: number | null }>,
    getGoalCalls: [] as string[],
    clearGoalCalls: [] as string[],
    currentGoal: null as null | {
        threadId: string;
        objective: string;
        status: string;
        tokenBudget: number | null;
        tokensUsed: number;
        timeUsedSeconds: number;
        createdAt: number;
        updatedAt: number;
    }
```

Inside `MockCodexAppServerClient`, add methods:

```ts
        async setThreadGoal(params?: { threadId?: string; objective?: string | null; status?: string | null; tokenBudget?: number | null }) {
            const threadId = params?.threadId ?? 'thread-unknown';
            harness.setGoalCalls.push({ threadId, objective: params?.objective, status: params?.status, tokenBudget: params?.tokenBudget });
            harness.currentGoal = {
                threadId,
                objective: params?.objective ?? harness.currentGoal?.objective ?? 'existing goal',
                status: params?.status ?? harness.currentGoal?.status ?? 'active',
                tokenBudget: params?.tokenBudget ?? harness.currentGoal?.tokenBudget ?? null,
                tokensUsed: 12000,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            };
            const payload = { threadId, turnId: null, goal: harness.currentGoal };
            harness.notifications.push({ method: 'thread/goal/updated', params: payload });
            this.notificationHandler?.('thread/goal/updated', payload);
            return { goal: harness.currentGoal };
        }

        async getThreadGoal(params?: { threadId?: string }) {
            const threadId = params?.threadId ?? 'thread-unknown';
            harness.getGoalCalls.push(threadId);
            return { goal: harness.currentGoal };
        }

        async clearThreadGoal(params?: { threadId?: string }) {
            const threadId = params?.threadId ?? 'thread-unknown';
            harness.clearGoalCalls.push(threadId);
            harness.currentGoal = null;
            const payload = { threadId };
            harness.notifications.push({ method: 'thread/goal/cleared', params: payload });
            this.notificationHandler?.('thread/goal/cleared', payload);
            return { cleared: true };
        }
```

Reset these fields in `afterEach`.

- [ ] **Step 2: Write failing remote launcher tests**

Append tests:

```ts
    it('sets a Codex goal without starting a user turn', async () => {
        const { session, codexMessages } = createSessionStub(['/goal ship the feature']);

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(harness.startThreadIds).toEqual(['thread-1']);
        expect(harness.startTurnThreadIds).toEqual([]);
        expect(harness.setGoalCalls).toEqual([{ threadId: 'thread-1', objective: 'ship the feature', status: 'active', tokenBudget: undefined }]);
        expect(codexMessages).toContainEqual(expect.objectContaining({
            type: 'codex_goal',
            action: 'updated',
            goal: expect.objectContaining({ objective: 'ship the feature', status: 'active' })
        }));
    });

    it('reads, pauses, resumes, and clears a Codex goal', async () => {
        harness.currentGoal = {
            threadId: 'thread-1',
            objective: 'ship the feature',
            status: 'active',
            tokenBudget: null,
            tokensUsed: 12000,
            timeUsedSeconds: 90,
            createdAt: 1776272400,
            updatedAt: 1776272490
        };
        const { session, sessionEvents } = createSessionStub(['/goal', '/goal pause', '/goal resume', '/goal clear']);

        const exitReason = await codexRemoteLauncher(session as never);

        expect(exitReason).toBe('exit');
        expect(harness.startTurnThreadIds).toEqual([]);
        expect(harness.getGoalCalls).toEqual(['thread-1']);
        expect(harness.setGoalCalls.map((call) => call.status)).toEqual(['paused', 'active']);
        expect(harness.clearGoalCalls).toEqual(['thread-1']);
        expect(sessionEvents).toContainEqual(expect.objectContaining({
            type: 'message',
            message: expect.stringContaining('Goal active')
        }));
        expect(sessionEvents).toContainEqual({ type: 'message', message: 'Goal cleared' });
    });
```

- [ ] **Step 3: Run failing launcher tests**

```bash
cd cli && bun test src/codex/codexRemoteLauncher.test.ts
```

Expected: FAIL because launcher does not execute goal actions yet.

- [ ] **Step 4: Add goal formatting helpers to `codexRemoteLauncher.ts`**

Near local helper functions in `runMainLoop`, add:

```ts
        const formatGoalUsage = (goal: Record<string, unknown>): string => {
            const tokensUsed = asNumber(goal.tokensUsed ?? goal.tokens_used) ?? 0;
            const tokenBudget = asNumber(goal.tokenBudget ?? goal.token_budget);
            const timeUsedSeconds = asNumber(goal.timeUsedSeconds ?? goal.time_used_seconds) ?? 0;
            const tokenPart = tokenBudget !== null
                ? `${tokensUsed.toLocaleString()}/${tokenBudget.toLocaleString()} tokens`
                : `${tokensUsed.toLocaleString()} tokens`;
            const minutes = Math.floor(timeUsedSeconds / 60);
            const seconds = timeUsedSeconds % 60;
            const timePart = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
            return `${tokenPart} · ${timePart}`;
        };

        const formatGoalStatusMessage = (goal: Record<string, unknown>): string => {
            const status = asString(goal.status) ?? 'active';
            const objective = asString(goal.objective) ?? 'Goal';
            return `Goal ${status}: ${objective}\n${formatGoalUsage(goal)}`;
        };
```

- [ ] **Step 5: Add `ensureThreadForGoal` and `handleGoalCommand`**

After `resumeExistingThreadForCompact`, add:

```ts
        const ensureThreadForGoal = async (mode: EnhancedMode): Promise<string> => {
            if (this.currentThreadId && this.currentThreadId !== invalidThreadId) {
                hasThread = true;
                return this.currentThreadId;
            }

            const resumeCandidate = session.sessionId && session.sessionId !== invalidThreadId
                ? session.sessionId
                : null;
            const threadParams = buildThreadStartParams({
                cwd: session.path,
                mode,
                mcpServers,
                cliOverrides: session.codexCliOverrides
            });

            if (resumeCandidate) {
                try {
                    const resumeResponse = await appServerClient.resumeThread({
                        threadId: resumeCandidate,
                        ...threadParams
                    }, { signal: this.abortController.signal });
                    const resumeRecord = asRecord(resumeResponse);
                    const resumeThread = resumeRecord ? asRecord(resumeRecord.thread) : null;
                    const threadId = asString(resumeThread?.id) ?? resumeCandidate;
                    applyResolvedModel(resumeRecord?.model);
                    this.currentThreadId = threadId;
                    session.onSessionFound(threadId);
                    hasThread = true;
                    return threadId;
                } catch (error) {
                    logger.warn(`[Codex] Failed to resume app-server thread ${resumeCandidate} for /goal, starting new thread`, error);
                }
            }

            const threadResponse = await appServerClient.startThread(threadParams, { signal: this.abortController.signal });
            const threadRecord = asRecord(threadResponse);
            const thread = threadRecord ? asRecord(threadRecord.thread) : null;
            const threadId = asString(thread?.id);
            applyResolvedModel(threadRecord?.model);
            if (!threadId) {
                throw new Error('app-server thread/start did not return thread.id for /goal');
            }
            this.currentThreadId = threadId;
            session.onSessionFound(threadId);
            hasThread = true;
            return threadId;
        };
```

Then add:

```ts
        const handleGoalCommand = async (slash: CodexGoalCommand, message: QueuedMessage): Promise<void> => {
            // Risk control: do not interrupt/reset an active turn for goal-control commands.
            // Codex app-server owns goal mutation and will emit goal notifications.
            const threadId = await ensureThreadForGoal(message.mode, slash.action === 'set');

            try {
                if (slash.action === 'unsupported') {
                    sendVisibleStatus(slash.message);
                    return;
                }

                if (!threadId) {
                    sendVisibleStatus('No active Codex thread for /goal yet. Start a goal with /goal <objective>.');
                    return;
                }

                if (slash.action === 'set') {
                    await appServerClient.setThreadGoal({ threadId, objective: slash.objective, status: 'active' }, { signal: this.abortController.signal });
                    return;
                }

                if (slash.action === 'set-status') {
                    await appServerClient.setThreadGoal({ threadId, status: slash.status }, { signal: this.abortController.signal });
                    return;
                }

                if (slash.action === 'clear') {
                    const response = await appServerClient.clearThreadGoal({ threadId }, { signal: this.abortController.signal });
                    if (!response.cleared) sendVisibleStatus('No active goal to clear');
                    return;
                }

                const response = await appServerClient.getThreadGoal({ threadId }, { signal: this.abortController.signal });
                const goal = asRecord(response.goal);
                sendVisibleStatus(goal ? formatGoalStatusMessage(goal) : 'No active goal');
            } catch (error) {
                logger.warn('[Codex] /goal command failed', error);
                sendVisibleStatus('Goal command is not available in this Codex app-server. Upgrade Codex or enable goals.');
            }
        };
```

- [ ] **Step 6: Route parsed goal commands in the message loop**

Before `handleSpecialCommand(message)` in the main loop, parse only native goal commands with `parseCodexGoalCommand(message.message)` and handle them directly. Do not use `resolveCodexSlashCommand()` here; that resolver is for prompt expansion and non-goal slash commands.

```ts
                const goalCommand = parseCodexGoalCommand(message.message);
                if (goalCommand) {
                    await handleGoalCommand(goalCommand, message);
                    continue;
                }
                    model: message.mode.model,
                    modelReasoningEffort: message.mode.modelReasoningEffort
                });
                if (slash.kind === 'goal') {
                    await handleGoalCommand(slash, message);
                    continue;
                }
```

Do not move all slash handling into the launcher. Keep current `/clear` and `/compact` behavior intact.

- [ ] **Step 7: Forward goal events to web**

In `handleCodexEvent`, add near the `token_count` / `plan_update` send path:

```ts
            if (msgType === 'codex_goal') {
                session.sendAgentMessage({
                    ...msg,
                    id: randomUUID()
                });
            }
```

Also add a local buffer status near other status messages:

```ts
            } else if (msgType === 'codex_goal') {
                const action = asString(msg.action);
                const goal = asRecord(msg.goal);
                if (action === 'cleared') {
                    messageBuffer.addMessage('Goal cleared', 'status');
                } else if (goal) {
                    messageBuffer.addMessage(formatGoalStatusMessage(goal), 'status');
                }
```

- [ ] **Step 8: Run launcher tests**

```bash
cd cli && bun test src/codex/codexRemoteLauncher.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add cli/src/codex/codexRemoteLauncher.ts cli/src/codex/codexRemoteLauncher.test.ts
git commit -m "feat: execute Codex goal commands remotely"
```

---

### Task 5: Normalize and present goal progress in web chat

**Files:**
- Modify: `web/src/chat/types.ts`
- Modify: `web/src/chat/normalizeAgent.ts`
- Modify: `web/src/chat/presentation.ts`
- Modify: `web/src/chat/normalize.test.ts`
- Modify: `web/src/chat/presentation.test.ts`

- [ ] **Step 1: Add web goal types**

In `web/src/chat/types.ts`, add before `AgentEvent`:

```ts
export type CodexGoalStatus = 'active' | 'paused' | 'blocked' | 'usageLimited' | 'budgetLimited' | 'complete'

export type CodexGoalState = {
    threadId: string
    objective: string
    status: CodexGoalStatus
    tokenBudget: number | null
    tokensUsed: number
    timeUsedSeconds: number
    createdAt: number
    updatedAt: number
}
```

Extend `AgentEvent`:

```ts
    | { type: 'codex-goal'; action: 'updated'; goal: CodexGoalState }
    | { type: 'codex-goal'; action: 'cleared'; threadId: string }
```

- [ ] **Step 2: Add failing normalize test**

Append to `web/src/chat/normalize.test.ts`:

```ts
    it('normalizes Codex goal progress events', () => {
        const normalized = normalizeDecryptedMessage({
            id: 'm-goal',
            localId: null,
            createdAt: 1776272490000,
            content: {
                role: 'agent',
                content: {
                    type: 'codex',
                    data: {
                        type: 'codex_goal',
                        action: 'updated',
                        goal: {
                            threadId: 'thread-1',
                            objective: 'ship it',
                            status: 'active',
                            tokenBudget: 200000,
                            tokensUsed: 12000,
                            timeUsedSeconds: 90,
                            createdAt: 1776272400,
                            updatedAt: 1776272490
                        }
                    }
                }
            }
        } as never)

        expect(normalized).toMatchObject({
            role: 'event',
            content: {
                type: 'codex-goal',
                action: 'updated',
                goal: {
                    objective: 'ship it',
                    status: 'active',
                    tokensUsed: 12000
                }
            }
        })
    })
```

- [ ] **Step 3: Implement goal normalization helpers**

In `web/src/chat/normalizeAgent.ts`, add helpers after `normalizeCodexTokenUsage`:

```ts
function normalizeCodexGoalStatus(value: unknown) {
    const status = asString(value)
    if (
        status === 'active' ||
        status === 'paused' ||
        status === 'blocked' ||
        status === 'usageLimited' ||
        status === 'budgetLimited' ||
        status === 'complete'
    ) return status
    return null
}

function normalizeCodexGoal(value: unknown) {
    const goal = isObject(value) ? value : null
    if (!goal) return null
    const threadId = asString(goal.threadId ?? goal.thread_id)
    const objective = asString(goal.objective)
    const status = normalizeCodexGoalStatus(goal.status)
    const tokensUsed = asNumber(goal.tokensUsed ?? goal.tokens_used)
    const timeUsedSeconds = asNumber(goal.timeUsedSeconds ?? goal.time_used_seconds)
    const createdAt = asNumber(goal.createdAt ?? goal.created_at)
    const updatedAt = asNumber(goal.updatedAt ?? goal.updated_at)
    if (!threadId || !objective || !status || tokensUsed === null || timeUsedSeconds === null || createdAt === null || updatedAt === null) return null
    return {
        threadId,
        objective,
        status,
        tokenBudget: asNumber(goal.tokenBudget ?? goal.token_budget),
        tokensUsed,
        timeUsedSeconds,
        createdAt,
        updatedAt
    }
}
```

- [ ] **Step 4: Normalize `codex_goal` payload**

Inside `if (content.type === AGENT_MESSAGE_PAYLOAD_TYPE)`, before `tool-call` handling:

```ts
        if (data.type === 'codex_goal') {
            const action = asString(data.action)
            if (action === 'updated') {
                const goal = normalizeCodexGoal(data.goal)
                return goal ? {
                    id: messageId,
                    localId,
                    createdAt,
                    role: 'event',
                    content: { type: 'codex-goal', action: 'updated', goal },
                    isSidechain: false,
                    meta
                } : null
            }
            if (action === 'cleared') {
                const threadId = asString(data.threadId ?? data.thread_id)
                return threadId ? {
                    id: messageId,
                    localId,
                    createdAt,
                    role: 'event',
                    content: { type: 'codex-goal', action: 'cleared', threadId },
                    isSidechain: false,
                    meta
                } : null
            }
        }
```

- [ ] **Step 5: Add event presentation test**

Append to `web/src/chat/presentation.test.ts`:

```ts
    it('formats Codex goal progress events', () => {
        expect(getEventPresentation({
            type: 'codex-goal',
            action: 'updated',
            goal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status: 'active',
                tokenBudget: null,
                tokensUsed: 12000,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        }).text).toBe('Goal active: ship it · 12k tokens · 1m 30s')

        expect(getEventPresentation({
            type: 'codex-goal',
            action: 'updated',
            goal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status: 'active',
                tokenBudget: 200000,
                tokensUsed: 12000,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        }).text).toBe('Goal active: ship it · 12k/200k tokens · 1m 30s')

        expect(getEventPresentation({
            type: 'codex-goal',
            action: 'cleared',
            threadId: 'thread-1'
        }).text).toBe('Goal cleared')
    })
```

- [ ] **Step 6: Implement presentation formatting**

In `presentation.ts`, add helpers:

```ts
function formatElapsedSeconds(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    if (secs === 0) return `${mins}m`
    return `${mins}m ${secs}s`
}

function formatGoalProgress(event: AgentEvent): EventPresentation {
    const record = event as Record<string, unknown>
    if (record.action === 'cleared') return { icon: '🎯', text: 'Goal cleared' }
    const goal = asRecord(record.goal)
    if (!goal) return { icon: '🎯', text: 'Goal updated' }
    const status = typeof goal.status === 'string' ? goal.status : 'active'
    const objective = typeof goal.objective === 'string' ? goal.objective : 'Goal'
    const tokensUsed = asNumber(goal.tokensUsed) ?? 0
    const tokenBudget = asNumber(goal.tokenBudget)
    const timeUsedSeconds = asNumber(goal.timeUsedSeconds) ?? 0
    const tokenText = tokenBudget !== null
        ? `${formatTokenCount(tokensUsed)}/${formatTokenCount(tokenBudget)} tokens`
        : `${formatTokenCount(tokensUsed)} tokens`
    return {
        icon: '🎯',
        text: `Goal ${status}: ${objective} · ${tokenText} · ${formatElapsedSeconds(timeUsedSeconds)}`
    }
}
```

Then add in `getEventPresentation` before fallback:

```ts
    if (event.type === 'codex-goal') {
        return formatGoalProgress(event)
    }
```

- [ ] **Step 7: Run web tests**

```bash
cd web && bun test src/chat/normalize.test.ts src/chat/presentation.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/chat/types.ts web/src/chat/normalizeAgent.ts web/src/chat/presentation.ts web/src/chat/normalize.test.ts web/src/chat/presentation.test.ts
git commit -m "feat: normalize Codex goal progress events"
```

---

### Task 6: Derive latest goal state and render progress in the composer status bar

**Files:**
- Modify: `web/src/chat/reducer.ts`
- Modify: `web/src/components/SessionChat.tsx`
- Modify: `web/src/components/AssistantChat/HappyComposer.tsx`
- Modify: `web/src/components/AssistantChat/StatusBar.tsx`
- Test: `web/src/chat/reducerEvents.test.ts` or create focused reducer test in `web/src/chat/reducer.test.ts` if no direct reducer test exists.

- [ ] **Step 1: Add failing reducer test for latest goal**

Create `web/src/chat/reducerGoal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { NormalizedMessage } from './types'
import { reduceChatBlocks } from './reducer'

function goalMessage(id: string, status: 'active' | 'paused', tokensUsed: number): NormalizedMessage {
    return {
        id,
        localId: null,
        createdAt: tokensUsed,
        role: 'event',
        isSidechain: false,
        content: {
            type: 'codex-goal',
            action: 'updated',
            goal: {
                threadId: 'thread-1',
                objective: 'ship it',
                status,
                tokenBudget: 200000,
                tokensUsed,
                timeUsedSeconds: 90,
                createdAt: 1776272400,
                updatedAt: 1776272490
            }
        }
    }
}

describe('reduceChatBlocks Codex goal state', () => {
    it('keeps the latest goal progress', () => {
        const reduced = reduceChatBlocks([
            goalMessage('g1', 'active', 1000),
            goalMessage('g2', 'paused', 12000)
        ], null)

        expect(reduced.latestGoal).toMatchObject({
            objective: 'ship it',
            status: 'paused',
            tokensUsed: 12000
        })
    })

    it('clears latest goal after a cleared event', () => {
        const reduced = reduceChatBlocks([
            goalMessage('g1', 'active', 1000),
            {
                id: 'g-clear',
                localId: null,
                createdAt: 2,
                role: 'event',
                isSidechain: false,
                content: { type: 'codex-goal', action: 'cleared', threadId: 'thread-1' }
            }
        ], null)

        expect(reduced.latestGoal).toBeNull()
    })
})
```

- [ ] **Step 2: Run failing reducer test**

```bash
cd web && bun test src/chat/reducerGoal.test.ts
```

Expected: FAIL because `latestGoal` is not returned.

- [ ] **Step 3: Add latest goal derivation in reducer**

In `web/src/chat/reducer.ts`, import `CodexGoalState`:

```ts
import type { ChatBlock, CodexGoalState, NormalizedMessage, UsageData } from '@/chat/types'
```

Change return type:

```ts
): { blocks: ChatBlock[]; hasReadyEvent: boolean; latestUsage: LatestUsage | null; latestGoal: CodexGoalState | null } {
```

Add before return:

```ts
    let latestGoal: CodexGoalState | null = null
    for (const msg of normalized) {
        if (msg.role !== 'event' || msg.content.type !== 'codex-goal') continue
        if (msg.content.action === 'updated') {
            latestGoal = msg.content.goal
        } else if (msg.content.action === 'cleared') {
            latestGoal = null
        }
    }
```

Update return:

```ts
    return { blocks: dedupeAgentEvents(foldApiErrorEvents(rootResult.blocks)), hasReadyEvent, latestUsage, latestGoal }
```

- [ ] **Step 4: Pass latest goal to composer**

In `SessionChat.tsx`, pass:

```tsx
                        codexGoal={reduced.latestGoal}
```

In `HappyComposer.tsx`, import `CodexGoalState` and add prop:

```ts
import type { CodexGoalState } from '@/chat/types'
```

```ts
    codexGoal?: CodexGoalState | null
```

Pass into `StatusBar`:

```tsx
                        codexGoal={props.codexGoal}
```

- [ ] **Step 5: Render goal chip in `StatusBar.tsx`**

Import type:

```ts
import type { CodexGoalState } from '@/chat/types'
```

Add prop:

```ts
    codexGoal?: CodexGoalState | null
```

Add helper near `formatTokenCount`:

```ts
function formatGoalElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`
}

function formatGoalLabel(goal: CodexGoalState): string {
    const tokenText = goal.tokenBudget !== null
        ? `${formatTokenCount(goal.tokensUsed)}/${formatTokenCount(goal.tokenBudget)}`
        : formatTokenCount(goal.tokensUsed)
    return `goal ${goal.status} · ${tokenText} · ${formatGoalElapsed(goal.timeUsedSeconds)}`
}

function getGoalColor(status: CodexGoalState['status']): string {
    if (status === 'active') return 'text-blue-500'
    if (status === 'complete') return 'text-[#34C759]'
    if (status === 'blocked' || status === 'usageLimited' || status === 'budgetLimited') return 'text-amber-500'
    return 'text-[var(--app-hint)]'
}
```

Render in the left status group after context/cache labels:

```tsx
                {props.codexGoal ? (
                    <span
                        className={`max-w-[16rem] truncate text-[10px] ${getGoalColor(props.codexGoal.status)}`}
                        title={props.codexGoal.objective}
                    >
                        {formatGoalLabel(props.codexGoal)}
                    </span>
                ) : null}
```

- [ ] **Step 6: Run focused web tests**

```bash
cd web && bun test src/chat/reducerGoal.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run web typecheck**

```bash
bun run typecheck:web
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/chat/reducer.ts web/src/chat/reducerGoal.test.ts web/src/components/SessionChat.tsx web/src/components/AssistantChat/HappyComposer.tsx web/src/components/AssistantChat/StatusBar.tsx
git commit -m "feat: show Codex goal progress"
```

---

### Task 7: Final verification and risk checks

**Files:**
- No code changes expected unless verification finds an issue.

- [ ] **Step 1: Run focused CLI tests**

```bash
cd cli && bun test src/codex/utils/goalCommands.test.ts src/codex/utils/appServerEventConverter.test.ts src/codex/codexRemoteLauncher.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused web tests**

```bash
cd web && bun test src/lib/codexSlashCommands.test.ts src/chat/normalize.test.ts src/chat/presentation.test.ts src/chat/reducerGoal.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run package typechecks**

```bash
bun run typecheck:cli
bun run typecheck:web
```

Expected: PASS.

- [ ] **Step 4: Optional manual probe with local app-server**

Only if Codex auth/workspace is usable locally:

```bash
bun run dev
```

Open a Codex remote session and send:

```text
/goal verify goal progress in HAPI; stop after confirming status updates render
```

Expected:
- No normal user turn is created directly by HAPI for the slash command.
- Chat shows a goal event.
- Composer status bar shows `goal active · <used> tokens · <time>` when no budget is present, or `goal active · <used>/<budget> tokens · <time>` when Codex returns a token budget.
- `/goal pause` changes chip to paused.
- `/goal resume` changes chip to active.
- `/goal clear` removes chip after clear event.

If local Codex account returns upstream 402/deactivated workspace, record manual probe as not run and rely on mocked app-server tests.

- [ ] **Step 5: Full test if time allows**

```bash
bun run test:cli
bun run test:web
```

Expected: PASS.

- [ ] **Step 6: Final commit if verification caused fixes**

```bash
git status --short
git add <fixed-files>
git commit -m "test: verify Codex goal progress"
```

Skip commit if working tree is clean.

---

## Rollback plan

If goal support causes issues:

1. Revert the feature commits in reverse order.
2. The risky runtime integration is isolated to `codexRemoteLauncher.ts` and `codexAppServerClient.ts`.
3. Removing `/goal` from the two slash command builtin lists hides the feature from autocomplete immediately.
4. Existing `/clear`, `/compact`, `/plan`, model, reasoning, and permission slash commands should keep working because this plan does not change their behavior.

---

## Self-review

- Spec coverage: native app-server `/goal`, progress event, status bar progress, timeline event, autocomplete, tests all mapped to tasks.
- Placeholder scan: no `TBD` / `TODO` / vague “add tests” steps remain.
- Type consistency: CLI event payload uses `codex_goal`; web normalized event uses `codex-goal`; app-server statuses match generated schema.
- Scope check: no `/loop`; no custom HAPI loop wrapper; no goal editor modal in first version.
