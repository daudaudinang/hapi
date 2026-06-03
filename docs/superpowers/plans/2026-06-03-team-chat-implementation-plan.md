# Team Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Team Chat MVP: project-scoped shared chat, participants, mentions routed into session-side cards, inline replies, structured reports, attention/status panels, and HAPI-style web navigation.

**Architecture:** Hub owns Team Chat state in first-class SQLite tables. Team mentions are persisted as `team_mention_requests` and delivered by `TeamMentionDeliveryService` into target sessions as existing-compatible `user`/`text` session messages with Team metadata; the web renders those messages as Team mention cards. `ReportToTeam` is MVP Hub API + session-side action; provider-native tool injection is explicitly follow-up. SSE events include namespace and `sessionId`/`targetSessionId` so Team Chat and Session Chat caches stay in sync.

**Tech Stack:** Bun workspaces, TypeScript strict, Hono routes, SQLite via `bun:sqlite`, Socket.IO/SSE, React 19, TanStack Router/Query, `bun:test` for shared/hub tests, Vitest for web tests.

---

## Scope check

The PRD spans storage, hub APIs, realtime, session message rendering, web UX, and agent tooling. Implement as vertical slices. Each task below creates a testable state and can be committed independently.

Important architecture decisions for implementation:

- Team Chat is first-class domain; do not extend `sessions.team_state` for source-of-truth.
- Team messages need `seq` for pagination and reply scroll stability.
- Mention requests need `contextSnapshot`, `hopDepth`, and `parentRequestId` for debugging and loop guards.
- MVP mention delivery uses existing-compatible synthetic `user`/`text` session messages plus metadata; never insert `role: 'system'` / custom `content.type` messages into the CLI delivery path.
- ReportToTeam begins as Hub API + session-side action. Provider-native agent tools for Claude/Codex/Gemini/OpenCode are a follow-up after MVP, not part of this plan.
- Participants should be archived/removed from active participant lists without deleting historical message authors.


## Superpowers execution model

Default execution is **Superpowers subagent-driven development**, not blind parallel implementation:

1. Create an isolated worktree first with `superpowers:using-git-worktrees`.
2. The controller reads this plan once, extracts each task, and dispatches one fresh implementer subagent per task.
3. After each task: run spec-compliance review, then code-quality review, then verification, then commit.
4. Do **not** dispatch multiple implementation subagents against the same worktree when they touch shared contracts, migrations, routes, or web chat pipeline files.

Parallel-safe execution requires separate worktrees and contract locks:

| Wave | Parallel? | Tasks | Why |
|------|-----------|-------|-----|
| 0 | No | Task 1 | Shared protocol contracts unblock all other work. |
| 1 | Yes, separate worktrees | Task 2 and Task 4 tests/client shell | Storage and web API client/types can proceed after protocol names are locked; merge Task 2 before service implementation. |
| 2 | Mostly sequential | Task 3 then Task 6 | Service/routes create mention delivery contracts; session card pipeline depends on synthetic message metadata. |
| 3 | Yes, separate worktrees after Task 3 | Task 5 and parts of Task 7 UI | Team Chat UI components and report card styling touch mostly separate files; reconcile after shared web types. |
| 4 | No | Task 8 and Task 9 | Realtime/nav/full verification integrate all previous work. |

If using a single branch/worktree, execute tasks sequentially. Use parallel subagents for read-only reviews at every checkpoint.

## Contract locks from reviewer pass

- New protocol names are `TeamChatSchema`, `TeamChatMessageSchema`, `TeamParticipantSchema`, `TeamMentionRequestSchema`; do not use legacy `TeamMessageSchema` for Team Chat.
- Hub/shared tests import from `bun:test`; web tests import from `vitest`.
- Team mention session delivery must use a normal user text payload plus metadata: `role: 'user'`, `content: { type: 'text', text: envelope }`, `meta.sentFrom = 'team-chat'`.
- Team mention UI blocks use `kind: 'team-mention'` because `ChatBlock` is kind-based.
- `team-mention-updated` events include `sessionId: targetSessionId` and `targetSessionId`.
- Query invalidation for session messages must update `message-window-store`; invalidating a non-existent `queryKeys.messages` entry is insufficient.
- Every route/service/store method must enforce namespace and participant/request ownership.
- Existing Agent Mode and Editor Mode are regression surfaces: Team Chat adds navigation/actions but must not change current `/sessions`, Session Chat send/retry, `/editor`, file editing, terminal, or `← Agent Mode` behavior.

---

## File structure

### Shared protocol

- Modify: `shared/src/schemas.ts`
  - Add Team Chat Zod schemas and SyncEvent variants.
- Modify: `shared/src/types.ts`
  - Export Team Chat types.
- Modify: `shared/src/index.ts`
  - Export the new Team Chat schemas and types from the existing protocol entry points.
- Test: `shared/src/teamChat.test.ts`
  - Validate mention status transitions and schema parsing.

### Hub storage/domain

- Modify: `hub/src/store/index.ts`
  - Bump `SCHEMA_VERSION` from `9` to `10`; create v10 migration.
- Create: `hub/src/store/teamChatStore.ts`
  - CRUD/query methods for Team Chats, participants, messages, mention requests, context.
- Modify: `hub/src/store/types.ts`
  - Add stored Team Chat row types.
- Test: `hub/src/store/teamChatStore.test.ts`
  - Migration, CRUD, pagination, namespace isolation.

### Hub service/API/realtime

- Create: `hub/src/sync/teamChatService.ts`
  - Domain orchestration: create chat, add participant, post message, parse mentions, build context snapshot, create mention requests, update mention status, report to team.
- Create: `hub/src/sync/teamMentionDeliveryService.ts`
  - Bridge Team mentions into the existing session message delivery path using `user`/`text` payloads and Team metadata.
- Create: `hub/src/sync/teamMentions.ts`
  - Mention parser and dedupe/boundary rules.
- Modify: `hub/src/sync/syncEngine.ts`
  - Instantiate/expose `TeamChatService`.
- Create: `hub/src/web/routes/teamChats.ts`
  - REST endpoints for chats/messages/participants/mentions/reporting.
- Modify: `hub/src/web/server.ts`
  - Register Team Chat routes.
- Test: `hub/src/web/routes/teamChats.test.ts`
  - API behavior and access control.
- Test: `hub/src/sync/teamChatService.test.ts`
  - Mention routing, context snapshots, status transitions.

### Web data layer

- Modify: `web/src/types/api.ts`
  - Add response and model types.
- Modify: `web/src/api/client.ts`
  - Add Team Chat methods.
- Modify: `web/src/lib/query-keys.ts`
  - Add query keys.
- Create: `web/src/hooks/queries/useTeamChats.ts`
- Create: `web/src/hooks/queries/useTeamChat.ts`
- Create: `web/src/hooks/queries/useTeamChatParticipants.ts`
- Create: `web/src/hooks/queries/useTeamChatMessages.ts`
- Create: `web/src/hooks/queries/useTeamChatMessagesAround.ts`
- Create: `web/src/hooks/queries/useSessionTeamMentions.ts`
- Create: `web/src/hooks/mutations/useTeamChatActions.ts`
- Modify: `web/src/hooks/useSSE.ts`
  - Handle Team Chat event invalidation/cache updates.

### Web UI

- Create: `web/src/routes/team-chats.tsx`
- Create: `web/src/routes/team-chats/$teamChatId.tsx`
- Modify: `web/src/router.tsx`
  - Add `/team-chats` route.
- Create: `web/src/components/TeamChat/TeamChatLayout.tsx`
- Create: `web/src/components/TeamChat/TeamChatList.tsx`
- Create: `web/src/components/TeamChat/TeamChatTimeline.tsx`
- Create: `web/src/components/TeamChat/TeamChatComposer.tsx`
- Create: `web/src/components/TeamChat/TeamMentionAutocomplete.tsx`
- Create: `web/src/components/TeamChat/TeamChatMobileLayout.tsx`
- Create: `web/src/components/TeamChat/TeamChatRightPanel.tsx`
- Create: `web/src/components/TeamChat/TeamMessageCard.tsx`
- Create: `web/src/components/TeamChat/IncludedContextPreview.tsx`
- Create: `web/src/components/TeamChat/teamColors.ts`
- Modify: `web/src/components/Dashboard/index.tsx`
  - Add Team Chat topbar entry and quick-create hook.
- Modify: `web/src/components/SessionHeader.tsx`
  - Add Add/Open Team Chat action.
- Modify: `web/src/components/editor/EditorHeader.tsx`
  - Add Team Chat action for current project.

### Session-side cards

- Modify: `web/src/chat/normalize.ts`
  - Preserve synthetic Team mention message shape.
- Modify: `web/src/chat/types.ts`
  - Add Team mention block type.
- Modify: `web/src/chat/reducer.ts`, `web/src/chat/reducerTimeline.ts`, `web/src/chat/reconcile.ts`
  - Convert synthetic messages into `kind: 'team-mention'` card blocks and keep realtime updates stable.
- Modify: `web/src/lib/assistant-runtime.ts`
  - Convert Team mention blocks into assistant-ui compatible metadata.
- Modify: `web/src/components/AssistantChat/HappyThread.tsx`
  - Render Team mention cards and compact queues.
- Create: `web/src/components/AssistantChat/messages/TeamMentionMessage.tsx`
- Modify: `web/src/components/AssistantChat/messages/*` or `HappyThread.tsx`
  - Render Team mention cards and compact queue.

---

## Task 1: Shared Team Chat schemas and events

**Files:**
- Modify: `shared/src/schemas.ts`
- Modify: `shared/src/types.ts`
- Modify: `shared/src/index.ts`
- Create: `shared/src/teamChat.test.ts`

- [ ] **Step 1: Write schema tests**

Create `shared/src/teamChat.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import {
    TeamChatSchema,
    TeamMentionRequestSchema,
    TeamChatMessageSchema,
    TeamParticipantSchema,
    SyncEventSchema
} from './schemas'

describe('Team Chat schemas', () => {
    it('parses Team mention request with processing lifecycle fields', () => {
        const parsed = TeamMentionRequestSchema.parse({
            id: 'req-1',
            teamChatId: 'team-1',
            sourceMessageId: 'msg-1',
            targetSessionId: 'session-1',
            status: 'processing',
            contextSnapshot: {
                originalText: '@Backend confirm fields',
                sharedContext: { goal: 'Build Team Chat', decisions: ['No orchestrator'], openQuestions: [] },
                attachedFiles: []
            },
            hopDepth: 1,
            createdAt: 100,
            deliveredAt: 110,
            seenAt: 120,
            processingStartedAt: 130
        })

        expect(parsed.status).toBe('processing')
        expect(parsed.contextSnapshot.sharedContext.decisions).toEqual(['No orchestrator'])
    })

    it('parses team-message-created sync event', () => {
        const parsed = SyncEventSchema.parse({
            type: 'team-message-created',
            namespace: 'default',
            teamChatId: 'team-1',
            messageId: 'msg-1'
        })

        expect(parsed.type).toBe('team-message-created')
    })
})
```


- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test shared/src/teamChat.test.ts
```

Expected: FAIL because `TeamChatSchema`, `TeamMentionRequestSchema`, `TeamChatMessageSchema`, and Team Chat SyncEvent variants are missing.

- [ ] **Step 3: Add schemas**

In `shared/src/schemas.ts`, add after existing `TeamStateSchema` or near related types:

```ts
export const TeamParticipantRoleSchema = z.enum(['backend', 'frontend', 'tests', 'reviewer', 'docs', 'general'])
export const TeamMentionStatusSchema = z.enum([
    'pending',
    'delivered',
    'seen',
    'processing',
    'responded',
    'no_action',
    'superseded',
    'failed'
])
export const TeamReportTypeSchema = z.enum(['reply', 'progress', 'done', 'blocked', 'question', 'handoff'])

export const TeamSharedContextSnapshotSchema = z.object({
    goal: z.string().optional(),
    decisions: z.array(z.string()).default([]),
    openQuestions: z.array(z.string()).default([]),
    relevantFiles: z.array(z.string()).default([])
})

export const TeamMentionContextSnapshotSchema = z.object({
    originalText: z.string(),
    replyPreview: z.object({
        authorName: z.string(),
        excerpt: z.string()
    }).optional(),
    sharedContext: TeamSharedContextSnapshotSchema,
    recentUpdates: z.array(z.object({
        messageId: z.string(),
        authorName: z.string(),
        excerpt: z.string()
    })).default([]),
    attachedFiles: z.array(z.string()).default([])
})

export const TeamChatSchema = z.object({
    id: z.string(),
    namespace: z.string(),
    name: z.string(),
    projectPath: z.string().optional(),
    archivedAt: z.number().nullable().optional(),
    createdAt: z.number(),
    updatedAt: z.number()
})

export const TeamParticipantSchema = z.object({
    id: z.string(),
    teamChatId: z.string(),
    type: z.enum(['user', 'session']),
    userId: z.string().optional(),
    sessionId: z.string().optional(),
    displayName: z.string(),
    role: TeamParticipantRoleSchema.default('general'),
    color: z.string(),
    archivedAt: z.number().nullable().optional(),
    joinedAt: z.number()
})

export const TeamChatMessageSchema = z.object({
    id: z.string(),
    teamChatId: z.string(),
    seq: z.number(),
    authorParticipantId: z.string(),
    text: z.string(),
    reportType: TeamReportTypeSchema.optional(),
    replyToMessageId: z.string().nullable().optional(),
    replyPreview: z.object({
        authorName: z.string(),
        excerpt: z.string()
    }).nullable().optional(),
    mentions: z.array(z.object({
        participantId: z.string(),
        sessionId: z.string()
    })).default([]),
    files: z.array(z.string()).default([]),
    createdAt: z.number()
})

export const TeamMentionRequestSchema = z.object({
    id: z.string(),
    teamChatId: z.string(),
    sourceMessageId: z.string(),
    targetSessionId: z.string(),
    status: TeamMentionStatusSchema,
    contextSnapshot: TeamMentionContextSnapshotSchema,
    hopDepth: z.number().int().min(0).default(0),
    parentRequestId: z.string().nullable().optional(),
    error: z.string().nullable().optional(),
    createdAt: z.number(),
    deliveredAt: z.number().nullable().optional(),
    seenAt: z.number().nullable().optional(),
    processingStartedAt: z.number().nullable().optional(),
    resolvedAt: z.number().nullable().optional()
})

export type TeamParticipantRole = z.infer<typeof TeamParticipantRoleSchema>
export type TeamMentionStatus = z.infer<typeof TeamMentionStatusSchema>
export type TeamReportType = z.infer<typeof TeamReportTypeSchema>
export type TeamChat = z.infer<typeof TeamChatSchema>
export type TeamParticipant = z.infer<typeof TeamParticipantSchema>
export type TeamChatMessage = z.infer<typeof TeamChatMessageSchema>
export type TeamMentionRequest = z.infer<typeof TeamMentionRequestSchema>
```

Add SyncEvent variants to `SyncEventSchema`:

```ts
SessionEventBaseSchema.extend({
    type: z.literal('team-chat-updated'),
    teamChatId: z.string()
}),
SessionEventBaseSchema.extend({
    type: z.literal('team-message-created'),
    teamChatId: z.string(),
    messageId: z.string()
}),
SessionEventBaseSchema.extend({
    type: z.literal('team-mention-updated'),
    teamChatId: z.string(),
    requestId: z.string(),
    sessionId: z.string(), // set to targetSessionId so session-scoped SSE subscribers receive the event
    targetSessionId: z.string()
}),
SessionEventBaseSchema.extend({
    type: z.literal('team-participant-updated'),
    teamChatId: z.string(),
    participantId: z.string()
})
```

- [ ] **Step 4: Export types**

In `shared/src/types.ts`, export new types from `./schemas`:

```ts
export type {
    TeamChat,
    TeamChatMessage,
    TeamMentionRequest,
    TeamParticipant,
    TeamParticipantRole,
    TeamReportType
} from './schemas'
```

Use the name `TeamChatMessageSchema` for the new Team Chat message schema so it does not conflict with the existing legacy `TeamMessageSchema` used by `teamState`. Export `TeamChatMessage` from `shared/src/types.ts`.

- [ ] **Step 5: Run shared tests/typecheck**

Run:

```bash
bun test shared/src/teamChat.test.ts
bun typecheck
```

Expected: test PASS; typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add shared/src/schemas.ts shared/src/types.ts shared/src/index.ts shared/src/teamChat.test.ts
git commit -m "feat: add team chat protocol schemas"
```

---

## Task 2: SQLite v10 migration and TeamChatStore

**Files:**
- Modify: `hub/src/store/index.ts`
- Modify: `hub/src/store/types.ts`
- Create: `hub/src/store/teamChatStore.ts`
- Create: `hub/src/store/teamChatStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Create `hub/src/store/teamChatStore.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Store } from './index'

describe('TeamChatStore', () => {
    it('creates chats, participants, and seq-ordered messages by namespace', () => {
        const store = new Store(':memory:')
        const chat = store.teamChats.createTeamChat({ namespace: 'ns-a', name: 'Build Team Chat', projectPath: '/repo' })
        const user = store.teamChats.addParticipant({
            namespace: 'ns-a',
            teamChatId: chat.id,
            type: 'user',
            displayName: 'You',
            color: '#34d399',
            role: 'general'
        })
        const msg = store.teamChats.addMessage({
            namespace: 'ns-a',
            teamChatId: chat.id,
            authorParticipantId: user.id,
            text: '@Backend confirm fields',
            mentions: []
        })

        expect(msg.seq).toBe(1)
        expect(store.teamChats.listTeamChats('ns-a')).toHaveLength(1)
        expect(store.teamChats.listTeamChats('ns-b')).toHaveLength(0)
    })

    it('fetches messages around a reply target', () => {
        const store = new Store(':memory:')
        const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Chat' })
        const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', color: '#34d399', role: 'general' })
        const first = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'first', mentions: [] })
        store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'second', mentions: [] })

        const around = store.teamChats.getMessagesAround({ namespace: 'default', teamChatId: chat.id, messageId: first.id, before: 5, after: 5 })
        expect(around.messages.map(m => m.text)).toEqual(['first', 'second'])
    })

    it('stores mention requests and lifecycle timestamps', () => {
        const store = new Store(':memory:')
        const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Chat' })
        const user = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', color: '#34d399', role: 'general' })
        const message = store.teamChats.addMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend confirm', mentions: [] })
        const request = store.teamChats.addMentionRequest({
            namespace: 'default',
            teamChatId: chat.id,
            sourceMessageId: message.id,
            targetSessionId: 'session-backend',
            contextSnapshot: { originalText: message.text, sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] }, attachedFiles: [], recentUpdates: [] },
            hopDepth: 1
        })

        const seenAt = Date.now()
        store.teamChats.updateMentionStatus({ namespace: 'default', requestId: request.id, status: 'seen', seenAt })

        const updated = store.teamChats.getMentionRequest('default', request.id)
        expect(updated?.status).toBe('seen')
        expect(updated?.seenAt).toBe(seenAt)
        expect(store.teamChats.listPendingMentionRequests('default', 'session-backend').map(item => item.id)).toEqual([request.id])
        expect(store.teamChats.getMentionRequest('other-ns', request.id)).toBeNull()
    })
})
```


- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun --cwd hub test src/store/teamChatStore.test.ts
```

Expected: FAIL because `store.teamChats` does not exist.

- [ ] **Step 3: Add stored types**

In `hub/src/store/types.ts`, add exact row-facing types:

```ts
export type StoredTeamChat = {
    id: string
    namespace: string
    name: string
    projectPath: string | null
    sharedContext: unknown | null
    archivedAt: number | null
    createdAt: number
    updatedAt: number
}

export type StoredTeamParticipant = {
    id: string
    namespace: string
    teamChatId: string
    type: 'user' | 'session'
    userId: string | null
    sessionId: string | null
    displayName: string
    role: 'backend' | 'frontend' | 'tests' | 'reviewer' | 'docs' | 'general'
    color: string
    archivedAt: number | null
    joinedAt: number
}

export type StoredTeamMessage = {
    id: string
    namespace: string
    teamChatId: string
    seq: number
    authorParticipantId: string
    text: string
    reportType: 'reply' | 'progress' | 'done' | 'blocked' | 'question' | 'handoff' | null
    replyToMessageId: string | null
    replyPreview: unknown | null
    mentions: unknown
    files: unknown
    createdAt: number
}

export type StoredTeamMentionRequest = {
    id: string
    namespace: string
    teamChatId: string
    sourceMessageId: string
    targetSessionId: string
    status: 'pending' | 'delivered' | 'seen' | 'processing' | 'responded' | 'no_action' | 'superseded' | 'failed'
    contextSnapshot: unknown
    hopDepth: number
    parentRequestId: string | null
    error: string | null
    createdAt: number
    deliveredAt: number | null
    seenAt: number | null
    processingStartedAt: number | null
    resolvedAt: number | null
}
```

- [ ] **Step 4: Add v10 schema migration**

In `hub/src/store/index.ts`:

```ts
const SCHEMA_VERSION: number = 10
```

Add migration entry:

```ts
8: () => this.migrateFromV8ToV9(),
9: () => this.migrateFromV9ToV10(),
```

Add `team_chats`, `team_participants`, `team_messages`, `team_mention_requests` to `REQUIRED_TABLES`.

Add method:

```ts
private migrateFromV9ToV10(): void {
    this.createTeamChatSchema()
}
```

Add `createTeamChatSchema()` and call it from `createSchema()`:

