# Team Runtime Phase 1 Delivery Guardrails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden Team Chat delivery into an explicit Team delivery ledger so normal Agent Mode and Editor Mode remain safe while Team messages can broadcast context to session members.

**Architecture:** Reuse the existing `team_mention_requests` table as the Phase 1 delivery ledger, adding `deliveryKind` and `requiresResponse` instead of creating a second mailbox/task system. Team Chat creates required mention deliveries for tagged members and optional broadcast deliveries for other session members; direct/private session chat remains outside Team Runtime because only messages with explicit `meta.sentFrom = 'team-chat'` participate in Team handling. Auto-report becomes conservative: plain agent text is posted back to Team only when exactly one compatible open required mention exists for that session, otherwise the agent must use the explicit report tool.

**Tech Stack:** Bun, TypeScript strict, SQLite via `bun:sqlite`, Hono routes, Socket.IO CLI updates, TanStack Query, React/Vitest/Bun test.

---

## Scope

### In scope

- Add Team delivery fields to shared schemas, store types, SQLite schema, and migrations.
- Support two delivery kinds:
  - `mention`: required response path for explicit `@Member` mentions.
  - `broadcast`: optional context path for non-mentioned session members.
- Fan out Team Chat messages to all session members without self-echoing agent reports.
- Keep optional broadcasts out of active “needs response” queue pressure.
- Add guarded auto-report behavior for ambiguous multi-delivery sessions.
- Update session-side and Team-side UI labels for required vs optional deliveries.
- Add regression verification commands for Agent Mode and Editor Mode.

### Out of scope

- Team Tasks board.
- Team Memory.
- Team Mailbox/direct agent-to-agent mail.
- Team Secretary/Minimax provider settings.
- Build/restart/e2e service verification; user handles manual rebuild/restart.

---

## File Structure Map

### Shared protocol

- Modify `shared/src/schemas.ts`
  - Add `TeamDeliveryKindSchema`.
  - Add `deliveryKind` and `requiresResponse` to `TeamMentionRequestSchema`.
- Modify `shared/src/types.ts`
  - Export `TeamDeliveryKind` if schemas export list needs it.
- Modify `shared/src/teamChat.test.ts`
  - Add schema regression for required mentions and optional broadcasts.

### Hub store and migrations

- Modify `hub/src/store/index.ts`
  - Bump `SCHEMA_VERSION` from `10` to `11`.
  - Add `migrateFromV10ToV11`.
  - Add `delivery_kind` and `requires_response` columns to `team_mention_requests` in `createTeamChatSchema`.
  - Add helper `getTeamMentionRequestColumnNames`.
- Modify `hub/src/store/types.ts`
  - Add `deliveryKind: 'mention' | 'broadcast'` and `requiresResponse: boolean` to `StoredTeamMentionRequest`.
- Modify `hub/src/store/teamChatStore.ts`
  - Persist/read the new fields.
  - Add delivery-aware list helpers.
  - Keep monotonic status transitions.
- Modify `hub/src/store/teamChatStore.test.ts`
  - Test defaults, explicit broadcast fields, active list behavior, and status monotonicity.
- Modify `hub/src/store/migration-v8.test.ts`
  - Extend migration expectations for v11 columns.

### Hub Team Runtime services

- Modify `hub/src/sync/teamMentionDeliveryService.ts`
  - Include `teamDeliveryKind` and `requiresResponse` in session message meta.
  - Keep card-only guard for inactive/thinking/user-controlled sessions.
- Modify `hub/src/sync/messageService.ts`
  - Extend `sendTeamMentionMessage` meta type.
- Modify `hub/src/sync/teamChatService.ts`
  - Create required mention deliveries and optional broadcast deliveries.
  - Build separate mention vs broadcast envelopes.
  - Prevent self-echo for agent reports.
  - Harden plain auto-report ambiguity handling.
- Modify `hub/src/sync/teamMentionDeliveryService.test.ts`
  - Verify meta, optional broadcast, and card-only behavior.
- Modify `hub/src/sync/teamChatService.test.ts`
  - Verify fanout rules.
- Modify `hub/src/sync/teamReports.test.ts`
  - Verify self-echo prevention and explicit report still works.
- Modify `hub/src/sync/sessionModel.test.ts`
  - Verify direct private chat does not leak auto-report.

### Web UI and client types

- Modify `web/src/types/api.ts`
  - Add `deliveryKind` and `requiresResponse` to `TeamMentionRequest`.
- Modify `web/src/chat/types.ts`
  - Add the same fields to `TeamMentionBlock`.
- Modify `web/src/chat/reducerTimeline.ts`
  - Parse delivery meta into Team blocks.
- Modify `web/src/chat/reducerTimeline.test.ts`
  - Verify delivery kind parsing and fallback defaults.
- Modify `web/src/components/AssistantChat/TeamMentionQueueBar.tsx`
  - Count only `requiresResponse === true` deliveries as active queue pressure.
- Modify `web/src/components/AssistantChat/TeamMentionQueueBar.test.tsx`
  - Verify optional broadcasts are hidden from queue bar.
- Modify `web/src/components/AssistantChat/messages/TeamMentionMessage.tsx`
  - Render “Team mention” vs “Team update”.
  - Use lighter actions for optional broadcasts.
- Modify `web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx`
  - Verify labels and seen/no-action behavior.
- Modify `web/src/components/TeamChat/TeamMessageCard.tsx`
  - Render optional broadcast status without “no reply yet” pressure.
- Modify `web/src/components/TeamChat/TeamMessageCard.test.tsx`
  - Verify status chips for optional broadcast.
- Modify `web/src/components/TeamChat/TeamChatRightPanel.tsx`
  - Do not treat optional pending broadcasts as “Waiting for response”.
- Modify `web/src/components/TeamChat/TeamChatRightPanel.test.tsx`
  - Verify optional pending does not create attention item.

---

## Delivery Semantics

### Delivery fields

```ts
export type TeamDeliveryKind = 'mention' | 'broadcast'

type StoredTeamMentionRequest = {
    deliveryKind: TeamDeliveryKind
    requiresResponse: boolean
}
```

### Delivery creation rules

| Team event | Target members | deliveryKind | requiresResponse | Agent invoke policy |
|---|---|---:|---:|---|
| User message with `@Member` | Mentioned session members | `mention` | `true` | invoke only if active, not thinking, not user-controlled |
| User message with `@Member` | Other session members | `broadcast` | `false` | invoke only if active, not thinking, not user-controlled |
| User message without mention | All session members | `broadcast` | `false` | invoke only if active, not thinking, not user-controlled |
| Agent report/reply | Mentioned session members except source session | `mention` | `true` | same guard |
| Agent report/reply | Other session members except source session | `broadcast` | `false` | same guard |

### UI active queue rules

```ts
const ACTIVE_STATUSES = new Set(['pending', 'delivered', 'seen', 'processing'])
const isActiveRequiredDelivery = (request: TeamMentionRequest) => (
    request.requiresResponse === true && ACTIVE_STATUSES.has(request.status)
)
```

Optional broadcasts may still be visible as cards in the session transcript, but they must not show the “N Team mentions waiting” bar.

