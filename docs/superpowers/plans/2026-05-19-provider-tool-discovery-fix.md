# Provider Tool Discovery Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop HAPI from hiding provider/user tools, and expose provider-native tool/command capability metadata without manually parsing provider config files.

**Architecture:** HAPI stays additive: it injects only its `hapi_session` MCP server and never replaces provider/user tool registries. Claude's default `allowedTools` restriction is removed; provider runtime events are used as source of truth for capabilities. Metadata is stored in existing session metadata fields only when it reflects user-facing capabilities: `tools` for Claude SDK tools and `slashCommands` for provider commands/skills from ACP. Codex MCP startup status remains debug/log data unless a provider API exposes actual tool names.

**Tech Stack:** TypeScript strict, Bun workspaces, Vitest, Claude SDK stream-json wrapper, Codex app-server JSON-RPC, ACP (`opencode`, `gemini`) session updates.

---

## Current Findings To Preserve

- Codex app-server was tested with `thread/start.config.mcp_servers.hapi_session`; runtime still emitted startup statuses for user MCP servers (`MiniMax`, `github-mcp-server`, `agentmemory`, `gitnexus`, `jira-*`, `sequential-thinking`) plus `hapi_session`. Therefore Codex remote config is additive.
- OpenCode ACP was tested with `session/new.mcpServers=[hapi_session]`; `available_commands_update` still contained user MCP/skill commands (`gitnexus:*`, `github-mcp-server:*`, `md2html`, Superpowers skills). Therefore OpenCode remote does not lose user commands.
- Gemini ACP was tested with `session/new.mcpServers=[hapi_session]`; session initialized and emitted `available_commands_update`. It did not prove every user MCP server, but showed no override failure.
- Claude code currently passes `--allowedTools mcp__hapi_session__change_title` by default, which is a real restrictive flag according to `claude --help`.

## File Structure

- Modify `cli/src/claude/claudeRemote.ts`
  - Make baseline HAPI MCP tools non-restrictive. Only send `allowedTools` to Claude when a user message explicitly restricts tools.
- Modify `cli/src/claude/claudeLocalLauncher.ts`
  - Stop passing HAPI MCP tool names to local Claude as restrictive `--allowedTools`. Keep remote baseline available only for explicit web restrictions.
- Modify `cli/src/claude/utils/systemPrompt.ts` and `cli/src/codex/utils/systemPrompt.ts`
  - Clarify that `hapi_session` has one HAPI-added tool, not that all available MCP/tools equal one.
- Modify tests: `cli/src/claude/claudeRemote.test.ts`, `cli/src/claude/sdk/query.test.ts`
  - Lock down no-default-restriction behavior and explicit user restriction behavior.
- Create `cli/src/modules/common/capabilities.ts`
  - Small helpers for merging metadata arrays and normalizing command/tool names.
- Test `cli/src/modules/common/capabilities.test.ts`
  - Unit tests for merge/dedupe/sort behavior.
- Modify `cli/src/agent/backends/acp/AcpSdkBackend.ts`
  - Add optional `onAvailableCommands(handler)` API and emit parsed available commands from ACP `session/update`.
- Modify `cli/src/agent/backends/acp/AcpSdkBackend.test.ts`
  - Verify available commands callback receives names/descriptions.
- Modify `cli/src/opencode/opencodeRemoteLauncher.ts` and `cli/src/gemini/geminiRemoteLauncher.ts`
  - Register available command callbacks and update metadata `slashCommands` with provider-prefixed names.
- Modify tests: `cli/src/opencode/opencodeRemoteLauncher.test.ts`, `cli/src/gemini/geminiRemoteLauncher.test.ts`
  - Verify remote launchers update session metadata from available commands.

---

### Task 1: Make Claude default tool access non-restrictive

**Files:**
- Modify: `cli/src/claude/claudeRemote.ts`
- Modify: `cli/src/claude/claudeLocalLauncher.ts`
- Test: `cli/src/claude/claudeRemote.test.ts`
- Test: `cli/src/claude/sdk/query.test.ts`

- [ ] **Step 1: Add a failing query test proving undefined/empty `allowedTools` does not spawn `--allowedTools`**

Add this test inside `describe('Query', ...)` in `cli/src/claude/sdk/query.test.ts`:

```ts
    it('does not pass --allowedTools when no restriction is requested', async () => {
        const child = createFakeChild()
        spawnMock.mockReturnValueOnce(child)
        process.env.HAPI_CLAUDE_PATH = 'claude'

        const { query } = await import('./query')
        const result = query({
            prompt: 'hello',
            options: {
                allowedTools: []
            }
        })

        child.stdout.write(JSON.stringify({
            type: 'result',
            subtype: 'success',
            num_turns: 1,
            total_cost_usd: 0,
            duration_ms: 1,
            duration_api_ms: 1,
            is_error: false,
            session_id: 's-1'
        }) + '\n')
        child.emit('close', 0)

        await result.next()
        const [, args] = spawnMock.mock.calls[0]
        expect(args).not.toContain('--allowedTools')
    })
```

- [ ] **Step 2: Add a failing query test proving explicit restrictions still spawn `--allowedTools`**

Add this test after the previous one:

```ts
    it('passes --allowedTools when an explicit restriction is requested', async () => {
        const child = createFakeChild()
        spawnMock.mockReturnValueOnce(child)
        process.env.HAPI_CLAUDE_PATH = 'claude'

        const { query } = await import('./query')
        const result = query({
            prompt: 'hello',
            options: {
                allowedTools: ['Read', 'mcp__github__get_issue']
            }
        })

        child.stdout.write(JSON.stringify({
            type: 'result',
            subtype: 'success',
            num_turns: 1,
            total_cost_usd: 0,
            duration_ms: 1,
            duration_api_ms: 1,
            is_error: false,
            session_id: 's-1'
        }) + '\n')
        child.emit('close', 0)

        await result.next()
        const [, args] = spawnMock.mock.calls[0]
        expect(args).toContain('--allowedTools')
        expect(args).toContain('Read,mcp__github__get_issue')
    })
```

- [ ] **Step 3: Add a failing `claudeRemote` test proving baseline `allowedTools` are not forwarded when user did not restrict**

Add this test inside `describe('claudeRemote async message handling', ...)` in `cli/src/claude/claudeRemote.test.ts`:

```ts
    it('does not restrict Claude tools to HAPI baseline tools by default', async () => {
        const querySpy = vi.spyOn(claudeSdk, 'query').mockImplementation(queryMock as typeof claudeSdk.query)
        const { claudeRemote } = await import('./claudeRemote')

        const sdkMessages: SDKMessage[] = [
            {
                type: 'result',
                subtype: 'success',
                num_turns: 1,
                total_cost_usd: 0,
                duration_ms: 1,
                duration_api_ms: 1,
                is_error: false,
                session_id: 's-1'
            } as unknown as SDKMessage
        ]
        queryMock.mockReturnValueOnce(createAsyncStream(sdkMessages))

        try {
            await claudeRemote({
                sessionId: 'session-1',
                path: process.cwd(),
                mcpServers: {},
                claudeEnvVars: {},
                claudeArgs: [],
                allowedTools: ['mcp__hapi_session__change_title'],
                hookSettingsPath: '/tmp/hook.json',
                canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
                nextMessage: async () => ({ message: 'A', mode: { permissionMode: 'default' } }),
                onReady: () => {},
                isAborted: () => false,
                onSessionFound: () => {},
                onMessage: () => {},
                onCompletionEvent: () => {},
                onSessionReset: () => {}
            })

            expect(queryMock).toHaveBeenCalledTimes(1)
            const options = queryMock.mock.calls[0][0].options
            expect(options.allowedTools).toBeUndefined()
        } finally {
            queryMock.mockReset()
            querySpy.mockRestore()
        }
    })
```

- [ ] **Step 4: Add a failing `claudeRemote` test proving explicit user restrictions are preserved and include HAPI title tool**

Add this test after the previous one:

```ts
    it('preserves explicit user allowedTools restrictions and appends HAPI title tool', async () => {
        const querySpy = vi.spyOn(claudeSdk, 'query').mockImplementation(queryMock as typeof claudeSdk.query)
        const { claudeRemote } = await import('./claudeRemote')

        const sdkMessages: SDKMessage[] = [
            {
                type: 'result',
                subtype: 'success',
                num_turns: 1,
                total_cost_usd: 0,
                duration_ms: 1,
                duration_api_ms: 1,
                is_error: false,
                session_id: 's-1'
            } as unknown as SDKMessage
        ]
        queryMock.mockReturnValueOnce(createAsyncStream(sdkMessages))

        try {
            await claudeRemote({
                sessionId: 'session-1',
                path: process.cwd(),
                mcpServers: {},
                claudeEnvVars: {},
                claudeArgs: [],
                allowedTools: ['mcp__hapi_session__change_title'],
                hookSettingsPath: '/tmp/hook.json',
                canCallTool: async () => ({ behavior: 'allow', updatedInput: {} }),
                nextMessage: async () => ({
                    message: 'A',
                    mode: {
                        permissionMode: 'default',
                        allowedTools: ['Read']
                    }
                }),
                onReady: () => {},
                isAborted: () => false,
                onSessionFound: () => {},
                onMessage: () => {},
                onCompletionEvent: () => {},
                onSessionReset: () => {}
            })

            expect(queryMock).toHaveBeenCalledTimes(1)
            const options = queryMock.mock.calls[0][0].options
            expect(options.allowedTools).toEqual(['Read', 'mcp__hapi_session__change_title'])
        } finally {
            queryMock.mockReset()
            querySpy.mockRestore()
        }
    })
```

- [ ] **Step 5: Run failing tests**

Run:

```bash
bun test cli/src/claude/claudeRemote.test.ts cli/src/claude/sdk/query.test.ts
```

Expected before implementation: `claudeRemote` default restriction test fails because `options.allowedTools` equals `['mcp__hapi_session__change_title']`.

- [ ] **Step 6: Change `claudeRemote` option type and option assembly**

In `cli/src/claude/claudeRemote.ts`, change the function option from required list to optional baseline list:

```ts
    allowedTools?: string[],
```

Replace current SDK option line:

```ts
        allowedTools: initial.mode.allowedTools ? initial.mode.allowedTools.concat(opts.allowedTools) : opts.allowedTools,
```

with:

```ts
        allowedTools: initial.mode.allowedTools
            ? initial.mode.allowedTools.concat(opts.allowedTools ?? [])
            : undefined,
```

- [ ] **Step 7: Keep remote HAPI baseline available only for explicit restrictions**

Do not remove this property from `cli/src/claude/runClaude.ts`:

```ts
            allowedTools: happyServer.toolNames.map(toolName => `mcp__hapi_session__${toolName}`),
```

Reason: remote `claudeRemote` now uses this baseline only when `initial.mode.allowedTools` is explicitly present. This preserves the title tool when the user intentionally restricts tools, without restricting default provider tools.

- [ ] **Step 8: Stop local Claude from receiving baseline HAPI allowedTools as a restriction**

In `cli/src/claude/claudeLocalLauncher.ts`, remove this property from the `claudeLocal({ ... })` call:

```ts
                allowedTools: session.allowedTools,
```

Reason: local Claude CLI would turn this into `--allowedTools mcp__hapi_session__change_title`, which restricts local sessions by default. The HAPI MCP server remains available through `mcpServers`; no allowed-tools flag is needed.

- [ ] **Step 9: Run Claude tests**


Run:

```bash
bun test cli/src/claude/claudeRemote.test.ts cli/src/claude/sdk/query.test.ts cli/src/claude/runClaudeMcpConfig.test.ts
```

Expected: all tests pass.

- [ ] **Step 10: Commit Task 1**

```bash
git add cli/src/claude/claudeRemote.ts cli/src/claude/claudeLocalLauncher.ts cli/src/claude/claudeRemote.test.ts cli/src/claude/sdk/query.test.ts
git commit -m "fix: avoid restricting claude tools by default"
```

---

### Task 2: Clarify HAPI title-tool prompt so agents do not infer only one total MCP tool exists

**Files:**
- Modify: `cli/src/claude/utils/systemPrompt.ts`
- Modify: `cli/src/codex/utils/systemPrompt.ts`
- Test: `cli/src/claude/runClaudeMcpConfig.test.ts`
- Test: `cli/src/codex/utils/codexMcpConfig.test.ts`

- [ ] **Step 1: Add prompt expectation tests**

Append this test to `cli/src/claude/runClaudeMcpConfig.test.ts`. Add `systemPrompt` import near existing imports:

```ts
import { systemPrompt } from './utils/systemPrompt'

describe('Claude HAPI title prompt wording', () => {
    it('describes hapi_session as HAPI-added, not the whole provider tool universe', () => {
        expect(systemPrompt).toContain('The HAPI-added MCP server named "hapi_session" provides exactly one tool: change_title.')
        expect(systemPrompt).toContain('Other provider, user, project, and global tools may also be available.')
    })
})
```

Append this test to `cli/src/codex/utils/codexMcpConfig.test.ts`. Add `TITLE_INSTRUCTION` import near existing imports:

```ts
import { TITLE_INSTRUCTION } from './systemPrompt'

describe('Codex HAPI title prompt wording', () => {
    it('describes hapi_session as HAPI-added, not the whole provider tool universe', () => {
        expect(TITLE_INSTRUCTION).toContain('The HAPI-added MCP server named "hapi_session" provides exactly one tool: change_title.')
        expect(TITLE_INSTRUCTION).toContain('Other provider, user, project, and global tools may also be available.')
    })
})
```

If either test file already imports `describe`, `it`, or `expect`, reuse existing imports instead of duplicating them.

- [ ] **Step 2: Run failing prompt tests**

Run:

```bash
bun test cli/src/claude/runClaudeMcpConfig.test.ts cli/src/codex/utils/codexMcpConfig.test.ts
```

Expected before implementation: new prompt wording tests fail.

- [ ] **Step 3: Update Claude prompt wording**

In `cli/src/claude/utils/systemPrompt.ts`, replace this sentence:

```ts
    The "hapi_session" MCP server provides exactly ONE tool: change_title. It has no resources, no prompts, no skills, and no other capabilities. Do NOT query it for anything else.
```

with:

```ts
    The HAPI-added MCP server named "hapi_session" provides exactly one tool: change_title. It has no resources, no prompts, no skills, and no other capabilities. Do NOT query hapi_session for anything else. Other provider, user, project, and global tools may also be available.
```

- [ ] **Step 4: Update Codex prompt wording**

In `cli/src/codex/utils/systemPrompt.ts`, replace this sentence:

```ts
    The "hapi_session" MCP server provides exactly ONE tool: change_title. It has no resources, no prompts, no skills, and no other capabilities. Do NOT query it for anything else.
```

with:

```ts
    The HAPI-added MCP server named "hapi_session" provides exactly one tool: change_title. It has no resources, no prompts, no skills, and no other capabilities. Do NOT query hapi_session for anything else. Other provider, user, project, and global tools may also be available.
```

- [ ] **Step 5: Run prompt tests**

Run:

```bash
bun test cli/src/claude/runClaudeMcpConfig.test.ts cli/src/codex/utils/codexMcpConfig.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add cli/src/claude/utils/systemPrompt.ts cli/src/codex/utils/systemPrompt.ts cli/src/claude/runClaudeMcpConfig.test.ts cli/src/codex/utils/codexMcpConfig.test.ts
git commit -m "docs: clarify hapi title tool scope"
```

---

### Task 3: Add small capability metadata helpers

**Files:**
- Create: `cli/src/modules/common/capabilities.ts`
- Create: `cli/src/modules/common/capabilities.test.ts`

- [ ] **Step 1: Write failing helper tests**

Create `cli/src/modules/common/capabilities.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
    mergeCapabilityNames,
    normalizeCapabilityName,
    toProviderCommandName
} from './capabilities'

describe('capability metadata helpers', () => {
    it('normalizes capability names by trimming and dropping empty values', () => {
        expect(normalizeCapabilityName('  Read  ')).toBe('Read')
        expect(normalizeCapabilityName('')).toBeNull()
        expect(normalizeCapabilityName('   ')).toBeNull()
    })

    it('merges, dedupes, and sorts capability names', () => {
        expect(mergeCapabilityNames(['Read', 'Bash'], [' Bash ', 'Edit', '', 'Read'])).toEqual([
            'Bash',
            'Edit',
            'Read'
        ])
    })

    it('prefixes provider commands', () => {
        expect(toProviderCommandName('opencode', 'gitnexus:detect_impact')).toBe('opencode:gitnexus:detect_impact')
        expect(toProviderCommandName('gemini', 'memory show')).toBe('gemini:memory show')
        expect(toProviderCommandName('gemini', '   ')).toBeNull()
    })

})
```