```ts
private createTeamChatSchema(): void {
    this.db.exec(`
        CREATE TABLE IF NOT EXISTS team_chats (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            name TEXT NOT NULL,
            project_path TEXT,
            shared_context TEXT,
            archived_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_team_chats_namespace_updated
            ON team_chats(namespace, updated_at DESC);

        CREATE TABLE IF NOT EXISTS team_participants (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            team_chat_id TEXT NOT NULL,
            type TEXT NOT NULL,
            user_id TEXT,
            session_id TEXT,
            display_name TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'general',
            color TEXT NOT NULL,
            archived_at INTEGER,
            joined_at INTEGER NOT NULL,
            FOREIGN KEY (team_chat_id) REFERENCES team_chats(id) ON DELETE CASCADE,
            FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_team_participants_chat
            ON team_participants(team_chat_id, archived_at);
        CREATE INDEX IF NOT EXISTS idx_team_participants_session
            ON team_participants(namespace, session_id);

        CREATE TABLE IF NOT EXISTS team_messages (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            team_chat_id TEXT NOT NULL,
            seq INTEGER NOT NULL,
            author_participant_id TEXT NOT NULL,
            text TEXT NOT NULL,
            report_type TEXT,
            reply_to_message_id TEXT,
            reply_preview TEXT,
            mentions TEXT NOT NULL DEFAULT '[]',
            files TEXT NOT NULL DEFAULT '[]',
            created_at INTEGER NOT NULL,
            FOREIGN KEY (team_chat_id) REFERENCES team_chats(id) ON DELETE CASCADE,
            FOREIGN KEY (author_participant_id) REFERENCES team_participants(id) ON DELETE RESTRICT,
            FOREIGN KEY (reply_to_message_id) REFERENCES team_messages(id) ON DELETE SET NULL,
            UNIQUE(team_chat_id, seq)
        );
        CREATE INDEX IF NOT EXISTS idx_team_messages_chat_seq
            ON team_messages(team_chat_id, seq DESC);

        CREATE TABLE IF NOT EXISTS team_mention_requests (
            id TEXT PRIMARY KEY,
            namespace TEXT NOT NULL,
            team_chat_id TEXT NOT NULL,
            source_message_id TEXT NOT NULL,
            target_session_id TEXT NOT NULL,
            status TEXT NOT NULL,
            context_snapshot TEXT NOT NULL,
            hop_depth INTEGER NOT NULL DEFAULT 0,
            parent_request_id TEXT,
            error TEXT,
            created_at INTEGER NOT NULL,
            delivered_at INTEGER,
            seen_at INTEGER,
            processing_started_at INTEGER,
            resolved_at INTEGER,
            FOREIGN KEY (team_chat_id) REFERENCES team_chats(id) ON DELETE CASCADE,
            FOREIGN KEY (source_message_id) REFERENCES team_messages(id) ON DELETE CASCADE,
            FOREIGN KEY (target_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
            FOREIGN KEY (parent_request_id) REFERENCES team_mention_requests(id) ON DELETE SET NULL
        );
        CREATE INDEX IF NOT EXISTS idx_team_mentions_session_status
            ON team_mention_requests(namespace, target_session_id, status, created_at);
        CREATE INDEX IF NOT EXISTS idx_team_mentions_message
            ON team_mention_requests(source_message_id);
    `)
}
```

- [ ] **Step 5: Implement `TeamChatStore`**

Create `hub/src/store/teamChatStore.ts` with focused methods:

```ts
import { randomUUID } from 'node:crypto'
import type { Database } from 'bun:sqlite'
import type { StoredTeamChat, StoredTeamMessage, StoredTeamMentionRequest, StoredTeamParticipant } from './types'
import { safeJsonParse } from './json'

type TeamChatRow = {
    id: string
    namespace: string
    name: string
    project_path: string | null
    shared_context: string | null
    archived_at: number | null
    created_at: number
    updated_at: number
}

type TeamParticipantRow = {
    id: string
    namespace: string
    team_chat_id: string
    type: StoredTeamParticipant['type']
    user_id: string | null
    session_id: string | null
    display_name: string
    role: StoredTeamParticipant['role']
    color: string
    archived_at: number | null
    joined_at: number
}

type TeamMessageRow = {
    id: string
    namespace: string
    team_chat_id: string
    seq: number
    author_participant_id: string
    text: string
    report_type: StoredTeamMessage['reportType']
    reply_to_message_id: string | null
    reply_preview: string | null
    mentions: string
    files: string
    created_at: number
}

type TeamMentionRequestRow = {
    id: string
    namespace: string
    team_chat_id: string
    source_message_id: string
    target_session_id: string
    status: StoredTeamMentionRequest['status']
    context_snapshot: string
    hop_depth: number
    parent_request_id: string | null
    error: string | null
    created_at: number
    delivered_at: number | null
    seen_at: number | null
    processing_started_at: number | null
    resolved_at: number | null
}

export class TeamChatStore {
    constructor(private readonly db: Database) {}

    createTeamChat(input: { namespace: string; name: string; projectPath?: string | null }): StoredTeamChat {
        const now = Date.now()
        const id = randomUUID()
        this.db.prepare(`
            INSERT INTO team_chats (id, namespace, name, project_path, shared_context, archived_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, NULL, ?, ?)
        `).run(id, input.namespace, input.name, input.projectPath ?? null, JSON.stringify({ decisions: [], openQuestions: [], relevantFiles: [] }), now, now)
        return this.getTeamChat(input.namespace, id)!
    }

    getTeamChat(namespace: string, id: string): StoredTeamChat | null {
        const row = this.db.prepare('SELECT * FROM team_chats WHERE namespace = ? AND id = ?').get(namespace, id) as TeamChatRow | undefined
        return row ? toTeamChat(row) : null
    }

    listTeamChats(namespace: string): StoredTeamChat[] {
        const rows = this.db.prepare('SELECT * FROM team_chats WHERE namespace = ? AND archived_at IS NULL ORDER BY updated_at DESC').all(namespace) as TeamChatRow[]
        return rows.map(toTeamChat)
    }

    addParticipant(input: {
        namespace: string
        teamChatId: string
        type: 'user' | 'session'
        userId?: string | null
        sessionId?: string | null
        displayName: string
        role: StoredTeamParticipant['role']
        color: string
    }): StoredTeamParticipant {
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO team_participants (id, namespace, team_chat_id, type, user_id, session_id, display_name, role, color, archived_at, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        `).run(id, input.namespace, input.teamChatId, input.type, input.userId ?? null, input.sessionId ?? null, input.displayName, input.role, input.color, now)
        return this.getParticipant(input.namespace, id)!
    }

    getParticipant(namespace: string, id: string): StoredTeamParticipant | null {
        const row = this.db.prepare('SELECT * FROM team_participants WHERE namespace = ? AND id = ?').get(namespace, id) as TeamParticipantRow | undefined
        return row ? toParticipant(row) : null
    }

    listParticipants(namespace: string, teamChatId: string): StoredTeamParticipant[] {
        const rows = this.db.prepare('SELECT * FROM team_participants WHERE namespace = ? AND team_chat_id = ? AND archived_at IS NULL ORDER BY joined_at ASC').all(namespace, teamChatId) as TeamParticipantRow[]
        return rows.map(toParticipant)
    }

    addMessage(input: {
        namespace: string
        teamChatId: string
        authorParticipantId: string
        text: string
        reportType?: StoredTeamMessage['reportType']
        replyToMessageId?: string | null
        replyPreview?: unknown | null
        mentions: unknown[]
        files?: string[]
    }): StoredTeamMessage {
        const id = randomUUID()
        const now = Date.now()
        const seqRow = this.db.prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS next_seq FROM team_messages WHERE team_chat_id = ?').get(input.teamChatId) as { next_seq: number }
        this.db.prepare(`
            INSERT INTO team_messages (id, namespace, team_chat_id, seq, author_participant_id, text, report_type, reply_to_message_id, reply_preview, mentions, files, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, input.namespace, input.teamChatId, seqRow.next_seq, input.authorParticipantId, input.text, input.reportType ?? null, input.replyToMessageId ?? null, JSON.stringify(input.replyPreview ?? null), JSON.stringify(input.mentions), JSON.stringify(input.files ?? []), now)
        this.db.prepare('UPDATE team_chats SET updated_at = ? WHERE namespace = ? AND id = ?').run(now, input.namespace, input.teamChatId)
        return this.getMessage(input.namespace, id)!
    }

    getMessage(namespace: string, id: string): StoredTeamMessage | null {
        const row = this.db.prepare('SELECT * FROM team_messages WHERE namespace = ? AND id = ?').get(namespace, id) as TeamMessageRow | undefined
        return row ? toMessage(row) : null
    }

    getMessages(namespace: string, teamChatId: string, limit: number, beforeSeq?: number): StoredTeamMessage[] {
        const rows = beforeSeq
            ? this.db.prepare('SELECT * FROM team_messages WHERE namespace = ? AND team_chat_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?').all(namespace, teamChatId, beforeSeq, limit) as TeamMessageRow[]
            : this.db.prepare('SELECT * FROM team_messages WHERE namespace = ? AND team_chat_id = ? ORDER BY seq DESC LIMIT ?').all(namespace, teamChatId, limit) as TeamMessageRow[]
        return rows.map(toMessage).reverse()
    }

    getMessagesAround(input: { namespace: string; teamChatId: string; messageId: string; before: number; after: number }): { messages: StoredTeamMessage[] } {
        const anchor = this.getMessage(input.namespace, input.messageId)
        if (!anchor) return { messages: [] }
        const rows = this.db.prepare(`
            SELECT * FROM team_messages
            WHERE namespace = ? AND team_chat_id = ? AND seq BETWEEN ? AND ?
            ORDER BY seq ASC
        `).all(input.namespace, input.teamChatId, anchor.seq - input.before, anchor.seq + input.after) as TeamMessageRow[]
        return { messages: rows.map(toMessage) }
    }

    addMentionRequest(input: {
        namespace: string
        teamChatId: string
        sourceMessageId: string
        targetSessionId: string
        status?: StoredTeamMentionRequest['status']
        contextSnapshot: unknown
        hopDepth: number
        parentRequestId?: string | null
    }): StoredTeamMentionRequest {
        const id = randomUUID()
        const now = Date.now()
        this.db.prepare(`
            INSERT INTO team_mention_requests (id, namespace, team_chat_id, source_message_id, target_session_id, status, context_snapshot, hop_depth, parent_request_id, error, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
        `).run(id, input.namespace, input.teamChatId, input.sourceMessageId, input.targetSessionId, input.status ?? 'pending', JSON.stringify(input.contextSnapshot), input.hopDepth, input.parentRequestId ?? null, now)
        return this.getMentionRequest(input.namespace, id)!
    }

    getMentionRequest(namespace: string, id: string): StoredTeamMentionRequest | null {
        const row = this.db.prepare('SELECT * FROM team_mention_requests WHERE namespace = ? AND id = ?').get(namespace, id) as TeamMentionRequestRow | undefined
        return row ? toMentionRequest(row) : null
    }

    listPendingMentionRequests(namespace: string, targetSessionId: string): StoredTeamMentionRequest[] {
        const rows = this.db.prepare(`
            SELECT * FROM team_mention_requests
            WHERE namespace = ? AND target_session_id = ? AND status IN ('pending', 'delivered', 'seen')
            ORDER BY created_at ASC
        `).all(namespace, targetSessionId) as TeamMentionRequestRow[]
        return rows.map(toMentionRequest)
    }

    updateMentionStatus(input: {
        namespace: string
        requestId: string
        status: StoredTeamMentionRequest['status']
        deliveredAt?: number | null
        seenAt?: number | null
        processingStartedAt?: number | null
        resolvedAt?: number | null
        error?: string | null
    }): StoredTeamMentionRequest | null {
        this.db.prepare(`
            UPDATE team_mention_requests
            SET status = ?, delivered_at = COALESCE(?, delivered_at), seen_at = COALESCE(?, seen_at),
                processing_started_at = COALESCE(?, processing_started_at), resolved_at = COALESCE(?, resolved_at), error = COALESCE(?, error)
            WHERE namespace = ? AND id = ?
        `).run(input.status, input.deliveredAt ?? null, input.seenAt ?? null, input.processingStartedAt ?? null, input.resolvedAt ?? null, input.error ?? null, input.namespace, input.requestId)
        return this.getMentionRequest(input.namespace, input.requestId)
    }

    archiveParticipant(namespace: string, teamChatId: string, participantId: string): void {
        this.db.prepare('UPDATE team_participants SET archived_at = ? WHERE namespace = ? AND team_chat_id = ? AND id = ?')
            .run(Date.now(), namespace, teamChatId, participantId)
    }
}

function toTeamChat(row: TeamChatRow): StoredTeamChat {
    return {
        id: row.id,
        namespace: row.namespace,
        name: row.name,
        projectPath: row.project_path,
        sharedContext: safeJsonParse(row.shared_context),
        archivedAt: row.archived_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    }
}
function toParticipant(row: TeamParticipantRow): StoredTeamParticipant {
    return {
        id: row.id,
        namespace: row.namespace,
        teamChatId: row.team_chat_id,
        type: row.type,
        userId: row.user_id,
        sessionId: row.session_id,
        displayName: row.display_name,
        role: row.role,
        color: row.color,
        archivedAt: row.archived_at,
        joinedAt: row.joined_at
    }
}

function toMessage(row: TeamMessageRow): StoredTeamMessage {
    return {
        id: row.id,
        namespace: row.namespace,
        teamChatId: row.team_chat_id,
        seq: row.seq,
        authorParticipantId: row.author_participant_id,
        text: row.text,
        reportType: row.report_type,
        replyToMessageId: row.reply_to_message_id,
        replyPreview: safeJsonParse(row.reply_preview),
        mentions: safeJsonParse(row.mentions) ?? [],
        files: safeJsonParse(row.files) ?? [],
        createdAt: row.created_at
    }
}

function toMentionRequest(row: TeamMentionRequestRow): StoredTeamMentionRequest {
    return {
        id: row.id,
        namespace: row.namespace,
        teamChatId: row.team_chat_id,
        sourceMessageId: row.source_message_id,
        targetSessionId: row.target_session_id,
        status: row.status,
        contextSnapshot: safeJsonParse(row.context_snapshot),
        hopDepth: row.hop_depth,
        parentRequestId: row.parent_request_id,
        error: row.error,
        createdAt: row.created_at,
        deliveredAt: row.delivered_at,
        seenAt: row.seen_at,
        processingStartedAt: row.processing_started_at,
        resolvedAt: row.resolved_at
    }
}
```

- [ ] **Step 6: Wire store**

In `hub/src/store/index.ts`:

```ts
import { TeamChatStore } from './teamChatStore'
export { TeamChatStore } from './teamChatStore'
readonly teamChats: TeamChatStore
// constructor:
this.teamChats = new TeamChatStore(this.db)
```

- [ ] **Step 7: Run tests**

```bash
bun --cwd hub test src/store/teamChatStore.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add hub/src/store/index.ts hub/src/store/types.ts hub/src/store/teamChatStore.ts hub/src/store/teamChatStore.test.ts
git commit -m "feat: add team chat store"
```

---

## Task 3: TeamChatService, routes, and SSE events

**Files:**
- Create: `hub/src/sync/teamChatService.ts`
- Create: `hub/src/sync/teamChatService.test.ts`
- Create: `hub/src/web/routes/teamChats.ts`
- Create: `hub/src/web/routes/teamChats.test.ts`
- Modify: `hub/src/sync/syncEngine.ts`
- Modify: `hub/src/web/server.ts`

- [ ] **Step 1: Write service tests**

Create `hub/src/sync/teamChatService.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import { Store } from '../store'
import { TeamChatService } from './teamChatService'

function createPublisher() {
    return { emit: mock(() => undefined) }
}

describe('TeamChatService', () => {
    it('posts a message and emits team-message-created', () => {
        const store = new Store(':memory:')
        const publisher = createPublisher()
        const service = new TeamChatService(store, publisher)
        const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat', projectPath: '/repo' })
        const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })

        const result = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'hello' })

        expect(result.message.seq).toBe(1)
        expect(publisher.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'team-message-created', teamChatId: chat.id, messageId: result.message.id }))
    })
})
```


- [ ] **Step 2: Run test to verify it fails**

```bash
bun --cwd hub test src/sync/teamChatService.test.ts
```

Expected: FAIL because `TeamChatService` is missing.

- [ ] **Step 3: Implement service skeleton**

Create `hub/src/sync/teamChatService.ts`:

```ts
import type { Store } from '../store'
import type { EventPublisher } from './eventPublisher'

export class TeamChatService {
    constructor(
        private readonly store: Store,
        private readonly publisher: Pick<EventPublisher, 'emit'>
    ) {}

    createTeamChat(input: { namespace: string; name: string; projectPath?: string | null }) {
        const chat = this.store.teamChats.createTeamChat(input)
        this.publisher.emit({ type: 'team-chat-updated', namespace: input.namespace, teamChatId: chat.id })
        return chat
    }

    addParticipant(input: {
        namespace: string
        teamChatId: string
        type: 'user' | 'session'
        userId?: string | null
        sessionId?: string | null
        displayName: string
        role: 'backend' | 'frontend' | 'tests' | 'reviewer' | 'docs' | 'general'
        color: string
    }) {
        const participant = this.store.teamChats.addParticipant(input)
        this.publisher.emit({ type: 'team-participant-updated', namespace: input.namespace, teamChatId: input.teamChatId, participantId: participant.id })
        return participant
    }

    postMessage(input: {
        namespace: string
        teamChatId: string
        authorParticipantId: string
        text: string
        replyToMessageId?: string | null
    }) {
        const replyPreview = input.replyToMessageId
            ? this.buildReplyPreview(input.namespace, input.replyToMessageId)
            : null
        const message = this.store.teamChats.addMessage({
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            authorParticipantId: input.authorParticipantId,
            text: input.text,
            replyToMessageId: input.replyToMessageId ?? null,
            replyPreview,
            mentions: []
        })
        this.publisher.emit({ type: 'team-message-created', namespace: input.namespace, teamChatId: input.teamChatId, messageId: message.id })
        return { message }
    }

    private buildReplyPreview(namespace: string, messageId: string): { authorName: string; excerpt: string } | null {
        const message = this.store.teamChats.getMessage(namespace, messageId)
        if (!message) return null
        const author = this.store.teamChats.getParticipant(namespace, message.authorParticipantId)
        return {
            authorName: author?.displayName ?? 'Unknown',
            excerpt: message.text.slice(0, 160)
        }
    }
}
```

- [ ] **Step 4: Expose through SyncEngine**

In `hub/src/sync/syncEngine.ts` add `private readonly teamChatService`. Instantiate after `eventPublisher` exists:

```ts
this.teamChatService = new TeamChatService(store, this.eventPublisher)
```

Add methods:

```ts
createTeamChat(input: { namespace: string; name: string; projectPath?: string | null }) {
    return this.teamChatService.createTeamChat(input)
}

listTeamChats(namespace: string) {
    return this.teamChatService.listTeamChats(namespace)
}
```

Add these pass-through methods exactly: `getTeamChat(namespace, id)`, `listTeamChats(namespace)`, `getTeamMessages(namespace, teamChatId, options)`, `getTeamMessagesAround(namespace, teamChatId, messageId, options)`, `addTeamParticipant(input)`, and `postTeamMessage(input)`.

- [ ] **Step 5: Create Hono routes**

Create `hub/src/web/routes/teamChats.ts` with request schemas and namespace checks:

```ts
import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'
import { requireSyncEngine } from './guards'

const createTeamChatSchema = z.object({
    name: z.string().min(1),
    projectPath: z.string().optional().nullable()
})
const postTeamChatMessageSchema = z.object({
    authorParticipantId: z.string().min(1),
    text: z.string().trim().min(1).max(20_000),
    replyToMessageId: z.string().optional().nullable()
})

export function createTeamChatsRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.get('/team-chats', (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        return c.json({ teamChats: engine.listTeamChats(c.get('namespace')) })
    })

    app.post('/team-chats', async (c) => {
        const engine = requireSyncEngine(c, getSyncEngine)
        if (engine instanceof Response) return engine
        const body = await c.req.json().catch(() => null)
        const parsed = createTeamChatSchema.safeParse(body)
        if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
        const teamChat = engine.createTeamChat({ namespace: c.get('namespace'), name: parsed.data.name, projectPath: parsed.data.projectPath ?? null })
        return c.json({ teamChat }, 201)
    })

    // Continue registering handlers below.
```

Add these route handlers inside `createTeamChatsRoutes` before the final `return app`:

```ts
app.get('/team-chats/:id', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    const teamChat = engine.getTeamChat(c.get('namespace'), c.req.param('id'))
    return teamChat ? c.json({ teamChat }) : c.json({ error: 'Team Chat not found' }, 404)
})

app.get('/team-chats/:id/messages', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100)
    const beforeSeq = c.req.query('beforeSeq') ? Number(c.req.query('beforeSeq')) : null
    return c.json(engine.getTeamMessages(c.get('namespace'), c.req.param('id'), { limit, beforeSeq }))
})

app.get('/team-chats/:id/messages/:messageId/context', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    return c.json(engine.getTeamMessagesAround(c.get('namespace'), c.req.param('id'), c.req.param('messageId'), { before: 20, after: 20 }))
})

app.post('/team-chats/:id/messages', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    const body = await c.req.json().catch(() => null)
    const parsed = postTeamChatMessageSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
    return c.json(engine.postTeamMessage({ namespace: c.get('namespace'), teamChatId: c.req.param('id'), ...parsed.data }), 201)
})
```

Add participant handlers in the same file:

```ts
const addParticipantSchema = z.object({
    type: z.enum(['user', 'session']),
    userId: z.string().optional().nullable(),
    sessionId: z.string().optional().nullable(),
    displayName: z.string().min(1),
    role: z.enum(['backend', 'frontend', 'tests', 'reviewer', 'docs', 'general']).default('general'),
    color: z.string().regex(/^#[0-9a-f]{6}$/i)
})

app.get('/team-chats/:id/participants', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    return c.json({ participants: engine.listTeamParticipants(c.get('namespace'), c.req.param('id')) })
})

app.post('/team-chats/:id/participants', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    const body = await c.req.json().catch(() => null)
    const parsed = addParticipantSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
    return c.json({ participant: engine.addTeamParticipant({ namespace: c.get('namespace'), teamChatId: c.req.param('id'), ...parsed.data }) }, 201)
})

app.delete('/team-chats/:id/participants/:participantId', (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    engine.archiveTeamParticipant(c.get('namespace'), c.req.param('id'), c.req.param('participantId'))
    return c.json({ ok: true })
})

return app
}
```



- [ ] **Step 6: Add ownership guards before exposing routes**

In `TeamChatService` use these guard methods before every mutation/read that uses IDs from the client:

```ts
private requireTeamChat(namespace: string, teamChatId: string) {
    const chat = this.store.teamChats.getTeamChat(namespace, teamChatId)
    if (!chat) throw new Error('TEAM_CHAT_NOT_FOUND')
    return chat
}

private requireTeamParticipant(namespace: string, teamChatId: string, participantId: string) {
    const participant = this.store.teamChats.getParticipant(namespace, participantId)
    if (!participant || participant.teamChatId !== teamChatId || participant.archivedAt) throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
    return participant
}

private requireTeamMentionRequest(namespace: string, requestId: string, expectedSessionId?: string) {
    const request = this.store.teamChats.getMentionRequest(namespace, requestId)
    if (!request || (expectedSessionId && request.targetSessionId !== expectedSessionId)) throw new Error('TEAM_MENTION_NOT_FOUND')
    return request
}
```

Route tests must cover cross-namespace chat, participant, reply message, and mention request IDs.

- [ ] **Step 7: Register route**

In `hub/src/web/server.ts`:

```ts
import { createTeamChatsRoutes } from './routes/teamChats'
// after messages/sessions routes:
app.route('/api', createTeamChatsRoutes(options.getSyncEngine))
```

- [ ] **Step 8: Route tests**

Create `hub/src/web/routes/teamChats.test.ts` with this explicit case:

```ts
import { Hono } from 'hono'
import type { WebAppEnv } from '../middleware/auth'

function createApp(namespace: string, engine: Partial<SyncEngine>) {
    const app = new Hono<WebAppEnv>()
    app.use('*', async (c, next) => {
        c.set('namespace', namespace)
        await next()
    })
    app.route('/api', createTeamChatsRoutes(() => engine as SyncEngine))
    return app
}

it('rejects team chat access across namespaces', async () => {
    const engine = {
        getTeamChat: (namespace: string, id: string) => namespace === 'ns-a' && id === 'team-a' ? { id: 'team-a', namespace: 'ns-a', name: 'Team', createdAt: 1, updatedAt: 1 } : null,
        listTeamChats: () => []
    }
    const app = createApp('ns-b', engine)
    const response = await app.request('/api/team-chats/team-a')
    expect(response.status).toBe(404)
})
```

Use the same auth/test helpers already present in `hub/src/web/routes/sessions.test.ts`; if those helpers are local to that file, copy them into `teamChats.test.ts`.

- [ ] **Step 9: Run tests**

```bash
bun --cwd hub test src/sync/teamChatService.test.ts src/web/routes/teamChats.test.ts
bun typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add hub/src/sync/teamChatService.ts hub/src/sync/teamChatService.test.ts hub/src/web/routes/teamChats.ts hub/src/web/routes/teamChats.test.ts hub/src/sync/syncEngine.ts hub/src/web/server.ts
git commit -m "feat: add team chat API"
```

---

## Task 4: Web Team Chat data layer and route shell

**Files:**
- Modify: `web/src/types/api.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/lib/query-keys.ts`
- Create: `web/src/hooks/queries/useTeamChats.ts`
- Create: `web/src/hooks/queries/useTeamChat.ts`
- Create: `web/src/hooks/queries/useTeamChatParticipants.ts`
- Create: `web/src/hooks/queries/useTeamChatMessages.ts`
- Create: `web/src/hooks/queries/useTeamChatMessagesAround.ts`
- Create: `web/src/hooks/queries/useSessionTeamMentions.ts`
- Create: `web/src/hooks/mutations/useTeamChatActions.ts`
- Create: `web/src/routes/team-chats.tsx`
- Create: `web/src/routes/team-chats/$teamChatId.tsx`
- Modify: `web/src/router.tsx`

- [ ] **Step 1: Add web types**

In `web/src/types/api.ts`:

```ts
export type TeamChat = {
    id: string
    namespace: string
    name: string
    projectPath?: string | null
    createdAt: number
    updatedAt: number
}

export type TeamParticipant = {
    id: string
    teamChatId: string
    type: 'user' | 'session'
    userId?: string | null
    sessionId?: string | null
    displayName: string
    role: 'backend' | 'frontend' | 'tests' | 'reviewer' | 'docs' | 'general'
    color: string
    joinedAt: number
}

export type TeamChatMessage = {
    id: string
    teamChatId: string
    seq: number
    authorParticipantId: string
    text: string
    reportType?: 'reply' | 'progress' | 'done' | 'blocked' | 'question' | 'handoff' | null
    replyToMessageId?: string | null
    replyPreview?: { authorName: string; excerpt: string } | null
    mentions: Array<{ participantId: string; sessionId: string }>
    files: string[]
    createdAt: number
}

export type TeamChatsResponse = { teamChats: TeamChat[] }
export type TeamChatResponse = { teamChat: TeamChat }
export type TeamMentionRequest = {
    id: string
    teamChatId: string
    sourceMessageId: string
    targetSessionId: string
    status: 'pending' | 'delivered' | 'seen' | 'processing' | 'responded' | 'no_action' | 'superseded' | 'failed'
    createdAt: number
    seenAt?: number | null
    resolvedAt?: number | null
}

export type TeamMessagesResponse = {
    messages: TeamChatMessage[]
    page: { limit: number; nextBeforeSeq: number | null; hasMore: boolean }
}
```

- [ ] **Step 2: Add client methods**

In `web/src/api/client.ts`:

```ts
async getTeamChats(): Promise<TeamChatsResponse> {
    return await this.request<TeamChatsResponse>('/api/team-chats')
}

async createTeamChat(input: { name: string; projectPath?: string | null }): Promise<TeamChatResponse> {
    return await this.request<TeamChatResponse>('/api/team-chats', {
        method: 'POST',
        body: JSON.stringify(input)
    })
}

async getTeamMessages(teamChatId: string, opts?: { limit?: number; beforeSeq?: number | null }): Promise<TeamMessagesResponse> {
    const params = new URLSearchParams()
    if (opts?.limit) params.set('limit', String(opts.limit))
    if (opts?.beforeSeq) params.set('beforeSeq', String(opts.beforeSeq))
    const qs = params.toString()
    return await this.request<TeamMessagesResponse>(`/api/team-chats/${encodeURIComponent(teamChatId)}/messages${qs ? `?${qs}` : ''}`)
}

async sendTeamMessage(teamChatId: string, input: { authorParticipantId: string; text: string; replyToMessageId?: string | null }): Promise<{ message: TeamChatMessage }> {
    return await this.request<{ message: TeamChatMessage }>(`/api/team-chats/${encodeURIComponent(teamChatId)}/messages`, {
        method: 'POST',
        body: JSON.stringify(input)
    })
}

async getTeamMessagesAround(teamChatId: string, messageId: string): Promise<TeamMessagesResponse> {
    return await this.request<TeamMessagesResponse>(`/api/team-chats/${encodeURIComponent(teamChatId)}/messages/${encodeURIComponent(messageId)}/context`)
}

async getTeamParticipants(teamChatId: string): Promise<{ participants: TeamParticipant[] }> {
    return await this.request<{ participants: TeamParticipant[] }>(`/api/team-chats/${encodeURIComponent(teamChatId)}/participants`)
}

async getSessionTeamMentions(sessionId: string): Promise<{ requests: TeamMentionRequest[] }> {
    return await this.request<{ requests: TeamMentionRequest[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/team-mentions`)
}
```

- [ ] **Step 3: Add query keys and hooks**

In `web/src/lib/query-keys.ts`:

```ts
teamChats: ['team-chats'] as const,
teamChat: (teamChatId: string) => ['team-chat', teamChatId] as const,
teamParticipants: (teamChatId: string) => ['team-chat-participants', teamChatId] as const,
teamMessages: (teamChatId: string) => ['team-messages', teamChatId] as const,
teamMessagesAround: (teamChatId: string, messageId: string) => ['team-messages-around', teamChatId, messageId] as const,
sessionTeamMentions: (sessionId: string) => ['session-team-mentions', sessionId] as const,
```

Create hooks with TanStack Query using patterns from `useMessages.ts` and `useSessions.ts`:

```ts
export function useTeamChats(api: ApiClient) {
    const query = useQuery({ queryKey: queryKeys.teamChats, queryFn: () => api.getTeamChats() })
    return { teamChats: query.data?.teamChats ?? [], ...query }
}

export function useTeamChatMessagesAround(api: ApiClient, teamChatId: string, messageId: string | null) {
    return useQuery({
        queryKey: messageId ? queryKeys.teamMessagesAround(teamChatId, messageId) : ['team-messages-around-disabled'],
        queryFn: () => api.getTeamMessagesAround(teamChatId, messageId!),
        enabled: Boolean(messageId)
    })
}
```

Also add `web/src/api/client.teamChat.test.ts` before implementation; assert exact URLs for list, `limit/beforeSeq`, `messages/:messageId/context`, and URL encoding.

- [ ] **Step 4: Add route shell**

Create `web/src/routes/team-chats.tsx`:

```tsx
import { useAppContext } from '@/lib/app-context'
import { useTeamChats } from '@/hooks/queries/useTeamChats'

export default function TeamChatsPage() {
    const { api } = useAppContext()
    const { teamChats, isLoading } = useTeamChats(api)
    if (isLoading) return <div className="p-3 text-sm text-[var(--app-hint)]">Loading Team Chats…</div>
    return <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-fg)]">{teamChats.map(chat => <div key={chat.id}>{chat.name}</div>)}</div>
}
```

- [ ] **Step 5: Wire router**

In `web/src/router.tsx`, import routes and add:

```ts
import TeamChatsPage from '@/routes/team-chats'
import TeamChatDetailPage from '@/routes/team-chats/$teamChatId'