### Optional broadcast terminal rule

Optional broadcasts are context sync, not work requests. After the delivery attempt is persisted:

- successful optional broadcast deliveries must terminal as `no_action`;
- failed optional broadcast deliveries must terminal as `failed`;
- `no_action -> responded` remains allowed so an agent can still explicitly call `report_to_team` later if the broadcast turns out to need a public answer;
- optional broadcasts must never be selected for plain text auto-report.

This keeps the Team delivery ledger clean and prevents invisible active queues from growing forever.

### Plain auto-report rule

Plain agent text can be posted to Team only when exactly one open required mention delivery exists for the session.

```ts
const AUTO_REPORTABLE_STATUSES = new Set(['pending', 'delivered', 'seen', 'processing'])
const open = store.teamChats.listAutoReportableDeliveries(namespace, sessionId)
if (open.length !== 1) return null
if (input.requestId && input.requestId !== open[0].id) return null
```

`listAutoReportableDeliveries` must filter to:

```sql
r.delivery_kind = 'mention'
AND r.requires_response = 1
AND r.status IN ('pending', 'delivered', 'seen', 'processing')
```

When there are zero, two, or more open required mention deliveries, the safe behavior is no automatic Team post. The agent can still call `report_to_team` with an explicit `replyToRequestId`.

### Partial fanout failure rule

Team message persistence and fanout delivery must be decoupled:

- save the Team message first;
- create one delivery record per target member;
- deliver each target independently;
- if one target delivery throws, mark only that request `failed`;
- do not rollback the Team message or successful sibling deliveries.

### Phase 1 broadcast setting

Phase 1 enables optional broadcasts by default because the product requirement is “Team Chat messages are broadcast to member sessions.” No user-facing setting is added in this plan. The risk controls are:

- optional broadcasts auto-terminal as `no_action`;
- optional broadcasts are excluded from plain auto-report;
- optional broadcasts are excluded from active queue pressure;
- agent reports are not echoed back to the source session.

A per-Team broadcast toggle can be added in a later UX/settings phase if usage shows token pressure.

---

## Task 1: Add Delivery Fields to Protocol and SQLite Store

**Files:**
- Modify: `shared/src/schemas.ts`
- Modify: `shared/src/types.ts`
- Modify: `shared/src/teamChat.test.ts`
- Modify: `hub/src/store/index.ts`
- Modify: `hub/src/store/types.ts`
- Modify: `hub/src/store/teamChatStore.ts`
- Modify: `hub/src/store/teamChatStore.test.ts`
- Modify: `hub/src/store/migration-v8.test.ts`

- [ ] **Step 1: Write shared schema failing test**

Add this case to `shared/src/teamChat.test.ts`:

```ts
it('parses optional Team broadcast delivery fields', () => {
    const parsed = TeamMentionRequestSchema.parse({
        id: 'req-broadcast',
        teamChatId: 'team-1',
        sourceMessageId: 'msg-1',
        targetSessionId: 'session-1',
        status: 'delivered',
        deliveryKind: 'broadcast',
        requiresResponse: false,
        contextSnapshot: {
            originalText: 'General team context',
            sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] },
            attachedFiles: []
        },
        hopDepth: 0,
        createdAt: 100
    })

    expect(parsed.deliveryKind).toBe('broadcast')
    expect(parsed.requiresResponse).toBe(false)
})
```

- [ ] **Step 2: Run shared test and verify it fails**

Run:

```bash
bun test shared/src/teamChat.test.ts
```

Expected: FAIL because `deliveryKind` and `requiresResponse` are not accepted/typed yet.

- [ ] **Step 3: Add shared schemas and types**

In `shared/src/schemas.ts`, add near `TeamMentionStatusSchema`:

```ts
export const TeamDeliveryKindSchema = z.enum(['mention', 'broadcast'])
export type TeamDeliveryKind = z.infer<typeof TeamDeliveryKindSchema>
```

Extend `TeamMentionRequestSchema`:

```ts
deliveryKind: TeamDeliveryKindSchema.default('mention'),
requiresResponse: z.boolean().default(true),
```

In `shared/src/types.ts`, export the inferred type if it uses a named export list:

```ts
TeamDeliveryKind,
```

- [ ] **Step 4: Add store tests for defaults and explicit broadcast fields**

Add to `hub/src/store/teamChatStore.test.ts`:

```ts
it('stores mention delivery defaults and explicit broadcast fields', () => {
    const store = new Store(':memory:')
    const session = store.sessions.getOrCreateSession('target', { path: '/repo' }, null, 'default')
    const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Team' })
    const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', color: '#34d399', role: 'general' })
    const message = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'hello', mentions: [] })

    const mention = store.teamChats.addMentionRequest({
        namespace: 'default',
        teamChatId: chat.id,
        sourceMessageId: message.id,
        targetSessionId: session.id,
        contextSnapshot: { originalText: 'hello', sharedContext: {}, attachedFiles: [] },
        hopDepth: 0
    })
    const broadcast = store.teamChats.addMentionRequest({
        namespace: 'default',
        teamChatId: chat.id,
        sourceMessageId: message.id,
        targetSessionId: session.id,
        deliveryKind: 'broadcast',
        requiresResponse: false,
        contextSnapshot: { originalText: 'hello', sharedContext: {}, attachedFiles: [] },
        hopDepth: 0
    })

    expect(mention.deliveryKind).toBe('mention')
    expect(mention.requiresResponse).toBe(true)
    expect(broadcast.deliveryKind).toBe('broadcast')
    expect(broadcast.requiresResponse).toBe(false)
})
```

- [ ] **Step 5: Run store test and verify it fails**

Run:

```bash
cd hub && bun test src/store/teamChatStore.test.ts
```

Expected: FAIL because store types/table do not contain delivery fields yet.

- [ ] **Step 6: Update SQLite schema and migration**

In `hub/src/store/index.ts`:

1. Change schema version:

```ts
const SCHEMA_VERSION: number = 11
```

2. Add migration step:

```ts
10: () => this.migrateFromV10ToV11(),
```

3. Add columns in `CREATE TABLE IF NOT EXISTS team_mention_requests`:

```sql
delivery_kind TEXT NOT NULL DEFAULT 'mention',
requires_response INTEGER NOT NULL DEFAULT 1,
```

Place them after `status TEXT NOT NULL`.

4. Add helper:

```ts
private getTeamMentionRequestColumnNames(): Set<string> {
    const rows = this.db.prepare('PRAGMA table_info(team_mention_requests)').all() as Array<{ name: string }>
    return new Set(rows.map((row) => row.name))
}
```

5. Add migration:

```ts
private migrateFromV10ToV11(): void {
    this.createTeamChatSchema()
    const columns = this.getTeamMentionRequestColumnNames()
    if (columns.size === 0) return
    if (!columns.has('delivery_kind')) {
        this.db.exec("ALTER TABLE team_mention_requests ADD COLUMN delivery_kind TEXT NOT NULL DEFAULT 'mention'")
    }
    if (!columns.has('requires_response')) {
        this.db.exec('ALTER TABLE team_mention_requests ADD COLUMN requires_response INTEGER NOT NULL DEFAULT 1')
    }
}
```