- [ ] **Step 2: Run failing helper tests**

Run:

```bash
bun test cli/src/modules/common/capabilities.test.ts
```

Expected: fails because module does not exist.

- [ ] **Step 3: Implement helpers**

Create `cli/src/modules/common/capabilities.ts`:

```ts
export function normalizeCapabilityName(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

export function mergeCapabilityNames(
    existing: readonly string[] | undefined,
    incoming: readonly unknown[] | undefined
): string[] {
    const names = new Set<string>()
    for (const value of existing ?? []) {
        const normalized = normalizeCapabilityName(value)
        if (normalized) names.add(normalized)
    }
    for (const value of incoming ?? []) {
        const normalized = normalizeCapabilityName(value)
        if (normalized) names.add(normalized)
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b))
}

export function toProviderCommandName(provider: 'opencode' | 'gemini', commandName: unknown): string | null {
    const normalized = normalizeCapabilityName(commandName)
    return normalized ? `${provider}:${normalized}` : null
}

```

- [ ] **Step 4: Run helper tests**

Run:

```bash
bun test cli/src/modules/common/capabilities.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add cli/src/modules/common/capabilities.ts cli/src/modules/common/capabilities.test.ts
git commit -m "feat: add capability metadata helpers"
```

---

### Task 4: Document Codex remote merge behavior as a regression note

**Files:**
- Modify: `docs/superpowers/plans/2026-05-19-provider-tool-discovery-fix.md` only if runtime evidence changes during implementation.

- [ ] **Step 1: Do not add Codex MCP status metadata**

Codex app-server already emits `mcpServer/startupStatus/updated` for user MCP servers plus `hapi_session`, proving additive merge behavior. These events are server health states, not actual tool names. Do not store `mcp:<server>:<status>` in `metadata.tools`; that would conflate MCP server status with callable tools.

- [ ] **Step 2: Keep Codex runtime unchanged**

No code change is required for Codex in this plan. Existing Codex event conversion for actual MCP tool calls (`mcp_tool_call_begin` / `mcp_tool_call_end`) remains sufficient for transcript display.

---

### Task 5: Expose ACP available commands from backend

**Files:**
- Modify: `cli/src/agent/backends/acp/AcpSdkBackend.ts`
- Modify: `cli/src/agent/types.ts`
- Test: `cli/src/agent/backends/acp/AcpSdkBackend.test.ts`

- [ ] **Step 1: Add failing backend test for available commands callback**

In `cli/src/agent/backends/acp/AcpSdkBackend.test.ts`, add this test inside `describe('AcpSdkBackend', ...)`. It uses the existing private-method access pattern already used by other tests in this file:

```ts
    it('emits available commands from ACP session updates', () => {
        const backend = new AcpSdkBackend({ command: 'opencode' })
        const received: Array<Array<{ name: string; description?: string }>> = []
        backend.onAvailableCommands((commands) => received.push(commands))

        const backendInternal = backend as unknown as {
            handleSessionUpdate: (params: unknown) => void
        }

        backendInternal.handleSessionUpdate({
            sessionId: 'session-1',
            update: {
                sessionUpdate: 'available_commands_update',
                availableCommands: [
                    { name: 'gitnexus:detect_impact', description: 'Analyze impact' },
                    { name: 'md2html' },
                    { name: '' },
                    { description: 'missing name' }
                ]
            }
        })

        expect(received).toEqual([[
            { name: 'gitnexus:detect_impact', description: 'Analyze impact' },
            { name: 'md2html' }
        ]])
    })
```

- [ ] **Step 2: Run failing ACP backend test**

Run:

```bash
bun test cli/src/agent/backends/acp/AcpSdkBackend.test.ts
```

Expected: fails because `onAvailableCommands` does not exist.

- [ ] **Step 3: Add callback type and method**

In `cli/src/agent/backends/acp/AcpSdkBackend.ts`, add near model descriptor types:

```ts
export type AcpAvailableCommand = {
    name: string
    description?: string
}
```

Inside class fields, add:

```ts
    private availableCommandsHandler: ((commands: AcpAvailableCommand[]) => void) | null = null;
```

Add public method:

```ts
    onAvailableCommands(handler: ((commands: AcpAvailableCommand[]) => void) | null): void {
        this.availableCommandsHandler = handler
    }
```