const teamChatsRoute = createRoute({ getParentRoute: () => rootRoute, path: '/team-chats', component: TeamChatsPage })
const teamChatDetailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/team-chats/$teamChatId', component: TeamChatDetailPage })
```

Add to route tree.

- [ ] **Step 6: Run web tests/typecheck**

```bash
bun --cwd web typecheck
bun --cwd web test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/types/api.ts web/src/api/client.ts web/src/lib/query-keys.ts web/src/api/client.teamChat.test.ts web/src/hooks/queries/useTeamChats.ts web/src/hooks/queries/useTeamChat.ts web/src/hooks/queries/useTeamChatParticipants.ts web/src/hooks/queries/useTeamChatMessages.ts web/src/hooks/queries/useTeamChatMessagesAround.ts web/src/hooks/queries/useSessionTeamMentions.ts web/src/hooks/mutations/useTeamChatActions.ts web/src/routes/team-chats.tsx web/src/routes/team-chats/\$teamChatId.tsx web/src/router.tsx
git commit -m "feat: add team chat web data layer"
```

---

## Task 5: Team Chat UI MVP

**Files:**
- Create: `web/src/components/TeamChat/TeamChatLayout.tsx`
- Create: `web/src/components/TeamChat/TeamChatTimeline.tsx`
- Create: `web/src/components/TeamChat/TeamChatComposer.tsx`
- Create: `web/src/components/TeamChat/TeamMentionAutocomplete.tsx`
- Create: `web/src/components/TeamChat/TeamChatMobileLayout.tsx`
- Create: `web/src/components/TeamChat/TeamChatRightPanel.tsx`
- Create: `web/src/components/TeamChat/TeamMessageCard.tsx`
- Create: `web/src/components/TeamChat/IncludedContextPreview.tsx`
- Create: `web/src/components/TeamChat/teamColors.ts`
- Test: `web/src/components/TeamChat/TeamMessageCard.test.tsx`
- Test: `web/src/components/TeamChat/TeamChatComposer.test.tsx`
- Test: `web/src/components/TeamChat/TeamChatTimeline.test.tsx`
- Modify: `web/src/routes/team-chats/$teamChatId.tsx`

- [ ] **Step 1: Write Team Chat UI tests**

Create `web/src/components/TeamChat/TeamMessageCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TeamMessageCard } from './TeamMessageCard'