- [ ] **Step 7: Update store types and row mapping**

In `hub/src/store/types.ts`, add:

```ts
deliveryKind: 'mention' | 'broadcast'
requiresResponse: boolean
```

In `hub/src/store/teamChatStore.ts`:

1. Add row fields:

```ts
delivery_kind: StoredTeamMentionRequest['deliveryKind']
requires_response: number
```

2. Extend `addMentionRequest` input:

```ts
deliveryKind?: StoredTeamMentionRequest['deliveryKind']
requiresResponse?: boolean
```

3. Insert fields into SQL:

```sql
id, namespace, team_chat_id, source_message_id, target_session_id, status,
delivery_kind, requires_response,
context_snapshot, hop_depth, parent_request_id, error, created_at
```

4. Insert values:

```ts
input.deliveryKind ?? 'mention',
input.requiresResponse === false ? 0 : 1,
```

5. Map row:

```ts
deliveryKind: row.delivery_kind ?? 'mention',
requiresResponse: row.requires_response !== 0,
```

- [ ] **Step 8: Add delivery-aware store list helper**

Add to `TeamChatStore`:

```ts
listAutoReportableDeliveries(namespace: string, targetSessionId: string): StoredTeamMentionRequest[] {
    const rows = this.db.prepare(`
        SELECT r.* FROM team_mention_requests r
        INNER JOIN team_chats c ON c.namespace = r.namespace AND c.id = r.team_chat_id
        WHERE r.namespace = ?
          AND r.target_session_id = ?
          AND r.delivery_kind = 'mention'
          AND r.requires_response = 1
          AND r.status IN ('pending', 'delivered', 'seen', 'processing')
          AND c.archived_at IS NULL
        ORDER BY r.created_at ASC
    `).all(namespace, targetSessionId) as TeamMentionRequestRow[]
    return rows.map(toMentionRequest)
}
```

Keep `listPendingMentionRequests` as-is for route/UI compatibility in this task.

Add this test to `hub/src/store/teamChatStore.test.ts`:

```ts
it('excludes optional broadcasts from auto-reportable deliveries', () => {
    const store = new Store(':memory:')
    const session = store.sessions.getOrCreateSession('target', { path: '/repo' }, null, 'default')
    const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Team' })
    const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', color: '#34d399', role: 'general' })
    const message = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'broadcast', mentions: [] })
    store.teamChats.addMentionRequest({
        namespace: 'default',
        teamChatId: chat.id,
        sourceMessageId: message.id,
        targetSessionId: session.id,
        deliveryKind: 'broadcast',
        requiresResponse: false,
        contextSnapshot: { originalText: 'broadcast', sharedContext: {}, attachedFiles: [] },
        hopDepth: 0
    })

    expect(store.teamChats.listAutoReportableDeliveries('default', session.id)).toEqual([])
})
```

- [ ] **Step 9: Update migration tests**

In `hub/src/store/migration-v8.test.ts`, update schema version expectations from `10` to `11` where asserted. Add expectations that `team_mention_requests` contains:

```ts
expect(columns).toContain('delivery_kind')
expect(columns).toContain('requires_response')
```

Use the existing helper style in that file for collecting column names.

- [ ] **Step 10: Run focused tests**

Run:

```bash
bun test shared/src/teamChat.test.ts
cd hub && bun test src/store/teamChatStore.test.ts src/store/migration-v8.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 11: Commit Task 1**

```bash
git add shared/src/schemas.ts shared/src/types.ts shared/src/teamChat.test.ts hub/src/store/index.ts hub/src/store/types.ts hub/src/store/teamChatStore.ts hub/src/store/teamChatStore.test.ts hub/src/store/migration-v8.test.ts
git commit -m "feat: add team delivery ledger fields"
```

---

## Task 2: Include Delivery Metadata in Session Delivery

**Files:**
- Modify: `hub/src/sync/messageService.ts`
- Modify: `hub/src/sync/teamMentionDeliveryService.ts`
- Modify: `hub/src/sync/teamMentionDeliveryService.test.ts`
- Modify: `web/src/chat/reducerTimeline.ts`
- Modify: `web/src/chat/reducerTimeline.test.ts`
- Modify: `web/src/chat/types.ts`
- Modify: `web/src/types/api.ts`

- [ ] **Step 1: Write hub delivery metadata failing test**

Add to `hub/src/sync/teamMentionDeliveryService.test.ts`:

```ts
it('stores delivery metadata for optional broadcasts', () => {
    const store = new Store(':memory:')
    const { request } = createRequest(store)
    const broadcast = store.teamChats.addMentionRequest({
        namespace: request.namespace,
        teamChatId: request.teamChatId,
        sourceMessageId: request.sourceMessageId,
        targetSessionId: request.targetSessionId,
        deliveryKind: 'broadcast',
        requiresResponse: false,
        contextSnapshot: request.contextSnapshot,
        hopDepth: 0
    })
    const { io } = createIo()
    const publisher = { emit: mock(() => undefined) }
    const messageService = new MessageService(store, io as never, publisher as never)
    const delivery = new TeamMentionDeliveryService(messageService, store, publisher)

    delivery.deliver({ namespace: 'default', request: broadcast, envelope: '[HAPI_TEAM_BROADCAST]\nhello', mode: 'card-only' })

    const stored = store.messages.getMessages(broadcast.targetSessionId, 10)[0]
    expect(stored.content).toMatchObject({
        meta: {
            sentFrom: 'team-chat',
            teamMentionRequestId: broadcast.id,
            teamDeliveryKind: 'broadcast',
            requiresResponse: false
        }
    })
})
```

- [ ] **Step 2: Run delivery test and verify it fails**

Run:

```bash
cd hub && bun test src/sync/teamMentionDeliveryService.test.ts
```

Expected: FAIL because meta does not include `teamDeliveryKind` and `requiresResponse`.

- [ ] **Step 3: Extend message delivery meta type**

In `hub/src/sync/messageService.ts`, update `sendTeamMentionMessage` meta type:

```ts
meta: {
    sentFrom: 'team-chat'
    teamMentionRequestId: string
    teamChatId: string
    sourceMessageId: string
    teamDeliveryKind: 'mention' | 'broadcast'
    requiresResponse: boolean
}
```

- [ ] **Step 4: Pass metadata from delivery service**

In `hub/src/sync/teamMentionDeliveryService.ts`, extend meta:

```ts
teamDeliveryKind: input.request.deliveryKind,
requiresResponse: input.request.requiresResponse
```

Keep `invokeAgent` policy unchanged in this task.

- [ ] **Step 5: Add web parsing failing test**

In `web/src/chat/reducerTimeline.test.ts`, add:

```ts
it('renders optional Team broadcast metadata as a non-required Team block', () => {
    const { blocks } = reduceTimeline([makeUserMessage('[HAPI_TEAM_BROADCAST]\nhello update', {
        meta: {
            sentFrom: 'team-chat',
            teamMentionRequestId: 'req-1',
            teamChatId: 'team-1',
            sourceMessageId: 'team-msg-1',
            teamDeliveryKind: 'broadcast',
            requiresResponse: false
        }
    })], makeContext())

    expect(blocks[0]).toMatchObject({
        kind: 'team-mention',
        requestId: 'req-1',
        deliveryKind: 'broadcast',
        requiresResponse: false,
        text: 'hello update'
    })
})
```

- [ ] **Step 6: Run web reducer test and verify it fails**

Run:

```bash
cd web && bun test src/chat/reducerTimeline.test.ts
```

Expected: FAIL because block type and reducer do not expose delivery fields.

- [ ] **Step 7: Extend web types and reducer**

In `web/src/types/api.ts`, add to `TeamMentionRequest`:

```ts
deliveryKind?: 'mention' | 'broadcast'
requiresResponse?: boolean
```

In `web/src/chat/types.ts`, add to `TeamMentionBlock`:

```ts
deliveryKind: 'mention' | 'broadcast'
requiresResponse: boolean
```

In `web/src/chat/reducerTimeline.ts`, update `getTeamMentionMeta` return shape:

```ts
const deliveryKind = candidate.teamDeliveryKind === 'broadcast' ? 'broadcast' : 'mention'
const requiresResponse = typeof candidate.requiresResponse === 'boolean'
    ? candidate.requiresResponse
    : deliveryKind === 'mention'
