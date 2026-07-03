# Story 1.1 Terminal Contract and State Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typed terminal lifecycle contract schemas/types to `@hapi/protocol` without changing runtime terminal behavior yet.

**Architecture:** Shared protocol owns the canonical terminal scope, state, close reason, list, warning, keepalive, and internal close-all payload schemas. Existing legacy terminal payloads remain valid for current code; a single helper normalizes legacy `{ sessionId } | { machineId }` scope into typed `{ scopeType }` scope for later stories.

**Tech Stack:** Bun, TypeScript strict, Zod, `bun:test`.

---

## File Map

| File | Role | Change |
|---|---|---|
| `shared/src/socket.ts` | Socket.IO terminal protocol | Add typed scope schemas, lifecycle state/reason schemas, list/warning/keepalive/internal close-all schemas, normalization helper, event interface entries. |
| `shared/src/socket.test.ts` | Protocol schema tests | New tests for valid list/warning/keepalive/close-all, machine close-all rejection, no raw output in state. |

## Task 1: Add schema tests first

**Files:**
- Create: `shared/src/socket.test.ts`

- [ ] **Step 1: Write failing schema tests**

Create `shared/src/socket.test.ts` with:

```ts
import { describe, expect, it } from 'bun:test'
import {
    TerminalCloseAllPayloadSchema,
    TerminalKeepalivePayloadSchema,
    TerminalListPayloadSchema,
    TerminalScopeTypedSchema,
    TerminalWarningPayloadSchema,
    normalizeTerminalScope
} from './socket'

describe('terminal lifecycle socket schemas', () => {
    it('accepts typed session and machine scopes', () => {
        expect(TerminalScopeTypedSchema.safeParse({ scopeType: 'session', sessionId: 'session-1' }).success).toBe(true)
        expect(TerminalScopeTypedSchema.safeParse({ scopeType: 'machine', machineId: 'machine-1' }).success).toBe(true)
    })

    it('normalizes legacy terminal scopes into typed scopes', () => {
        expect(normalizeTerminalScope({ sessionId: 'session-1' })).toEqual({ scopeType: 'session', sessionId: 'session-1' })
        expect(normalizeTerminalScope({ machineId: 'machine-1' })).toEqual({ scopeType: 'machine', machineId: 'machine-1' })
        expect(normalizeTerminalScope({ sessionId: 'session-1', machineId: 'machine-1' })).toBeNull()
        expect(normalizeTerminalScope({})).toBeNull()
    })

    it('accepts session terminal list payloads without raw output fields', () => {
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
        expect(JSON.stringify(result.data)).not.toContain('outputBuffer')
        expect(JSON.stringify(result.data)).not.toContain('data')
    })

    it('accepts terminal warning and keepalive payloads', () => {
        expect(TerminalWarningPayloadSchema.safeParse({
            scopeType: 'session',
            sessionId: 'session-1',
            terminalId: 'terminal-1',
            reason: 'idle',
            message: 'Terminal has been idle.',
            closesAt: 10
        }).success).toBe(true)

        expect(TerminalKeepalivePayloadSchema.safeParse({
            scopeType: 'session',
            sessionId: 'session-1',
            terminalId: 'terminal-1'
        }).success).toBe(true)
    })

    it('requires a session id for internal close-all', () => {
        expect(TerminalCloseAllPayloadSchema.safeParse({ scopeType: 'session', sessionId: 'session-1' }).success).toBe(true)
        expect(TerminalCloseAllPayloadSchema.safeParse({ scopeType: 'machine', machineId: 'machine-1' }).success).toBe(false)
    })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test shared/src/socket.test.ts
```

Expected: FAIL because exported schemas/helper do not exist.

## Task 2: Add protocol schemas and helper

**Files:**
- Modify: `shared/src/socket.ts`

- [ ] **Step 1: Add typed lifecycle schemas below existing `TerminalScopeSchema`**

Add:

```ts
export const TerminalScopeTypedSchema = z.discriminatedUnion('scopeType', [
    z.object({ scopeType: z.literal('session'), sessionId: z.string().min(1) }).strict(),
    z.object({ scopeType: z.literal('machine'), machineId: z.string().min(1) }).strict()
])
export type TerminalScopeTyped = z.infer<typeof TerminalScopeTypedSchema>

export function normalizeTerminalScope(value: { sessionId?: string; machineId?: string }): TerminalScopeTyped | null {
    if (value.sessionId && !value.machineId) return { scopeType: 'session', sessionId: value.sessionId }
    if (value.machineId && !value.sessionId) return { scopeType: 'machine', machineId: value.machineId }
    return null
}

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
})).superRefine((value, ctx) => {
    for (const terminal of value.terminals) {
        if (terminal.scopeType !== value.scopeType) {
            ctx.addIssue({ code: 'custom', message: 'Terminal scope must match list scope' })
        }
    }
})
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

- [ ] **Step 2: Add event interface entries**

In `ServerToClientEvents` (hub → CLI), add:

```ts
    'terminal:list': (data: TerminalListRequest) => void
    'terminal:keepalive': (data: TerminalKeepalivePayload) => void
    'terminal:close-all': (data: TerminalCloseAllPayload) => void
```

In `ClientToServerEvents` (CLI → hub), add:

```ts
    'terminal:list': (data: TerminalListPayload) => void
    'terminal:warning': (data: TerminalWarningPayload) => void
```

Do not add `terminal:warning` to `ServerToClientEvents`. Do not add `terminal:keepalive` or `terminal:close-all` to `ClientToServerEvents`.

- [ ] **Step 3: Verify GREEN**

Run:

```bash
bun test shared/src/socket.test.ts
bun run typecheck
```

Expected: both pass.

Required negative coverage before green:
- `TerminalStateSchema` rejects `outputBuffer` and `data` unknown fields.
- `TerminalListPayloadSchema` rejects child terminal scope mismatch.
- live states reject non-null `closeReason`; closed/lost/exited states reject null `closeReason`.
- `terminal:close-all` is not present on `ClientToServerEvents`.
- Typed scope schemas reject extra opposite identifiers like session payload carrying `machineId`.

## Self-Review Checklist

- No raw output in `TerminalStateSchema` or `TerminalListPayloadSchema`; strict schemas reject unknown raw fields.
- `TerminalCloseAllPayloadSchema` rejects machine scope.
- Legacy scope helper exists in one place.
- No existing terminal payload schema removed.
- No production runtime behavior changed outside shared contract.