it('renders reply preview and report type', () => {
    render(<TeamMessageCard
        message={{
            id: 'm1', teamChatId: 't1', seq: 1, authorParticipantId: 'p1', text: 'Confirmed fields',
            reportType: 'reply', replyToMessageId: 'm0', replyPreview: { authorName: 'UI', excerpt: 'confirm fields?' }, mentions: [], files: [], createdAt: 1
        }}
        author={{ id: 'p1', teamChatId: 't1', type: 'session', sessionId: 's1', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 1 }}
        onReplyPreviewClick={() => {}}
    />)

    expect(screen.getByText('Backend')).toBeInTheDocument()
    expect(screen.getByText(/Replied to UI/)).toBeInTheDocument()
    expect(screen.getByText('Confirmed fields')).toBeInTheDocument()
})
```

Create `web/src/components/TeamChat/TeamChatComposer.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TeamChatComposer } from './TeamChatComposer'

it('shows context preview and mention suggestions when typing @', () => {
    render(<TeamChatComposer participants={[{ id: 'p1', displayName: 'Backend API', color: '#60a5fa', sessionId: 's1' }]} onSend={() => {}} />)
    fireEvent.change(screen.getByPlaceholderText(/Message the team/i), { target: { value: '@Back' } })
    expect(screen.getByText('Backend API')).toBeInTheDocument()
    expect(screen.getByText('Included context')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit context/i })).toBeInTheDocument()
})
```

Create `web/src/components/TeamChat/TeamChatTimeline.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamChatTimeline } from './TeamChatTimeline'