In `cli/src/agent/types.ts`, add a shared command type:

```ts
export type AgentAvailableCommand = {
    name: string;
    description?: string;
};
```

and add optional method to `AgentBackend`:

```ts
    onAvailableCommands?(handler: ((commands: AgentAvailableCommand[]) => void) | null): void;
```

- [ ] **Step 4: Parse available commands in `handleSessionUpdate`**

In `handleSessionUpdate(params: unknown)`, after `const update = params.update;`, add:

```ts
        this.handleAvailableCommandsUpdate(update)
```

Add private method inside class:

```ts
    private handleAvailableCommandsUpdate(update: unknown): void {
        if (!isObject(update)) return
        if (update.sessionUpdate !== 'available_commands_update') return
        if (!Array.isArray(update.availableCommands)) return

        const commands: AcpAvailableCommand[] = []
        for (const entry of update.availableCommands) {
            if (!isObject(entry)) continue
            const name = asString(entry.name)
            if (!name) continue
            const description = asString(entry.description) ?? undefined
            commands.push(description ? { name, description } : { name })
        }

        if (commands.length > 0) {
            this.availableCommandsHandler?.(commands)
        }
    }
```

- [ ] **Step 5: Run ACP backend test**

Run:

```bash
bun test cli/src/agent/backends/acp/AcpSdkBackend.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add cli/src/agent/backends/acp/AcpSdkBackend.ts cli/src/agent/types.ts cli/src/agent/backends/acp/AcpSdkBackend.test.ts
git commit -m "feat: expose acp available commands"
```

---

### Task 6: Record OpenCode and Gemini available commands in session metadata

**Files:**
- Modify: `cli/src/opencode/opencodeRemoteLauncher.ts`
- Modify: `cli/src/gemini/geminiRemoteLauncher.ts`
- Test: `cli/src/opencode/opencodeRemoteLauncher.test.ts`
- Test: `cli/src/gemini/geminiRemoteLauncher.test.ts`

- [ ] **Step 1: Update OpenCode backend mock test to support `onAvailableCommands`**

In `cli/src/opencode/opencodeRemoteLauncher.test.ts`, extend the mock backend object:

```ts
        onAvailableCommands: vi.fn((handler: (commands: Array<{ name: string; description?: string }>) => void) => {
            harness.onAvailableCommandsHandler = handler
        }),
```

Add to `harness`:

```ts
    onAvailableCommandsHandler: null as null | ((commands: Array<{ name: string; description?: string }>) => void),
```

Add `metadataUpdates` support to the session client stub:

```ts
    const metadataUpdates: unknown[] = []
```

and client method:

```ts
        updateMetadata(handler: (metadata: any) => any) {
            const next = handler(metadataUpdates.at(-1) ?? { path: session.path, host: 'test' })
            metadataUpdates.push(next)
        },
```

Return `metadataUpdates` from `createSessionStub`.

- [ ] **Step 2: Add failing OpenCode metadata test**

Add test in `cli/src/opencode/opencodeRemoteLauncher.test.ts`:

```ts
    it('records available OpenCode commands in slash command metadata', async () => {
        const { session, metadataUpdates } = createSessionStub([
            { message: 'hello', mode: createMode() }
        ])

        await opencodeRemoteLauncher(session as any)

        harness.onAvailableCommandsHandler?.([
            { name: 'gitnexus:detect_impact', description: 'Analyze impact' },
            { name: 'md2html' }
        ])

        expect(metadataUpdates.at(-1)).toMatchObject({
            slashCommands: [
                'opencode:gitnexus:detect_impact',
                'opencode:md2html'
            ]
        })
    })
```

- [ ] **Step 3: Update Gemini backend mock test to support `onAvailableCommands`**

Mirror Step 1 in `cli/src/gemini/geminiRemoteLauncher.test.ts`:

```ts
    onAvailableCommandsHandler: null as null | ((commands: Array<{ name: string; description?: string }>) => void),
```

Mock method:

```ts
        onAvailableCommands: vi.fn((handler: (commands: Array<{ name: string; description?: string }>) => void) => {
            harness.onAvailableCommandsHandler = handler
        }),
```

Add `metadataUpdates` and client `updateMetadata` as in OpenCode.

- [ ] **Step 4: Add failing Gemini metadata test**