```

Return those fields and include them in the pushed block.

Update `stripTeamMentionEnvelope` so it accepts both markers:

```ts
if (!text.startsWith('[HAPI_TEAM_MENTION]') && !text.startsWith('[HAPI_TEAM_BROADCAST]')) return text
```

- [ ] **Step 8: Run Task 2 focused tests**

Run:

```bash
cd hub && bun test src/sync/teamMentionDeliveryService.test.ts
cd web && bun test src/chat/reducerTimeline.test.ts
```

Expected: both selected tests pass.

- [ ] **Step 9: Commit Task 2**

```bash
git add hub/src/sync/messageService.ts hub/src/sync/teamMentionDeliveryService.ts hub/src/sync/teamMentionDeliveryService.test.ts web/src/types/api.ts web/src/chat/types.ts web/src/chat/reducerTimeline.ts web/src/chat/reducerTimeline.test.ts
git commit -m "feat: pass team delivery metadata to sessions"
```

---

## Task 3: Fan Out Required Mentions and Optional Broadcasts

**Files:**
- Modify: `hub/src/sync/teamChatService.ts`
- Modify: `hub/src/sync/teamChatService.test.ts`
- Modify: `hub/src/sync/teamReports.test.ts`

- [ ] **Step 1: Write failing test for no-mention broadcast to all session members**

Add to `hub/src/sync/teamChatService.test.ts`:

```ts
it('broadcasts non-mention Team messages to all session participants as optional deliveries', () => {
    const store = new Store(':memory:')
    const publisher = createPublisher()
    const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
    const testSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
    const delivery = { deliver: mock(() => undefined) }
    const service = new TeamChatService(store, publisher, delivery, () => ({
        active: true,
        thinking: false,
        agentState: { controlledByUser: false, requests: {}, completedRequests: {} }
    } as never))
    const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat' })
    const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
    service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })

    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'Heads up: API schema changed' })

    const backendRequests = store.teamChats.listSessionMentionRequests('default', backendSession.id)
    const testRequests = store.teamChats.listSessionMentionRequests('default', testSession.id)
    expect(backendRequests).toHaveLength(1)
    expect(testRequests).toHaveLength(1)
    expect(backendRequests[0]).toMatchObject({ deliveryKind: 'broadcast', requiresResponse: false, status: 'no_action' })
    expect(testRequests[0]).toMatchObject({ deliveryKind: 'broadcast', requiresResponse: false, status: 'no_action' })
    expect(delivery.deliver).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
cd hub && bun test src/sync/teamChatService.test.ts
```

Expected: FAIL because non-mention messages currently create no session deliveries.

- [ ] **Step 3: Add delivery helper methods to TeamChatService**

In `hub/src/sync/teamChatService.ts`, add helpers inside the class:

```ts
private getSessionParticipants(namespace: string, teamChatId: string): StoredTeamParticipant[] {
    return this.store.teamChats.listParticipants(namespace, teamChatId)
        .filter((participant) => participant.type === 'session' && typeof participant.sessionId === 'string')
}

private deliverRequest(input: {
    namespace: string
    request: StoredTeamMentionRequest
    text: string
    contextSnapshot: unknown
}): void {
    const session = this.resolveSession?.(input.namespace, input.request.targetSessionId)
    if (!this.mentionDelivery || !session) return
    try {
        this.mentionDelivery.deliver({
            namespace: input.namespace,
            request: input.request,
            envelope: this.buildDeliveryEnvelope(input.request, input.text, input.contextSnapshot),
            mode: getMentionDeliveryMode(session)
        })
        if (!input.request.requiresResponse) {
            this.resolveOptionalBroadcast(input.namespace, input.request.id)
        }
    } catch (error) {
        const updated = this.store.teamChats.updateMentionStatus({
            namespace: input.namespace,
            requestId: input.request.id,
            status: 'failed',
            resolvedAt: Date.now(),
            error: error instanceof Error ? error.message : String(error)
        })
        if (updated) this.emitMentionUpdated(input.namespace, updated)
    }
}