it('loads around-page when reply target is not mounted', async () => {
    const loadAround = vi.fn().mockResolvedValue(undefined)
    render(<TeamChatTimeline messages={[]} participants={[]} onLoadAround={loadAround} />)
    fireEvent.click(screen.getByRole('button', { name: /load replied message/i }))
    expect(loadAround).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun --cwd web test src/components/TeamChat/TeamMessageCard.test.tsx src/components/TeamChat/TeamChatComposer.test.tsx src/components/TeamChat/TeamChatTimeline.test.tsx
```

Expected: FAIL because component is missing.

- [ ] **Step 3: Implement color helpers**

Create `web/src/components/TeamChat/teamColors.ts`:

```ts
export const TEAM_MEMBER_COLORS = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f472b6', '#22d3ee'] as const

export function getParticipantAccent(color: string | null | undefined): string {
    return color && /^#[0-9a-f]{6}$/i.test(color) ? color : TEAM_MEMBER_COLORS[0]
}
```

- [ ] **Step 4: Implement TeamMessageCard**

Create `web/src/components/TeamChat/TeamMessageCard.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import type { TeamChatMessage, TeamParticipant } from '@/types/api'
import { getParticipantAccent } from './teamColors'

export function TeamMessageCard(props: {
    message: TeamChatMessage
    author: TeamParticipant | null
    onReplyPreviewClick: (messageId: string) => void
}) {
    const accent = getParticipantAccent(props.author?.color)
    const reportLabel = props.message.reportType === 'blocked'
        ? 'Blocked'
        : props.message.reportType === 'done'
            ? 'Done'
            : props.message.reportType === 'reply'
                ? 'Replied'
                : props.message.reportType === 'question'
                    ? 'Needs input'
                    : null

    return (
        <Card className="border border-[var(--app-border)] p-3" style={{ borderLeft: `3px solid ${accent}` }}>
            <div className="mb-1 flex items-center gap-2 text-xs text-[var(--app-hint)]">
                <span className="font-medium text-[var(--app-fg)]">{props.author?.displayName ?? 'Unknown'}</span>
                {reportLabel ? <Badge>{reportLabel}</Badge> : null}
            </div>
            {props.message.replyToMessageId && props.message.replyPreview ? (
                <button
                    type="button"
                    onClick={() => props.onReplyPreviewClick(props.message.replyToMessageId!)}
                    className="mb-2 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-2 py-1 text-left text-xs text-[var(--app-hint)]"
                >
                    Replied to {props.message.replyPreview.authorName}: {props.message.replyPreview.excerpt}
                </button>
            ) : null}
            <div className="whitespace-pre-wrap text-sm text-[var(--app-fg)]">{props.message.text}</div>
        </Card>
    )
}
```

- [ ] **Step 5: Implement layout/timeline/composer**

Create minimal functional components:

```tsx
// TeamChatComposer.tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TeamParticipant } from '@/types/api'
import { IncludedContextPreview } from './IncludedContextPreview'
import { TeamMentionAutocomplete } from './TeamMentionAutocomplete'

export function TeamChatComposer(props: { participants: TeamParticipant[]; onSend: (text: string) => void; disabled?: boolean }) {
    const [text, setText] = useState('')
    const hasMention = /(^|\s)@\S/.test(text)
    return (
        <form onSubmit={(event) => { event.preventDefault(); if (text.trim()) { props.onSend(text); setText('') } }} className="border-t border-[var(--app-border)] p-3">
            {hasMention ? <TeamMentionAutocomplete text={text} participants={props.participants} onPick={(name) => setText(`${text}${name} `)} /> : null}
            {hasMention ? <IncludedContextPreview onEdit={() => {}} onAttachFile={() => {}} onUseDefault={() => {}} /> : null}
            <textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Message the team… use @ to mention a session" className="min-h-20 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm" />
            <Button size="sm" className="mt-2">Send</Button>
        </form>
    )
}
```

`IncludedContextPreview` renders collapsed default items from PRD and visible actions: `Edit context`, `Attach file`, `Use default`. `TeamChatMobileLayout` renders three tabs: `Chat`, `Sessions`, `Context`; do not squeeze the desktop 3-column layout on mobile.

- [ ] **Step 6: Implement reply scroll**

In `TeamChatTimeline.tsx`, keep refs by `message.id`; if missing, call `api.getTeamMessagesAround(teamChatId, messageId)` then render returned page and scroll.

- [ ] **Step 7: Run tests/typecheck**

```bash
bun --cwd web test src/components/TeamChat/TeamMessageCard.test.tsx src/components/TeamChat/TeamChatComposer.test.tsx src/components/TeamChat/TeamChatTimeline.test.tsx
bun --cwd web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/TeamChat web/src/routes/team-chats/\$teamChatId.tsx
git commit -m "feat: add team chat UI"
```

---

## Task 6: Mention parsing, context snapshots, and synthetic session cards

**Files:**
- Modify: `hub/src/sync/teamChatService.ts`
- Create: `hub/src/sync/teamMentions.ts`
- Test: `hub/src/sync/teamMentions.test.ts`
- Create: `hub/src/sync/teamMentionDeliveryService.ts`
- Test: `hub/src/sync/teamMentionDeliveryService.test.ts`
- Modify: `hub/src/sync/messageService.ts`
- Modify: `web/src/chat/types.ts`
- Modify: `web/src/chat/normalize.ts`
- Modify: `web/src/chat/reducer.ts`, `web/src/chat/reducerTimeline.ts`, `web/src/chat/reconcile.ts`
- Modify: `web/src/lib/assistant-runtime.ts`
- Modify: `web/src/components/AssistantChat/HappyThread.tsx`
- Create: `web/src/components/AssistantChat/messages/TeamMentionMessage.tsx`
- Test: `web/src/chat/normalize.test.ts`, `web/src/chat/reducerTimeline.test.ts`, `web/src/components/AssistantChat/HappyThread.test.tsx`

- [ ] **Step 1: Write mention parser tests**

Create `hub/src/sync/teamMentions.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { parseTeamMentions } from './teamMentions'

it('matches display names with spaces', () => {
    const participants = [
        { id: 'p1', sessionId: 's1', displayName: 'Backend API' },
        { id: 'p2', sessionId: 's2', displayName: 'Team Chat UI' }
    ]
    expect(parseTeamMentions('@Backend API confirm with @Team Chat UI', participants)).toEqual([
        { participantId: 'p1', sessionId: 's1', displayName: 'Backend API' },
        { participantId: 'p2', sessionId: 's2', displayName: 'Team Chat UI' }
    ])
})

it('uses longest match, boundaries, dedupe, and text order', () => {
    const participants = [
        { id: 'short', sessionId: 's1', displayName: 'Backend' },
        { id: 'long', sessionId: 's2', displayName: 'Backend API' },
        { id: 'tests', sessionId: 's3', displayName: 'Tests' },
        { id: 'user', sessionId: null, displayName: 'Human' }
    ]

    expect(parseTeamMentions('@Backend API, then @Tests. @Backend API2 no match. @Human ignored.', participants)).toEqual([
        { participantId: 'long', sessionId: 's2', displayName: 'Backend API' },
        { participantId: 'tests', sessionId: 's3', displayName: 'Tests' }
    ])
})
```

- [ ] **Step 2: Implement parser**

Create `hub/src/sync/teamMentions.ts`:

```ts
export type MentionableParticipant = { id: string; sessionId: string | null; displayName: string; archivedAt?: number | null }
export type ParsedTeamMention = { participantId: string; sessionId: string; displayName: string }
type ParsedTeamMentionWithIndex = ParsedTeamMention & { index: number }

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
    return a.start < b.end && b.start < a.end
}

export function parseTeamMentions(text: string, participants: MentionableParticipant[]): ParsedTeamMention[] {
    const ranges: Array<{ start: number; end: number }> = []
    const seenParticipants = new Set<string>()
    const matches: ParsedTeamMentionWithIndex[] = []
    const candidates = participants
        .filter((participant): participant is MentionableParticipant & { sessionId: string } => Boolean(participant.sessionId) && !participant.archivedAt)
        .sort((a, b) => b.displayName.length - a.displayName.length)

    for (const participant of candidates) {
        const pattern = new RegExp(`(^|\\s)@${escapeRegex(participant.displayName)}(?=$|[\\s,.;:!?\\)])`, 'gi')
        for (const match of text.matchAll(pattern)) {
            if (seenParticipants.has(participant.id)) continue
            const prefix = match[1] ?? ''
            const start = match.index! + prefix.length
            const end = start + participant.displayName.length + 1
            if (ranges.some((range) => overlaps(range, { start, end }))) continue
            ranges.push({ start, end })
            seenParticipants.add(participant.id)
            matches.push({ participantId: participant.id, sessionId: participant.sessionId, displayName: participant.displayName, index: start })
        }
    }

    return matches.sort((a, b) => a.index - b.index).map(({ index: _index, ...mention }) => mention)
}
```

- [ ] **Step 3: Create mention requests in service**

In `TeamChatService.postMessage`:

1. load participants
2. parse mentions
3. build context snapshot
4. save message with mentions
5. create one `team_mention_requests` row per target
6. create synthetic session message:

```ts
const envelope = [
    '[HAPI_TEAM_MENTION]',
    `requestId=${request.id}`,
    `teamChatId=${request.teamChatId}`,
    `sourceMessageId=${request.sourceMessageId}`,
    '',
    `From Team Chat: ${input.text}`,
    '',
    'Context:',
    JSON.stringify(contextSnapshot)
].join('\n')

const syntheticContent = {
    role: 'user' as const,
    content: {
        type: 'text' as const,
        text: envelope
    },
    meta: {
        sentFrom: 'team-chat' as const,
        teamMentionRequestId: request.id,
        teamChatId: request.teamChatId,
        sourceMessageId: request.sourceMessageId
    }
}
```

Implement `TeamMentionDeliveryService` instead of writing session rows inline in `TeamChatService`:

```ts
export class TeamMentionDeliveryService {
    constructor(private readonly messageService: MessageService, private readonly store: Store, private readonly publisher: Pick<EventPublisher, 'emit'>) {}

    async deliver(input: { namespace: string; request: StoredTeamMentionRequest; envelope: string }): Promise<void> {
        await this.messageService.sendTeamMentionMessage(input.request.targetSessionId, {
            text: input.envelope,
            meta: {
                sentFrom: 'team-chat',
                teamMentionRequestId: input.request.id,
                teamChatId: input.request.teamChatId,
                sourceMessageId: input.request.sourceMessageId
            }
        })
        const deliveredAt = Date.now()
        this.store.teamChats.updateMentionStatus({ namespace: input.namespace, requestId: input.request.id, status: 'delivered', deliveredAt })
        this.publisher.emit({
            type: 'team-mention-updated',
            namespace: input.namespace,
            teamChatId: input.request.teamChatId,
            requestId: input.request.id,
            sessionId: input.request.targetSessionId,
            targetSessionId: input.request.targetSessionId
        })
    }
}
```

Add `MessageService.sendTeamMentionMessage()` by copying the current `sendMessage()` flow, but allow `meta.sentFrom: 'team-chat'` and include `teamMentionRequestId`, `teamChatId`, `sourceMessageId`. It must still emit the existing CLI `update` and `message-received` event so active Session Chat windows update.

- [ ] **Step 4: Web normalize synthetic message**

In `web/src/chat/types.ts`:

```ts
export type TeamMentionBlock = {
    kind: 'team-mention'
    id: string
    requestId: string
    teamChatId: string
    sourceMessageId: string
    text: string
    status: 'pending' | 'delivered' | 'seen' | 'processing' | 'responded' | 'no_action' | 'superseded' | 'failed'
}
```

Update normalize/reducer/reducerTimeline/reconcile to produce this block when `message.meta.sentFrom === 'team-chat'`; do not depend on custom `content.type === 'team-mention'` because CLI delivery uses `content.type: 'text'`.

- [ ] **Step 5: Render session-side Team mention card**

Create `TeamMentionMessage.tsx` with buttons:

```tsx
export function TeamMentionMessage(props: { block: TeamMentionBlock; onOpenTeamChat: () => void; onReplyToTeam: () => void; onPostUpdate: () => void; onViewOriginal: () => void; onNoAction: () => void }) {
    return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3 text-sm">
            <div className="mb-2 font-medium text-[var(--app-fg)]">Team mention</div>
            <div className="whitespace-pre-wrap text-[var(--app-fg)]">{props.block.text}</div>
            <div className="mt-2 flex gap-2">
                <button onClick={props.onReplyToTeam}>Reply to Team</button>
                <button onClick={props.onPostUpdate}>Post update</button>
                <button onClick={props.onViewOriginal}>View original</button>
                <button onClick={props.onNoAction}>No action needed</button>
            </div>
        </div>
    )
}
```

- [ ] **Step 6: Status update endpoints**

Add route:

```txt
PATCH /api/sessions/:id/team-mentions/:requestId
```

Body:

```ts
{ status: 'seen' | 'processing' | 'no_action' }
```

- [ ] **Step 7: Run tests**

```bash
bun --cwd hub test src/sync/teamMentions.test.ts src/sync/teamMentionDeliveryService.test.ts src/sync/teamChatService.test.ts
bun --cwd web test src/chat/normalize.test.ts src/chat/reducerTimeline.test.ts src/components/AssistantChat/HappyThread.test.tsx
bun --cwd web typecheck
bun typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add hub/src/sync/teamMentions.ts hub/src/sync/teamMentions.test.ts hub/src/sync/teamMentionDeliveryService.ts hub/src/sync/teamMentionDeliveryService.test.ts hub/src/sync/teamChatService.ts hub/src/sync/messageService.ts hub/src/web/routes/teamChats.ts web/src/chat/types.ts web/src/chat/normalize.ts web/src/chat/reducer.ts web/src/chat/reducerTimeline.ts web/src/chat/reconcile.ts web/src/lib/assistant-runtime.ts web/src/components/AssistantChat/HappyThread.tsx web/src/components/AssistantChat/messages/TeamMentionMessage.tsx
git commit -m "feat: route team mentions to sessions"
```

---

## Task 7: ReportToTeam and Needs attention

**Files:**
- Modify: `hub/src/sync/teamChatService.ts`
- Modify: `hub/src/web/routes/teamChats.ts`
- Create: `hub/src/sync/teamReports.test.ts`
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.tsx`
- Modify: `web/src/components/TeamChat/TeamMessageCard.tsx`