Add test in `cli/src/gemini/geminiRemoteLauncher.test.ts`:

```ts
    it('records available Gemini commands in slash command metadata', async () => {
        const { session, metadataUpdates } = createSessionStub([
            { message: 'hello', mode: createMode() }
        ])

        await geminiRemoteLauncher(session as any, { model: 'gemini-3-flash-preview' })

        harness.onAvailableCommandsHandler?.([
            { name: 'memory show' },
            { name: 'extensions list' }
        ])

        expect(metadataUpdates.at(-1)).toMatchObject({
            slashCommands: [
                'gemini:extensions list',
                'gemini:memory show'
            ]
        })
    })
```

- [ ] **Step 5: Run failing remote launcher tests**

Run:

```bash
bun test cli/src/opencode/opencodeRemoteLauncher.test.ts cli/src/gemini/geminiRemoteLauncher.test.ts
```

Expected before implementation: metadata assertions fail because launchers do not register `onAvailableCommands`.

- [ ] **Step 6: Implement OpenCode metadata update**

In `cli/src/opencode/opencodeRemoteLauncher.ts`, import helpers:

```ts
import { mergeCapabilityNames, toProviderCommandName } from '@/modules/common/capabilities';
```

After `await backend.initialize();`, register:

```ts
        backend.onAvailableCommands?.((commands) => {
            const names = commands
                .map((command) => toProviderCommandName('opencode', command.name))
                .filter((name): name is string => Boolean(name))
            if (names.length === 0) return
            session.client.updateMetadata((metadata) => ({
                ...metadata,
                slashCommands: mergeCapabilityNames(metadata.slashCommands, names)
            }))
        })
```


- [ ] **Step 7: Implement Gemini metadata update**

In `cli/src/gemini/geminiRemoteLauncher.ts`, import helpers:

```ts
import { mergeCapabilityNames, toProviderCommandName } from '@/modules/common/capabilities';
```

After `await backend.initialize();`, register:

```ts
        backend.onAvailableCommands?.((commands) => {
            const names = commands
                .map((command) => toProviderCommandName('gemini', command.name))
                .filter((name): name is string => Boolean(name))
            if (names.length === 0) return
            session.client.updateMetadata((metadata) => ({
                ...metadata,
                slashCommands: mergeCapabilityNames(metadata.slashCommands, names)
            }))
        })
```

- [ ] **Step 8: Run remote launcher tests**

Run:

```bash
bun test cli/src/opencode/opencodeRemoteLauncher.test.ts cli/src/gemini/geminiRemoteLauncher.test.ts cli/src/agent/backends/acp/AcpSdkBackend.test.ts cli/src/modules/common/capabilities.test.ts
```

Expected: pass.

- [ ] **Step 9: Commit Task 6**

```bash
git add cli/src/opencode/opencodeRemoteLauncher.ts cli/src/gemini/geminiRemoteLauncher.ts cli/src/opencode/opencodeRemoteLauncher.test.ts cli/src/gemini/geminiRemoteLauncher.test.ts cli/src/agent/types.ts
git commit -m "feat: record acp provider commands"
```

---

### Task 7: End-to-end verification and regression commands

**Files:**
- No code files required unless verification exposes failures.

- [ ] **Step 1: Run focused test suite**

Run:

```bash
bun test \
  cli/src/claude/claudeRemote.test.ts \
  cli/src/claude/sdk/query.test.ts \
  cli/src/claude/runClaudeMcpConfig.test.ts \
  cli/src/codex/utils/codexMcpConfig.test.ts \
  cli/src/modules/common/capabilities.test.ts \
  cli/src/agent/backends/acp/AcpSdkBackend.test.ts \
  cli/src/opencode/opencodeRemoteLauncher.test.ts \
  cli/src/gemini/geminiRemoteLauncher.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 2: Run package typecheck**

Run from repo root:

```bash
bun typecheck
```

Expected: typecheck succeeds with exit code 0.

- [ ] **Step 3: Run full CLI/hub test suite**

Run from repo root:

```bash
bun run test
```

Expected: test suite succeeds with exit code 0.

- [ ] **Step 4: Manual smoke for Codex app-server merge behavior**

Run this one-off script:

```bash
node <<'NODE'
const cp=require('child_process');
const cwd=process.cwd();
const p=cp.spawn('codex',['app-server'],{stdio:['pipe','pipe','pipe'],cwd});
p.stdout.setEncoding('utf8');
let buf='';
p.stdout.on('data',d=>{buf+=d; let i; while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i); buf=buf.slice(i+1); if(!line.trim()) continue; try{const msg=JSON.parse(line); if(msg.method==='mcpServer/startupStatus/updated') console.log('MCP',msg.params.name,msg.params.status);}catch{}}});
function send(id,method,params){p.stdin.write(JSON.stringify({id,method,params})+'\n')}
send(1,'initialize',{clientInfo:{name:'hapi-smoke',version:'0'},capabilities:{experimentalApi:true}});
setTimeout(()=>{p.stdin.write(JSON.stringify({method:'initialized'})+'\n'); send(2,'thread/start',{cwd,approvalPolicy:'never',sandbox:'read-only',config:{'mcp_servers.hapi_session':{command:'node',args:['-e','process.exit(0)']}}})},1000);
setTimeout(()=>p.kill('SIGTERM'),8000);
NODE
```

Expected: output includes existing user MCP servers and `hapi_session`.

- [ ] **Step 5: Manual smoke for OpenCode ACP commands**

Run:

```bash
node <<'NODE'
const cp=require('child_process');
const cwd=process.cwd();
const p=cp.spawn('opencode',['acp','--cwd',cwd],{stdio:['pipe','pipe','pipe']});
p.stdout.setEncoding('utf8');
let buf='';
p.stdout.on('data',d=>{buf+=d; let i; while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i); buf=buf.slice(i+1); if(!line.trim()) continue; try{const msg=JSON.parse(line); if(msg.method==='session/update' && msg.params.update.availableCommands){console.log(msg.params.update.availableCommands.slice(0,10).map(c=>c.name).join('\n'));}}catch{}}});
function send(id,method,params){p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')}
send(1,'initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'hapi-smoke',version:'0'}});
setTimeout(()=>send(2,'session/new',{cwd,mcpServers:[]}),1000);
setTimeout(()=>p.kill('SIGTERM'),8000);
NODE
```

Expected: output includes user commands such as `gitnexus:*` or project/global skills when configured.

- [ ] **Step 6: Manual smoke for Gemini ACP commands**

Run:

```bash
node <<'NODE'
const cp=require('child_process');
const cwd=process.cwd();
const p=cp.spawn('gemini',['--experimental-acp'],{stdio:['pipe','pipe','pipe'],cwd,env:{...process.env,GEMINI_PROJECT_DIR:cwd}});
p.stdout.setEncoding('utf8');
let buf='';
p.stdout.on('data',d=>{buf+=d; let i; while((i=buf.indexOf('\n'))>=0){const line=buf.slice(0,i); buf=buf.slice(i+1); if(!line.trim() || line[0] !== '{') continue; try{const msg=JSON.parse(line); if(msg.method==='session/update' && msg.params.update.availableCommands){console.log(msg.params.update.availableCommands.slice(0,10).map(c=>c.name).join('\n'));}}catch{}}});
function send(id,method,params){p.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n')}
send(1,'initialize',{protocolVersion:1,clientCapabilities:{fs:{readTextFile:false,writeTextFile:false},terminal:false},clientInfo:{name:'hapi-smoke',version:'0'}});
setTimeout(()=>send(2,'session/new',{cwd,mcpServers:[]}),1000);
setTimeout(()=>p.kill('SIGTERM'),10000);
NODE
```

Expected: output includes Gemini commands such as `memory`, `extensions`, or configured skills.

- [ ] **Step 7: Final commit if any verification-only fixes were needed**

If Steps 1-6 required fixes, commit them:

```bash
git add cli/src shared/src hub/src web/src
git commit -m "test: verify provider capability discovery"
```

If no files changed, skip this commit.

---

## Self-Review

- Spec coverage: Tasks cover Claude default restriction, HAPI prompt wording, ACP provider command metadata for OpenCode/Gemini, Codex no-change regression rationale, and verification. No config-file parser is included.
- Placeholder scan: no incomplete placeholder markers remain. Task 4 is an explicit no-code regression decision backed by runtime evidence.
- Type consistency: helper names are consistent across tasks: `mergeCapabilityNames`, `toProviderCommandName`, `onAvailableCommands`.