private resolveOptionalBroadcast(namespace: string, requestId: string): void {
    const updated = this.store.teamChats.updateMentionStatus({
        namespace,
        requestId,
        status: 'no_action',
        resolvedAt: Date.now()
    })
    if (updated) this.emitMentionUpdated(namespace, updated)
}
```

This helper is deliberately per-target. One failed target must not throw out of `postMessage`/`reportToTeam` and must not rollback sibling deliveries.

- [ ] **Step 4: Replace direct mention delivery loop in `postMessage`**

In `postMessage`, after storing `message`, build:

```ts
const mentionedSessionIds = new Set(parsedMentions.map((mention) => mention.sessionId))
const sessionParticipants = this.getSessionParticipants(input.namespace, input.teamChatId)
```

For parsed mentions, create required deliveries:

```ts
const contextSnapshot = this.buildMentionContextSnapshot(input.namespace, input.teamChatId, message.id, input.text)
const request = this.store.teamChats.addMentionRequest({
    namespace: input.namespace,
    teamChatId: input.teamChatId,
    sourceMessageId: message.id,
    targetSessionId: mention.sessionId,
    deliveryKind: 'mention',
    requiresResponse: true,
    contextSnapshot,
    hopDepth: 0
})
this.deliverRequest({ namespace: input.namespace, request, text: input.text, contextSnapshot })
```

For non-mentioned session participants, create optional broadcasts:

```ts
for (const participant of sessionParticipants) {
    if (!participant.sessionId || mentionedSessionIds.has(participant.sessionId)) continue
    const contextSnapshot = this.buildMentionContextSnapshot(input.namespace, input.teamChatId, message.id, input.text)
    const request = this.store.teamChats.addMentionRequest({
        namespace: input.namespace,
        teamChatId: input.teamChatId,
        sourceMessageId: message.id,
        targetSessionId: participant.sessionId,
        deliveryKind: 'broadcast',
        requiresResponse: false,
        contextSnapshot,
        hopDepth: 0
    })
    this.deliverRequest({ namespace: input.namespace, request, text: input.text, contextSnapshot })
}
```

Keep `team-message-created` emit after delivery creation, as current code does.

- [ ] **Step 5: Rename envelope builder behavior without breaking callers**

Replace `buildMentionEnvelope` with `buildDeliveryEnvelope`:

```ts
private buildDeliveryEnvelope(request: StoredTeamMentionRequest, text: string, contextSnapshot: unknown): string {
    const isBroadcast = request.deliveryKind === 'broadcast' || !request.requiresResponse
    const marker = isBroadcast ? '[HAPI_TEAM_BROADCAST]' : '[HAPI_TEAM_MENTION]'
    const behavior = isBroadcast
        ? [
            'Reply behavior:',
            '- This is a HAPI Team Chat update broadcast to keep you in sync.',
            '- No response is required.',
            '- HAPI will mark this delivery no_action after syncing it.',
            `- If you do need to respond publicly, call hapi_session.report_to_team with teamChatId=${request.teamChatId} and replyToRequestId=${request.id}.`
        ]
        : [
            'Reply behavior:',
            '- You were mentioned in a HAPI Team Chat.',
            '- Answer the Team Chat request using the context below.',
            '- If you send a normal text answer and this is the only open Team request, HAPI will post it back to the Team Chat automatically.',
            `- For structured updates, call hapi_session.report_to_team with teamChatId=${request.teamChatId} and replyToRequestId=${request.id}.`,
            `- If no reply is needed, call hapi_session.mark_team_mention_no_action with requestId=${request.id}.`
        ]

    return [
        marker,
        `requestId=${request.id}`,
        `teamChatId=${request.teamChatId}`,
        `sourceMessageId=${request.sourceMessageId}`,
        `deliveryKind=${request.deliveryKind}`,
        `requiresResponse=${request.requiresResponse ? 'true' : 'false'}`,
        '',
        ...behavior,
        '',
        `From Team Chat: ${text}`,
        '',
        'Context:',
        JSON.stringify(contextSnapshot)
    ].join('\n')
}
```

- [ ] **Step 6: Add test for mention plus optional broadcast to unmentioned members**

Add to `hub/src/sync/teamChatService.test.ts`:

```ts
it('creates required mention for tagged member and optional broadcast for untagged session member', () => {
    const store = new Store(':memory:')
    const publisher = createPublisher()
    const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
    const testsSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
    const delivery = { deliver: mock(() => undefined) }
    const service = new TeamChatService(store, publisher, delivery, () => ({ active: true, thinking: false, agentState: { controlledByUser: false } } as never))
    const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat' })
    const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
    service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testsSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })

    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend please verify API route' })

    expect(store.teamChats.listSessionMentionRequests('default', backendSession.id)[0]).toMatchObject({ deliveryKind: 'mention', requiresResponse: true })
    expect(store.teamChats.listSessionMentionRequests('default', testsSession.id)[0]).toMatchObject({ deliveryKind: 'broadcast', requiresResponse: false, status: 'no_action' })
})
```

- [ ] **Step 7: Add self-echo prevention test for agent reports**

Add to `hub/src/sync/teamReports.test.ts`:

```ts
it('does not broadcast an agent report back to the source session', () => {
    const { store, service, chat, backendSession, testsSession } = createContext()

    service.reportToTeam({
        namespace: 'default',
        teamChatId: chat.id,
        sourceSessionId: backendSession.id,
        type: 'progress',
        summary: 'Backend implementation is in progress'
    })

    expect(store.teamChats.listSessionMentionRequests('default', backendSession.id)).toEqual([])
    expect(store.teamChats.listSessionMentionRequests('default', testsSession.id)[0]).toMatchObject({
        deliveryKind: 'broadcast',
        requiresResponse: false,
        status: 'no_action'
    })
})
```

- [ ] **Step 8: Implement report fanout with source-session exclusion**

In `reportToTeam`, after creating the Team message and parsed required mentions:

```ts
const mentionedSessionIds = new Set(parsedMentions.map((mention) => mention.sessionId))
const sourceSessionId = input.sourceSessionId ?? authorParticipant.sessionId ?? null
for (const participant of this.getSessionParticipants(input.namespace, input.teamChatId)) {
    if (!participant.sessionId) continue
    if (participant.sessionId === sourceSessionId) continue
    if (mentionedSessionIds.has(participant.sessionId)) continue
    const contextSnapshot = this.buildMentionContextSnapshot(input.namespace, input.teamChatId, message.id, text)
    const request = this.store.teamChats.addMentionRequest({
        namespace: input.namespace,
        teamChatId: input.teamChatId,
        sourceMessageId: message.id,
        targetSessionId: participant.sessionId,
        deliveryKind: 'broadcast',
        requiresResponse: false,
        contextSnapshot,
        hopDepth
    })
    this.deliverRequest({ namespace: input.namespace, request, text, contextSnapshot })
}
```

Also ensure parsed mentions from reports keep `deliveryKind: 'mention'` and `requiresResponse: true`.

- [ ] **Step 9: Add partial fanout failure test**

Add to `hub/src/sync/teamChatService.test.ts`:

```ts
it('keeps Team message and sibling deliveries when one target delivery fails', () => {
    const store = new Store(':memory:')
    const publisher = createPublisher()
    const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
    const testsSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
    const delivery = {
        deliver: mock((input: { request: { targetSessionId: string } }) => {
            if (input.request.targetSessionId === testsSession.id) {
                throw new Error('simulated delivery failure')
            }
        })
    }
    const service = new TeamChatService(store, publisher, delivery, () => ({ active: true, thinking: false, agentState: { controlledByUser: false } } as never))
    const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat' })
    const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
    service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testsSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })

    const result = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'Heads up: schema changed' })

    expect(result.message.text).toBe('Heads up: schema changed')
    expect(store.teamChats.listSessionMentionRequests('default', backendSession.id)[0]).toMatchObject({ status: 'no_action' })
    expect(store.teamChats.listSessionMentionRequests('default', testsSession.id)[0]).toMatchObject({ status: 'failed', error: 'simulated delivery failure' })
})
```

- [ ] **Step 10: Run Task 3 focused tests**

Run:

```bash
cd hub && bun test src/sync/teamChatService.test.ts src/sync/teamReports.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 11: Commit Task 3**

```bash
git add hub/src/sync/teamChatService.ts hub/src/sync/teamChatService.test.ts hub/src/sync/teamReports.test.ts
git commit -m "feat: fan out team broadcasts safely"
```

---

## Task 4: Harden Plain Auto-Report Routing

**Files:**
- Modify: `hub/src/sync/teamChatService.ts`
- Modify: `hub/src/sync/teamReports.test.ts`

- [ ] **Step 1: Write failing ambiguous auto-report test**

Add to `hub/src/sync/teamReports.test.ts`:

```ts
it('does not auto-report plain text when a session has multiple open Team deliveries', () => {
    const { service, chat, user, backendSession } = createContext()
    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend first question' })
    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend second question' })

    const result = service.autoReportSessionReply({
        namespace: 'default',
        sessionId: backendSession.id,
        text: 'This plain answer is ambiguous'
    })

    expect(result).toBeNull()
})
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
cd hub && bun test src/sync/teamReports.test.ts
```

Expected: FAIL because current fallback picks latest pending request.

- [ ] **Step 3: Implement conservative auto-report selection**

In `TeamChatService.autoReportSessionReply`, replace fallback selection with:

```ts
const openRequests = this.store.teamChats.listAutoReportableDeliveries(input.namespace, input.sessionId)
if (openRequests.length !== 1) return null
const request = openRequests[0]
if (input.requestId && request.id !== input.requestId) return null
```

`listAutoReportableDeliveries` must already exclude optional broadcasts. This means plain text auto-report only works for exactly one open required mention.

Keep these existing guards:

```ts
if (!request || request.targetSessionId !== input.sessionId) return null
if (!['pending', 'delivered', 'seen', 'processing'].includes(request.status)) return null
if (request.deliveryKind !== 'mention' || !request.requiresResponse) return null
```

- [ ] **Step 4: Add explicit report regression test**

Add to `hub/src/sync/teamReports.test.ts`:

```ts
it('still allows explicit report_to_team when multiple deliveries are open', () => {
    const { store, service, chat, backend, user, backendSession } = createContext()
    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend first question' })
    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend second question' })
    const target = store.teamChats.listSessionMentionRequests('default', backendSession.id)[0]

    const report = service.reportToTeam({
        namespace: 'default',
        teamChatId: chat.id,
        authorParticipantId: backend.id,
        type: 'reply',
        summary: 'Explicitly answering the first request',
        replyToRequestId: target.id
    })

    expect(report.message.replyToMessageId).toBe(target.sourceMessageId)
    expect(store.teamChats.getMentionRequest('default', target.id)?.status).toBe('responded')
})
```

- [ ] **Step 5: Add optional broadcast auto-report regression**

Add to `hub/src/sync/teamReports.test.ts`:

```ts
it('does not auto-report plain text for optional broadcast deliveries', () => {
    const { service, chat, user, backendSession } = createContext()
    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'FYI: shared context only' })

    const result = service.autoReportSessionReply({
        namespace: 'default',
        sessionId: backendSession.id,
        text: 'ok'
    })

    expect(result).toBeNull()
})
```

- [ ] **Step 6: Add same-session multi-Team regression**

Add to `hub/src/sync/teamReports.test.ts`:

```ts
it('does not auto-report plain text when same session is tagged by two Team Chats', () => {
    const { store, service, chat, user, backendSession } = createContext()
    const secondChat = service.createTeamChat({ namespace: 'default', name: 'Second Team' })
    const secondUser = service.addParticipant({ namespace: 'default', teamChatId: secondChat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    service.addParticipant({ namespace: 'default', teamChatId: secondChat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })

    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend first team question' })
    service.postMessage({ namespace: 'default', teamChatId: secondChat.id, authorParticipantId: secondUser.id, text: '@Backend second team question' })

    expect(store.teamChats.listAutoReportableDeliveries('default', backendSession.id)).toHaveLength(2)
    expect(service.autoReportSessionReply({
        namespace: 'default',
        sessionId: backendSession.id,
        text: 'Ambiguous across teams'
    })).toBeNull()
})
```

- [ ] **Step 7: Add same-Team multi-request regression**

`hub/src/sync/sessionModel.test.ts` already has a direct private-after-team socket test. Add this service-level regression to `hub/src/sync/teamReports.test.ts` instead of overfitting socket internals:

```ts
it('does not post plain session text to Team when two Team requests are open', () => {
    const { store, service, chat, user, backendSession } = createContext()
    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend first' })
    service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend second' })
    const latestRequest = store.teamChats.listSessionMentionRequests('default', backendSession.id).at(-1)

    expect(service.autoReportSessionReply({
        namespace: 'default',
        sessionId: backendSession.id,
        requestId: latestRequest?.id,
        text: 'Ambiguous answer'
    })).toBeNull()
})
```

- [ ] **Step 8: Run focused auto-report tests**

Run:

```bash
cd hub && bun test src/sync/teamReports.test.ts src/sync/sessionModel.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 9: Commit Task 4**

```bash
git add hub/src/sync/teamChatService.ts hub/src/sync/teamReports.test.ts
git commit -m "fix: guard ambiguous team auto reports"
```

---

## Task 5: Update Session and Team UI for Optional Broadcasts

**Files:**
- Modify: `web/src/components/AssistantChat/TeamMentionQueueBar.tsx`
- Modify: `web/src/components/AssistantChat/TeamMentionQueueBar.test.tsx`
- Modify: `web/src/components/AssistantChat/messages/TeamMentionMessage.tsx`
- Modify: `web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx`
- Modify: `web/src/components/TeamChat/TeamMessageCard.tsx`
- Modify: `web/src/components/TeamChat/TeamMessageCard.test.tsx`
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.tsx`
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.test.tsx`

- [ ] **Step 1: Write failing queue bar test**

In `web/src/components/AssistantChat/TeamMentionQueueBar.test.tsx`, add:

```tsx
it('does not count optional broadcasts as pending Team mentions', () => {
    const onReviewFirst = vi.fn()
    const onOpenTeamChat = vi.fn()

    render(<TeamMentionQueueBar
        requests={[
            { ...baseRequest, id: 'req-broadcast', deliveryKind: 'broadcast', requiresResponse: false, status: 'delivered', createdAt: 1 },
            { ...baseRequest, id: 'req-required', deliveryKind: 'mention', requiresResponse: true, status: 'delivered', createdAt: 2 }
        ]}
        onReviewFirst={onReviewFirst}
        onOpenTeamChat={onOpenTeamChat}
    />)

    expect(screen.queryByText(/Team mentions waiting/i)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run queue bar test and verify it fails**

Run:

```bash
cd web && bun test src/components/AssistantChat/TeamMentionQueueBar.test.tsx
```

Expected: FAIL because optional broadcast is currently active.

- [ ] **Step 3: Filter active queue by `requiresResponse`**

In `TeamMentionQueueBar.tsx`:

```ts
export function getActiveTeamMentionRequests(requests: readonly TeamMentionRequest[]): TeamMentionRequest[] {
    return requests
        .filter((request) => request.requiresResponse !== false && ACTIVE_STATUSES.has(request.status))
        .sort((a, b) => a.createdAt - b.createdAt)
}
```

Use `request.requiresResponse !== false` so old responses without the field remain treated as required mentions.

- [ ] **Step 4: Write failing TeamMentionMessage label test**

In `web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx`, add:

```tsx
it('renders optional broadcasts as Team updates', () => {
    render(<TeamMentionMessage
        block={{
            kind: 'team-mention',
            id: 'msg-1',
            localId: null,
            createdAt: 1,
            requestId: 'req-1',
            teamChatId: 'team-1',
            sourceMessageId: 'source-1',
            text: 'Context update',
            status: 'delivered',
            deliveryKind: 'broadcast',
            requiresResponse: false
        }}
        onOpenTeamChat={() => {}}
        onReplyToTeam={() => {}}
        onPostUpdate={() => {}}
        onViewOriginal={() => {}}
        onNoAction={() => {}}
    />)

    expect(screen.getByText('Team update')).toBeInTheDocument()
    expect(screen.queryByText('Reply to Team')).not.toBeInTheDocument()
    expect(screen.getByText('No action needed')).toBeInTheDocument()
})
```

- [ ] **Step 5: Update TeamMentionMessage component**

In `TeamMentionMessage.tsx`:

```ts
const isBroadcast = props.block.deliveryKind === 'broadcast' || props.block.requiresResponse === false
const title = isBroadcast ? 'Team update' : 'Team mention'
```

Render `{title}`. Hide the primary `Reply to Team` button for broadcasts:

```tsx
{!isBroadcast ? (
    <button className="rounded-md bg-[var(--app-button)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-button-text)]" onClick={props.onReplyToTeam}>Reply to Team</button>
) : null}
```

Keep `Post update`, `View original`, `Open Team Chat`, and `No action needed` available.

- [ ] **Step 6: Write failing TeamMessageCard broadcast chip test**

In `web/src/components/TeamChat/TeamMessageCard.test.tsx`, add:

```tsx
it('renders delivery status chips for no-mention optional broadcasts', () => {
    render(<TeamMessageCard
        message={{
            id: 'msg-1',
            teamChatId: 'team-1',
            seq: 1,
            authorParticipantId: 'user-1',
            text: 'FYI: shared context',
            mentions: [],
            files: [],
            createdAt: 1
        }}
        author={{ id: 'user-1', teamChatId: 'team-1', type: 'user', displayName: 'You', role: 'general', color: '#34d399', joinedAt: 1 }}
        participants={[
            { id: 'user-1', teamChatId: 'team-1', type: 'user', displayName: 'You', role: 'general', color: '#34d399', joinedAt: 1 },
            { id: 'backend', teamChatId: 'team-1', type: 'session', sessionId: 'session-backend', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 2 }
        ]}
        mentionRequests={[{
            id: 'req-1',
            teamChatId: 'team-1',
            sourceMessageId: 'msg-1',
            targetSessionId: 'session-backend',
            deliveryKind: 'broadcast',
            requiresResponse: false,
            status: 'no_action',
            createdAt: 2
        }]}
        onReplyPreviewClick={() => {}}
    />)

    expect(screen.getByText('Backend')).toBeInTheDocument()
    expect(screen.getByText('synced')).toBeInTheDocument()
})
```

- [ ] **Step 7: Update TeamMessageCard labels and delivery item source**

In `TeamMessageCard.tsx`, change status label function signature:

```ts
function getMentionStatusLabel(request: TeamMentionRequest | undefined): string {
    const status = request?.status ?? 'pending'
    const isBroadcast = request?.deliveryKind === 'broadcast' || request?.requiresResponse === false
    if (isBroadcast && status === 'seen') return 'synced'
    if (isBroadcast && status === 'delivered') return 'delivered update'
    if (isBroadcast && status === 'no_action') return 'synced'
    if (status === 'no_action') return 'seen · no action'
    if (status === 'responded') return 'replied'
    if (status === 'delivered') return 'delivered'
    if (status === 'seen') return 'seen · no reply yet'
    if (status === 'processing') return 'processing'
    if (status === 'failed') return 'failed to receive'
    if (status === 'superseded') return 'superseded'
    return 'pending'
}
```

Build delivery chips from delivery records, not only from `message.mentions`:

```ts
const participantBySessionId = new Map(
    (props.participants ?? [])
        .filter((participant) => participant.sessionId)
        .map((participant) => [participant.sessionId!, participant])
)
const requestsForMessage = (props.mentionRequests ?? [])
    .filter((request) => request.sourceMessageId === props.message.id)
const deliveryItems = requestsForMessage.length > 0
    ? requestsForMessage.map((request) => ({
        key: request.id,
        sessionId: request.targetSessionId,
        participant: participantBySessionId.get(request.targetSessionId) ?? null,
        request
    }))
    : props.message.mentions.map((mention) => ({
        key: `${mention.participantId}:${mention.sessionId}`,
        sessionId: mention.sessionId,
        participant: participantById.get(mention.participantId) ?? null,
        request: requestByTargetSession.get(mention.sessionId)
    }))
```

Render chips from `deliveryItems` and call with `getMentionStatusLabel(item.request)`. This is required because no-mention broadcasts have `message.mentions = []` but still need visible delivery/seen state in the Team timeline.

- [ ] **Step 8: Update TeamChatRightPanel attention filter**

In `getAttentionItems`, change pending-request filter:

```ts
.filter((request) => request.status === 'failed' || (request.requiresResponse !== false && request.status === 'pending'))
```

Optional failed deliveries may still surface as failed delivery; optional pending broadcasts must not become “Waiting for response”.

- [ ] **Step 9: Run web focused tests**

Run:

```bash
cd web && bun test src/components/AssistantChat/TeamMentionQueueBar.test.tsx src/components/AssistantChat/messages/TeamMentionMessage.test.tsx src/components/TeamChat/TeamMessageCard.test.tsx src/components/TeamChat/TeamChatRightPanel.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 10: Commit Task 5**

```bash
git add web/src/components/AssistantChat/TeamMentionQueueBar.tsx web/src/components/AssistantChat/TeamMentionQueueBar.test.tsx web/src/components/AssistantChat/messages/TeamMentionMessage.tsx web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx web/src/components/TeamChat/TeamMessageCard.tsx web/src/components/TeamChat/TeamMessageCard.test.tsx web/src/components/TeamChat/TeamChatRightPanel.tsx web/src/components/TeamChat/TeamChatRightPanel.test.tsx
git commit -m "feat: distinguish team updates from mentions"
```

---

## Task 6: Regression Guardrails for Agent Mode and Editor Mode

**Files:**
- Modify: `hub/src/sync/sessionModel.test.ts`
- Modify: `hub/src/sync/teamReports.test.ts`
- Modify only if needed: `web/src/hooks/useSSE.ts`

- [ ] **Step 1: Confirm direct Agent Mode path remains private**

Add or keep this assertion in `hub/src/sync/sessionModel.test.ts`:

```ts
it('does not auto-report plain agent text when latest user turn is direct webapp chat', () => {
    const store = new Store(':memory:')
    const cache = new SessionCache(store, createPublisher([]))
    const session = cache.getOrCreateSession('session-direct-private', { path: '/tmp/project', flavor: 'codex' }, null, 'default')
    const handlers = new Map<string, (payload: unknown) => void>()
    const agentTexts: Array<{ namespace: string; sessionId: string; text: string; requestId?: string | null }> = []

    registerSessionHandlers({
        on: (event: string, handler: (payload: unknown) => void) => { handlers.set(event, handler) },
        to: () => ({ emit() {} })
    } as never, {
        store,
        resolveSessionAccess: (sessionId) => {
            const stored = store.sessions.getSessionByNamespace(sessionId, 'default')
            return stored ? { ok: true, value: stored } : { ok: false, reason: 'not-found' }
        },
        emitAccessError: () => {},
        onAgentTextMessage: (input) => { agentTexts.push(input) }
    })

    store.messages.addMessage(session.id, {
        role: 'user',
        content: { type: 'text', text: 'private direct prompt' },
        meta: { sentFrom: 'webapp' }
    })

    handlers.get('message')?.({
        sid: session.id,
        message: JSON.stringify({
            role: 'agent',
            content: { type: 'codex', data: { type: 'message', message: 'Private answer' } }
        })
    })

    expect(agentTexts).toEqual([])
})
```

If an equivalent test already exists, extend it to assert `teamDeliveryKind` metadata does not alter the private path.

- [ ] **Step 2: Verify SSE team events do not mutate machine/editor caches**

Inspect `web/src/hooks/useSSE.ts`. Current behavior should call `onEventRef.current(event)` for team events and only patch session/machine for `session-*` and `machine-updated`. If new team event handling is added during implementation, keep it constrained to Team query keys.

Add this unit-style test only if `useSSE` is changed in this phase:

```ts
expect(teamEvent.type).toBe('team-message-created')
expect(editorInvalidationSpy).not.toHaveBeenCalled()
expect(machineInvalidationSpy).not.toHaveBeenCalled()
```

If `useSSE` is not changed, record in the commit message that no SSE mutation code was touched.

- [ ] **Step 3: Run Agent/Editor focused regression tests**

Run:

```bash
cd hub && bun test src/sync/sessionModel.test.ts src/web/routes/sessions.test.ts src/sync/rpcGateway.editor.test.ts src/sync/syncEngine.editor.test.ts
cd web && bun test src/routes/editor.test.tsx src/api/client.editor.test.ts src/components/editor/EditorLayout.test.tsx
```

Expected: all selected tests pass.

`src/web/routes/sessions.test.ts` is included because Agent Mode config routes are part of the blast-radius contract:

- permission mode;
- collaboration mode;
- model;
- model reasoning effort;
- effort;
- local/remote/resume behavior.

- [ ] **Step 4: Commit Task 6**

```bash
git add hub/src/sync/sessionModel.test.ts web/src/hooks/useSSE.ts
git commit -m "test: guard agent and editor mode team regressions"
```

If `web/src/hooks/useSSE.ts` is not modified, use:

```bash
git add hub/src/sync/sessionModel.test.ts
git commit -m "test: guard agent mode team regressions"
```

---

## Task 7: Final Verification and Documentation Notes

**Files:**
- Modify: `docs/superpowers/specs/2026-06-05-team-runtime-orchestrator-prd.md` only if implementation reveals a spec mismatch.
- No service restart in this task.

- [ ] **Step 1: Run Team Chat focused hub tests**

Run:

```bash
cd hub && bun test src/store/teamChatStore.test.ts src/sync/teamMentionDeliveryService.test.ts src/sync/teamChatService.test.ts src/sync/teamReports.test.ts src/sync/sessionModel.test.ts src/web/routes/sessions.test.ts src/web/routes/teamChats.test.ts src/web/routes/cliTeamReports.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run Team Chat focused web tests**

Run:

```bash
cd web && bun test src/chat/reducerTimeline.test.ts src/components/AssistantChat/TeamMentionQueueBar.test.tsx src/components/AssistantChat/messages/TeamMentionMessage.test.tsx src/components/TeamChat/TeamMessageCard.test.tsx src/components/TeamChat/TeamChatRightPanel.test.tsx src/routes/team-chats.test.tsx
```

Expected: all selected tests pass.

- [ ] **Step 3: Run package typechecks**

Run:

```bash
bun typecheck
```

Expected: TypeScript exits with code 0.

- [ ] **Step 4: Run full test suite when focused tests pass**

Run:

```bash
bun run test
```

Expected: all package tests pass.

- [ ] **Step 5: Inspect final diff for forbidden blast radius**

Run:

```bash
git diff --stat HEAD~6..HEAD
git diff --name-only HEAD~6..HEAD
```

Expected touched areas are limited to:

```text
shared/src/schemas.ts
shared/src/types.ts
shared/src/teamChat.test.ts
hub/src/store/*
hub/src/sync/team*
hub/src/sync/sessionModel.test.ts
hub/src/web/routes/teamChats.test.ts
hub/src/web/routes/cliTeamReports.test.ts
web/src/types/api.ts
web/src/chat/*
web/src/components/AssistantChat/*Team*
web/src/components/TeamChat/*
```

No expected changes to:

```text
hub/src/web/routes/editor.ts
hub/src/sync/rpcGateway.ts
hub/src/sync/syncEngine.ts editor methods
web/src/components/editor/* implementation files
web/src/routes/editor.tsx
```

Editor test files may be read/run but should not need implementation changes.

- [ ] **Step 6: Commit final docs note if needed**

If implementation decisions differ from the PRD, patch the PRD before final merge:

```bash
git add docs/superpowers/specs/2026-06-05-team-runtime-orchestrator-prd.md
git commit -m "docs: align team runtime phase one spec"
```

If PRD remains accurate, skip this commit.

---

## Self-Review Checklist

- [ ] Team delivery records have explicit `deliveryKind` and `requiresResponse`.
- [ ] User Team messages without mentions broadcast to all session members.
- [ ] User Team messages with mentions still notify unmentioned session members as optional broadcasts.
- [ ] Agent reports do not broadcast back to the same source session.
- [ ] Inactive/thinking/user-controlled sessions are not interrupted.
- [ ] Optional broadcasts do not show as “Team mentions waiting”.
- [ ] Optional broadcasts terminal as `no_action` after successful delivery.
- [ ] Optional broadcast delivery failures terminal as `failed` without rolling back the Team message.
- [ ] Plain auto-report is disabled for optional broadcasts.
- [ ] Plain auto-report is disabled when multiple compatible open required mention deliveries exist.
- [ ] Explicit `report_to_team` still works when multiple deliveries exist.
- [ ] Same session tagged by two Team Chats does not auto-route plain text to the wrong Team.
- [ ] No-mention Team timeline messages still show delivery/synced chips from delivery records.
- [ ] Direct private Agent Mode chat does not auto-post to Team.
- [ ] Agent Mode session config route tests still pass.
- [ ] Editor Mode implementation files are not changed.
- [ ] Focused hub tests pass.
- [ ] Focused web tests pass.
- [ ] `bun typecheck` passes.
- [ ] `bun run test` passes before claiming implementation complete.

---

## Execution Handoff

Plan complete target file:

```text
docs/superpowers/plans/2026-06-05-team-runtime-phase-1-delivery-guardrails.md
```

Recommended execution mode:

1. **Subagent-Driven** — one fresh subagent per task, review after each task, safest for this change.
2. **Inline Execution** — acceptable if only one agent is available, but keep commits per task and run focused tests after each task.

Do not rebuild or restart the active HAPI service from this plan. The user will do manual rebuild/restart/e2e verification after implementation is complete.