- [ ] **Step 1: Write report tests**

Create `hub/src/sync/teamReports.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import { Store } from '../store'
import { TeamChatService } from './teamChatService'

it('ReportToTeam creates structured report and marks request responded', () => {
    const store = new Store(':memory:')
    const service = new TeamChatService(store, { emit: mock(() => undefined) })
    const chat = service.createTeamChat({ namespace: 'default', name: 'Team' })
    const backend = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: 'session-backend', displayName: 'Backend', role: 'backend', color: '#60a5fa' })
    const tests = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: 'session-tests', displayName: 'Tests', role: 'tests', color: '#fbbf24' })
    const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    const source = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend blocked?' }).message
    const request = store.teamChats.addMentionRequest({ namespace: 'default', teamChatId: chat.id, sourceMessageId: source.id, targetSessionId: 'session-backend', status: 'processing', contextSnapshot: { originalText: source.text, sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] }, attachedFiles: [], recentUpdates: [] }, hopDepth: 0 })

    const report = service.reportToTeam({ namespace: 'default', teamChatId: chat.id, authorParticipantId: backend.id, type: 'blocked', summary: 'Blocked on schema. @Tests please verify route behavior', replyToRequestId: request.id })

    expect(report.message.reportType).toBe('blocked')
    expect(store.teamChats.getMentionRequest('default', request.id)?.status).toBe('responded')
    expect(store.teamChats.listPendingMentionRequests('default', tests.sessionId!).map(item => item.sourceMessageId)).toEqual([report.message.id])
})

it('no-action marks mention without posting a report', () => {
    const store = new Store(':memory:')
    const service = new TeamChatService(store, { emit: mock(() => undefined) })
    const chat = service.createTeamChat({ namespace: 'default', name: 'Team' })
    const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
    const source = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend FYI' }).message
    const request = store.teamChats.addMentionRequest({ namespace: 'default', teamChatId: chat.id, sourceMessageId: source.id, targetSessionId: 'session-backend', status: 'seen', contextSnapshot: { originalText: source.text, sharedContext: { decisions: [], openQuestions: [], relevantFiles: [] }, attachedFiles: [], recentUpdates: [] }, hopDepth: 0 })

    service.markMentionNoAction({ namespace: 'default', sessionId: 'session-backend', requestId: request.id })

    expect(store.teamChats.getMentionRequest('default', request.id)?.status).toBe('no_action')
    expect(store.teamChats.getMessages('default', chat.id, 10).map(message => message.reportType)).not.toContain('reply')
})
```

- [ ] **Step 2: Add service method**

In `TeamChatService`:

```ts
reportToTeam(input: {
    namespace: string
    teamChatId: string
    authorParticipantId: string
    type: 'reply' | 'progress' | 'done' | 'blocked' | 'question' | 'handoff'
    summary: string
    details?: string
    replyToMessageId?: string | null
    replyToRequestId?: string | null
    mentions?: string[]
    files?: string[]
}) {
    const text = input.details ? `${input.summary}\n\n${input.details}` : input.summary
    if (/^(ok|okay|noted|thanks|done)$/i.test(text.trim()) && !input.replyToRequestId) throw new Error('TEAM_REPORT_TOO_LOW_SIGNAL')
    const message = this.store.teamChats.addMessage({
        namespace: input.namespace,
        teamChatId: input.teamChatId,
        authorParticipantId: input.authorParticipantId,
        text,
        reportType: input.type,
        replyToMessageId: input.replyToMessageId ?? null,
        replyPreview: input.replyToMessageId ? this.buildReplyPreview(input.namespace, input.replyToMessageId) : null,
        mentions: [],
        files: input.files ?? []
    })
    const parentRequest = input.replyToRequestId ? this.requireTeamMentionRequest(input.namespace, input.replyToRequestId) : null
    const hopDepth = parentRequest ? parentRequest.hopDepth + 1 : 0
    if (hopDepth > 3) throw new Error('TEAM_MENTION_HOP_LIMIT')

    const participants = this.store.teamChats.listParticipants(input.namespace, input.teamChatId)
    const mentions = parseTeamMentions(text, participants)
    for (const mention of mentions) {
        this.store.teamChats.addMentionRequest({
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            sourceMessageId: message.id,
            targetSessionId: mention.sessionId,
            contextSnapshot: this.buildMentionContextSnapshot(input.namespace, input.teamChatId, message.id, text),
            hopDepth,
            parentRequestId: input.replyToRequestId ?? null
        })
    }

    if (input.replyToRequestId) {
        this.store.teamChats.updateMentionStatus({ namespace: input.namespace, requestId: input.replyToRequestId, status: 'responded', resolvedAt: Date.now() })
    }
    this.publisher.emit({ type: 'team-message-created', namespace: input.namespace, teamChatId: input.teamChatId, messageId: message.id })
    return { message }
}

markMentionNoAction(input: { namespace: string; sessionId: string; requestId: string }) {
    this.requireTeamMentionRequest(input.namespace, input.requestId, input.sessionId)
    return this.store.teamChats.updateMentionStatus({ namespace: input.namespace, requestId: input.requestId, status: 'no_action', resolvedAt: Date.now() })
}
```

- [ ] **Step 3: Add API route**

In `teamChats.ts`:

```txt
POST /team-chats/:id/reports
```

Body mirrors `ReportToTeamInput`. Validate that `authorParticipantId` belongs to the chat and namespace.

- [ ] **Step 4: Render structured cards**

In `TeamMessageCard`, map `reportType` to style/label:

```ts
const tone = {
    done: 'border-emerald-500',
    blocked: 'border-red-500',
    question: 'border-amber-500',
    progress: 'border-blue-500',
    reply: 'border-[var(--app-border)]',
    handoff: 'border-purple-500'
}[props.message.reportType ?? 'reply']
```

- [ ] **Step 5: Needs attention derivation**

In `TeamChatRightPanel`, compute:

```ts
type AttentionItem =
    | { kind: 'blocked' | 'question'; message: TeamChatMessage; createdAt: number }
    | { kind: 'failed-delivery' | 'needs-user-input'; request: TeamMentionRequest; createdAt: number }

const needsAttention: AttentionItem[] = [
    ...messages
        .filter((message) => message.reportType === 'blocked' || message.reportType === 'question')
        .map((message) => ({ kind: message.reportType as 'blocked' | 'question', message, createdAt: message.createdAt })),
    ...mentionRequests
        .filter((request) => request.status === 'failed' || request.status === 'pending')
        .map((request) => ({ kind: request.status === 'failed' ? 'failed-delivery' : 'needs-user-input', request, createdAt: request.createdAt } as AttentionItem))
].sort((a, b) => b.createdAt - a.createdAt)
```

Render labels exactly as PRD: `Needs attention`, `Blocked`, `Question`, `Failed delivery`, `Waiting for response`.

- [ ] **Step 6: Run tests/typecheck**

```bash
bun --cwd hub test src/sync/teamReports.test.ts
bun --cwd web typecheck
bun typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add hub/src/sync/teamChatService.ts hub/src/web/routes/teamChats.ts hub/src/sync/teamReports.test.ts web/src/components/TeamChat/TeamChatRightPanel.tsx web/src/components/TeamChat/TeamMessageCard.tsx
git commit -m "feat: add team chat reports"
```

---

## Task 8: Realtime invalidation and navigation integration

**Files:**
- Modify: `hub/src/sse/sseManager.ts`
- Modify: `web/src/hooks/useSSE.ts`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/Dashboard/index.tsx`
- Modify: `web/src/components/SessionHeader.tsx`
- Modify: `web/src/components/editor/EditorHeader.tsx`
- Test: `hub/src/sse/sseManager.test.ts`
- Test: `web/src/hooks/useSSE.test.tsx` or nearest existing SSE/App event tests
- Test: `web/src/components/SessionHeader.test.tsx`, `web/src/components/SessionChat`/router regression tests if present
- Test: `web/src/components/editor/EditorHeader.test.tsx`, `web/src/components/editor/EditorLayout.test.tsx`, dashboard nav test

- [ ] **Step 1: Fix SSE delivery and invalidation for Team Chat events**

In `hub/src/sse/sseManager.ts`, ensure session-scoped Team mention events reach the target session subscriber:

```ts
if (event.type === 'team-mention-updated') {
    return connection.all || connection.sessionId === event.sessionId || connection.sessionId === event.targetSessionId
}
```

In `web/src/hooks/useSSE.ts`, add query invalidation for Team Chat event types:

```ts
if (event.type === 'team-chat-updated') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teamChats })
    void queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(event.teamChatId) })
}
if (event.type === 'team-message-created') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teamMessages(event.teamChatId) })
}
if (event.type === 'team-mention-updated') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teamMessages(event.teamChatId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.sessionTeamMentions(event.targetSessionId) })
}
if (event.type === 'team-participant-updated') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.teamParticipants(event.teamChatId) })
    void queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(event.teamChatId) })
}
```

In `web/src/App.tsx`, update the existing `handleSseEvent` session refresh path because `useSSE` does not own `api`:

```ts
if (event.type === 'team-mention-updated' && api && event.sessionId === activeChatSessionId) {
    clearMessageWindow(event.sessionId)
    void fetchLatestMessages(api, event.sessionId, { mergeStrategy: 'visible' })
}
```


- [ ] **Step 2: Add dashboard Team Chat entry and quick-create flow**

In `Dashboard/index.tsx` topbar actions add a Team Chat menu, not only a plain link:

```tsx
<button type="button" className="db__topbar-btn" title="Team Chat" onClick={() => void navigate({ to: '/team-chats' })}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></svg>
    <span className="db__label">Team Chat</span>
</button>
```

Add `useTeamChatActions.createFromSessions(sessions)` so selected sessions/project can create a Team Chat with those sessions already added. Tests: button navigates to list, selected sessions call create + add participants + navigate to detail.

- [ ] **Step 3: Add SessionHeader action**

In `SessionHeader.tsx`, add three menu actions:

```txt
Open Team Chat
Add to existing Team Chat
Create Team Chat with this session
```

Behavior:

- `Open Team Chat`: if current session is already a participant, open the most recently updated active Team Chat for that session.
- `Add to existing Team Chat`: open a small picker of active Team Chats, then call `addTeamParticipant`.
- `Create Team Chat with this session`: call `createTeamChat({ name: getSessionTitle(session), projectPath: session.metadata?.path })`, add current session as participant, navigate to `/team-chats/$teamChatId`.

Test all three labels and the create-with-session happy path. Also keep existing Agent Mode tests passing: ordinary session send/retry, action menu open/close, file/terminal links, and pinned dashboard behavior.

- [ ] **Step 4: Add EditorHeader action**

In `EditorHeader.tsx`, add a Team Chat action using existing button styling/tokens:

```tsx
<Button
    type="button"
    variant="outline"
    size="sm"
    onClick={() => navigate({ to: '/team-chats', search: { project: props.projectPath ?? undefined, machine: props.machineId ?? undefined } as never })}
>
    Team Chat
</Button>
```

Update `/team-chats` route search validation to accept `project` and `machine`; when present, prefill create/open flow for that project + machine. Keep the existing `← Agent Mode` button behavior unchanged and covered by `EditorHeader.test.tsx` / `EditorLayout.test.tsx`.

- [ ] **Step 5: Run tests/typecheck**

```bash
bun --cwd hub test src/sse/sseManager.test.ts
bun --cwd web test src/hooks/useSSE.test.tsx src/components/SessionHeader.test.tsx src/components/editor/EditorHeader.test.tsx src/components/editor/EditorLayout.test.tsx
bun --cwd web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add hub/src/sse/sseManager.ts hub/src/sse/sseManager.test.ts web/src/hooks/useSSE.ts web/src/App.tsx web/src/components/Dashboard/index.tsx web/src/components/SessionHeader.tsx web/src/components/editor/EditorHeader.tsx
git commit -m "feat: wire team chat navigation"
```

---

## Task 9: Full verification and docs update

**Files:**
- Modify: `README.md` or `docs/guide/how-it-works.md` only if user-facing docs need Team Chat note.
- Existing tests only if failures reveal necessary updates.

- [ ] **Step 1: Run full verification**

```bash
bun test shared/src/teamChat.test.ts
bun typecheck
bun run test
bun --cwd web test
```

Expected: all pass.

- [ ] **Step 2: Manual smoke checklist**

Run hub/web locally:

```bash
bun run dev
```

Manual checks:

- Create Team Chat.
- Add two sessions.
- Post message without mention; appears in Team Chat only.
- Post `@Session Name hello`; target session receives Team mention card.
- Mark no-action; Team Chat message shows no-action state.
- Post ReportToTeam-style update; Team Chat shows structured report.
- Reply to older message; click preview scrolls to original and highlights it.
- Dark mode contrast: member colors readable; status badges distinguishable.
- Mobile: Team Chat shows Chat / Sessions / Context tabs; composer stays above keyboard.
- Multiple simultaneous mentions to the same session show compact pending queue older-first.
- Agent Mode regression: open `/sessions`, send a normal message, retry failed message if available, open Files/Terminal; behavior unchanged.
- Editor Mode regression: open `/editor`, browse project, open/save file, open terminal, click `← Agent Mode`; behavior unchanged.
- Refresh browser; state persists.

- [ ] **Step 3: Update docs if feature is exposed**

Add concise section to `docs/guide/how-it-works.md`:

```md
### Team Chat

Team Chat lets you coordinate multiple local agent sessions in one shared chat. Mention a session with `@Session Name`; HAPI routes a Team mention card into that session while preserving a visible seen/replied/no-action state in Team Chat.
```

- [ ] **Step 4: Final commit**

```bash
git add README.md docs/guide/how-it-works.md
git commit -m "docs: document team chat"
```

Skip commit if no docs changed.

---

## Spec coverage checklist

- Team Chat creation/list/detail: Tasks 2-5.
- Participants + roles/colors: Tasks 2, 4, 5.
- Team timeline/composer: Task 5.
- Included context preview: Tasks 5-6.
- Mentions routed to sessions: Task 6.
- Session-side cards and compact queue: Task 6.
- Delivered/seen/processing/replied/no-action: Tasks 1, 2, 6, 8.
- Inline reply + scroll: Tasks 3, 5.
- ReportToTeam/Post update: Task 7.
- Needs attention: Task 7.
- Top-level navigation: Task 8.
- Realtime updates: Tasks 3, 8.
- Guardrails/hop depth/context snapshots: Tasks 1, 6, 7.

## Known follow-ups after MVP

- Provider-native `ReportToTeam` tool injection for Claude/Codex/Gemini/OpenCode.
- Auto-processing of queued mentions by idle remote sessions.
- Rich attach-diff/file context from editor/git views.
- Auto-summary suggestions for Shared context.
- Offline caching beyond normal browser reload persistence.
