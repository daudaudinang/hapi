# Team Chat Broadcast Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Team Chat message is delivered to every session member: mentioned sessions are required responders, non-mentioned sessions receive optional context and may reply or mark no-action/seen.

**Architecture:** Keep the existing `team_mention_requests` table as the generic Team delivery ledger for MVP. Add delivery semantics (`deliveryKind`, `requiresResponse`) into `contextSnapshot` and message `meta` instead of adding a DB migration. Centralize request creation in `TeamChatService` so both user messages and agent reports use the same fan-out rules.

**Tech Stack:** Bun, TypeScript strict, SQLite store, Hono routes, Socket.IO CLI session messages, React assistant chat UI.

## Critical Implementation Decisions

1. **Optional broadcast terminal semantics:** optional broadcasts still create delivery requests, but “seen and no reply needed” must become backend terminal status `no_action`. UI can label it as “seen, no reply”, but requests must not remain active forever in `delivered`/`seen`.
2. **Context caps differ by intent:** required mentions get richer context; optional broadcasts get compact context to avoid token blast when a Team Chat has many session members.
3. **Reply mapping guard:** plain text replies auto-post to the latest Team delivery request in that session. Agents handling a specific older request should use `report_to_team(replyToRequestId=...)`; tests must cover multiple queued requests.
4. **No forced interruption:** sessions that are thinking, inactive, or user-controlled still receive a card-only Team item. Deferred invocation after ready is out of MVP scope.

---

## File Structure

- Modify `hub/src/sync/teamChatService.ts`
  - Add helper types for Team delivery intent.
  - Replace mention-only delivery loops with one fan-out helper.
  - Build required vs optional envelopes.
  - Exclude the source agent from agent-originated broadcasts.
- Modify `hub/src/sync/teamMentionDeliveryService.ts`
  - Add optional delivery metadata to `deliver()` input.
  - Persist `deliveryKind` and `requiresResponse` into session message `meta`.
- Modify `hub/src/sync/teamChatService.test.ts`
  - Tests for user message fan-out: no mention, with mention, no duplicate request.
- Modify `hub/src/sync/teamReports.test.ts`
  - Tests for agent report fan-out: optional to other agents, skip source agent, required target when report mentions another member.
- Modify `hub/src/sync/teamMentionDeliveryService.test.ts`
  - Tests that delivery metadata is stored in session message meta.
- Modify `web/src/chat/types.ts`
  - Add `deliveryKind` and `requiresResponse` to `TeamMentionBlock`.
- Modify `web/src/chat/reducerTimeline.ts`
  - Read delivery metadata from message `meta`.
- Modify `web/src/chat/reducerTimeline.test.ts`
  - Tests for optional broadcast card parsing.
- Modify `web/src/components/AssistantChat/messages/TeamMentionMessage.tsx`
  - Show “Team mention” for required and “Team update” for optional broadcast.
- Modify `web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx`
  - Tests for new labels and seen behavior.
- Modify `web/src/components/AssistantChat/TeamMentionQueueBar.tsx`
  - Rename generic queue text from “Team mentions waiting” to “Team items waiting” so optional broadcasts are not presented as mandatory mentions.

---

## Task 1: Hub tests for user Team Chat fan-out

**Files:**
- Modify: `hub/src/sync/teamChatService.test.ts`

- [ ] **Step 1: Write failing test: user message without mention broadcasts optional to all session members**

Append inside `describe('TeamChatService', () => { ... })`:

```ts
    it('broadcasts unmentioned user Team messages as optional context to every session member', () => {
        const store = new Store(':memory:')
        const publisher = createPublisher()
        const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
        const testsSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
        const delivery = { deliver: mock(() => undefined) }
        const service = new TeamChatService(store, publisher, delivery, () => ({
            active: true,
            thinking: false,
            agentState: { controlledByUser: false, requests: {}, completedRequests: {} }
        } as never))
        const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat' })
        const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
        service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
        service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testsSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })

        const result = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'Priority changed: backend first' })

        const backendRequest = store.teamChats.listPendingMentionRequests('default', backendSession.id)[0]
        const testsRequest = store.teamChats.listPendingMentionRequests('default', testsSession.id)[0]
        expect(backendRequest.sourceMessageId).toBe(result.message.id)
        expect(testsRequest.sourceMessageId).toBe(result.message.id)
        expect((backendRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).deliveryKind).toBe('broadcast')
        expect((backendRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).requiresResponse).toBe(false)
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).deliveryKind).toBe('broadcast')
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).requiresResponse).toBe(false)
        expect(delivery.deliver).toHaveBeenCalledTimes(2)
        expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
            request: expect.objectContaining({ targetSessionId: backendSession.id }),
            deliveryKind: 'broadcast',
            requiresResponse: false,
            envelope: expect.stringContaining('This is an optional Team Chat broadcast')
        }))
    })
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
bun test hub/src/sync/teamChatService.test.ts -t 'broadcasts unmentioned user Team messages'
```

Expected: FAIL because no requests are created for unmentioned messages.

- [ ] **Step 3: Write failing test: mentioned user message broadcasts to all but only mentioned target is required**

Append:

```ts
    it('broadcasts mentioned user Team messages to all sessions and marks mentioned targets required', () => {
        const store = new Store(':memory:')
        const publisher = createPublisher()
        const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
        const testsSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
        const delivery = { deliver: mock(() => undefined) }
        const service = new TeamChatService(store, publisher, delivery, () => ({
            active: true,
            thinking: false,
            agentState: { controlledByUser: false, requests: {}, completedRequests: {} }
        } as never))
        const chat = service.createTeamChat({ namespace: 'default', name: 'Team Chat' })
        const user = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'user', displayName: 'You', role: 'general', color: '#34d399' })
        const backend = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
        service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testsSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })

        const result = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend check API' })

        expect(result.message.mentions).toEqual([{ participantId: backend.id, sessionId: backendSession.id }])
        const backendRequest = store.teamChats.listPendingMentionRequests('default', backendSession.id)[0]
        const testsRequest = store.teamChats.listPendingMentionRequests('default', testsSession.id)[0]
        expect((backendRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).deliveryKind).toBe('mention')
        expect((backendRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).requiresResponse).toBe(true)
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).deliveryKind).toBe('broadcast')
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).requiresResponse).toBe(false)
        expect(delivery.deliver).toHaveBeenCalledTimes(2)
        expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
            request: expect.objectContaining({ targetSessionId: backendSession.id }),
            deliveryKind: 'mention',
            requiresResponse: true,
            envelope: expect.stringContaining('You were directly mentioned and must respond')
        }))
        expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
            request: expect.objectContaining({ targetSessionId: testsSession.id }),
            deliveryKind: 'broadcast',
            requiresResponse: false,
            envelope: expect.stringContaining('Only reply if you can add useful information')
        }))
    })
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```bash
bun test hub/src/sync/teamChatService.test.ts -t 'broadcasts mentioned user Team messages'
```

Expected: FAIL because only mentioned session gets a request.

---

## Task 2: Implement centralized Team delivery fan-out in `TeamChatService`

**Files:**
- Modify: `hub/src/sync/teamChatService.ts`
- Modify: `hub/src/sync/teamMentionDeliveryService.ts`

- [ ] **Step 1: Add helper types near the top of `teamChatService.ts`**

```ts
type TeamDeliveryKind = 'mention' | 'broadcast'

type TeamDeliveryTarget = {
    participant: StoredTeamParticipant
    sessionId: string
    deliveryKind: TeamDeliveryKind
    requiresResponse: boolean
}
```

- [ ] **Step 2: Replace the mention-only loop in `postMessage()` with fan-out call**

After `const message = this.store.teamChats.addMessage(...)`, replace the existing `for (const mention of parsedMentions) { ... }` block with:

```ts
        this.deliverTeamMessageToSessions({
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            sourceMessageId: message.id,
            text: input.text,
            mentionedSessionIds: new Set(parsedMentions.map((mention) => mention.sessionId)),
            excludedSessionIds: new Set(),
            hopDepth: 0,
            parentRequestId: null
        })
```

- [ ] **Step 3: Add helper methods before `buildMentionContextSnapshot()`**

```ts
    private deliverTeamMessageToSessions(input: {
        namespace: string
        teamChatId: string
        sourceMessageId: string
        text: string
        mentionedSessionIds: Set<string>
        excludedSessionIds: Set<string>
        hopDepth: number
        parentRequestId: string | null
    }): void {
        const targets = this.buildDeliveryTargets(input.namespace, input.teamChatId, input.mentionedSessionIds, input.excludedSessionIds)
        for (const target of targets) {
            const contextSnapshot = this.buildMentionContextSnapshot(
                input.namespace,
                input.teamChatId,
                input.sourceMessageId,
                input.text,
                target.deliveryKind,
                target.requiresResponse
            )
            const request = this.store.teamChats.addMentionRequest({
                namespace: input.namespace,
                teamChatId: input.teamChatId,
                sourceMessageId: input.sourceMessageId,
                targetSessionId: target.sessionId,
                contextSnapshot,
                hopDepth: input.hopDepth,
                parentRequestId: input.parentRequestId
            })
            const session = this.resolveSession?.(input.namespace, target.sessionId)
            if (this.mentionDelivery && session) {
                this.mentionDelivery.deliver({
                    namespace: input.namespace,
                    request,
                    envelope: this.buildMentionEnvelope(request, input.text, contextSnapshot, target.deliveryKind, target.requiresResponse),
                    mode: getMentionDeliveryMode(session),
                    deliveryKind: target.deliveryKind,
                    requiresResponse: target.requiresResponse
                })
            }
        }
    }

    private buildDeliveryTargets(
        namespace: string,
        teamChatId: string,
        mentionedSessionIds: Set<string>,
        excludedSessionIds: Set<string>
    ): TeamDeliveryTarget[] {
        return this.store.teamChats.listParticipants(namespace, teamChatId)
            .filter((participant) => participant.type === 'session' && !participant.archivedAt && participant.sessionId)
            .filter((participant) => !excludedSessionIds.has(participant.sessionId!))
            .map((participant) => {
                const sessionId = participant.sessionId!
                const requiresResponse = mentionedSessionIds.has(sessionId)
                return {
                    participant,
                    sessionId,
                    deliveryKind: requiresResponse ? 'mention' : 'broadcast',
                    requiresResponse
                }
            })
    }
```

- [ ] **Step 4: Change `buildMentionContextSnapshot()` signature and returned payload**

Change signature:

```ts
    private buildMentionContextSnapshot(
        namespace: string,
        teamChatId: string,
        messageId: string,
        originalText: string,
        deliveryKind: TeamDeliveryKind = 'mention',
        requiresResponse = true
    ) {
```

Add context caps before loading recent messages:

```ts
        const recentLimit = requiresResponse ? 16 : 10
        const messageTextLimit = requiresResponse ? 1_200 : 600
        const excerptLimit = requiresResponse ? 240 : 160
```

Change the recent message query and slices:

```ts
        const recentUpdates = this.store.teamChats.getMessages(namespace, teamChatId, recentLimit)
            .filter((message) => message.id !== messageId)
            .map((message) => {
                const author = this.store.teamChats.getParticipant(namespace, message.authorParticipantId)
                return {
                    messageId: message.id,
                    authorName: author?.displayName ?? 'Unknown',
                    reportType: message.reportType,
                    text: message.text.slice(0, messageTextLimit),
                    excerpt: message.text.slice(0, excerptLimit)
                }
            })
```

Add fields to returned object:

```ts
        return {
            originalText,
            deliveryKind,
            requiresResponse,
            contextProfile: requiresResponse ? 'required' : 'compact',
            sharedContext,
            participants,
            recentUpdates,
            recentTeamMessages: recentUpdates,
            attachedFiles: []
        }
```

- [ ] **Step 5: Change `buildMentionEnvelope()` signature and behavior copy**

Change signature:

```ts
    private buildMentionEnvelope(
        request: StoredTeamMentionRequest,
        text: string,
        contextSnapshot: unknown,
        deliveryKind: TeamDeliveryKind = 'mention',
        requiresResponse = true
    ): string {
```

Replace the `Reply behavior:` bullet block with:

```ts
            'Reply behavior:',
            requiresResponse
                ? '- You were directly mentioned and must respond to the Team Chat request.'
                : '- This is an optional Team Chat broadcast for shared context.',
            '- Use the context below to understand the Team Chat state.',
            requiresResponse
                ? '- Send a normal text answer; HAPI will post it back to the Team Chat automatically.'
                : '- Only reply if you can add useful information. If no reply is needed, call mark_team_mention_no_action instead of sending text.',
            `- For structured updates, call hapi_session.report_to_team with teamChatId=${request.teamChatId} and replyToRequestId=${request.id}.`,
            requiresResponse
                ? `- If you genuinely cannot help, call hapi_session.mark_team_mention_no_action with requestId=${request.id}.`
                : `- If no action is needed, call hapi_session.mark_team_mention_no_action with requestId=${request.id}; the Team Chat will only show seen/no-action.`,
            `deliveryKind=${deliveryKind}`,
            `requiresResponse=${requiresResponse ? 'true' : 'false'}`,
```

- [ ] **Step 6: Extend `TeamMentionDeliveryService.deliver()` input type and meta**

In `hub/src/sync/teamMentionDeliveryService.ts`, change method signature:

```ts
    deliver(input: {
        namespace: string
        request: StoredTeamMentionRequest
        envelope: string
        mode: TeamMentionDeliveryMode
        deliveryKind?: 'mention' | 'broadcast'
        requiresResponse?: boolean
    }): void {
```

Add meta fields:

```ts
            meta: {
                sentFrom: 'team-chat',
                teamMentionRequestId: input.request.id,
                teamChatId: input.request.teamChatId,
                sourceMessageId: input.request.sourceMessageId,
                deliveryKind: input.deliveryKind ?? 'mention',
                requiresResponse: input.requiresResponse ?? true
            }
```

- [ ] **Step 7: Run tests and verify Task 1 passes**

Run:

```bash
bun test hub/src/sync/teamChatService.test.ts
```

Expected: all `TeamChatService` tests pass.

- [ ] **Step 8: Commit Task 1-2**

```bash
git add hub/src/sync/teamChatService.ts hub/src/sync/teamMentionDeliveryService.ts hub/src/sync/teamChatService.test.ts
git commit -m "feat: broadcast user team messages to sessions"
```

---

## Task 3: Agent report fan-out to other session members

**Files:**
- Modify: `hub/src/sync/teamReports.test.ts`
- Modify: `hub/src/sync/teamChatService.ts`

- [ ] **Step 1: Write failing test: source agent does not receive its own report, other session gets optional broadcast**

Append inside `describe('Team Chat reports', () => { ... })`:

```ts
    it('broadcasts agent reports as optional context to other sessions without echoing to source agent', () => {
        const store = new Store(':memory:')
        const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
        const testsSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
        const delivery = { deliver: mock(() => undefined) }
        const service = new TeamChatService(store, { emit: mock(() => undefined) }, delivery, () => ({
            active: true,
            thinking: false,
            agentState: { controlledByUser: false, requests: {}, completedRequests: {} }
        } as never))
        const chat = service.createTeamChat({ namespace: 'default', name: 'Team' })
        const backend = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
        service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testsSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })

        const report = service.reportToTeam({
            namespace: 'default',
            teamChatId: chat.id,
            sourceSessionId: backendSession.id,
            type: 'progress',
            summary: 'Backend route is half done'
        })

        expect(report.message.authorParticipantId).toBe(backend.id)
        expect(store.teamChats.listPendingMentionRequests('default', backendSession.id)).toEqual([])
        const testsRequest = store.teamChats.listPendingMentionRequests('default', testsSession.id)[0]
        expect(testsRequest.sourceMessageId).toBe(report.message.id)
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).deliveryKind).toBe('broadcast')
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).requiresResponse).toBe(false)
        expect(delivery.deliver).toHaveBeenCalledTimes(1)
        expect(delivery.deliver).toHaveBeenCalledWith(expect.objectContaining({
            request: expect.objectContaining({ targetSessionId: testsSession.id }),
            deliveryKind: 'broadcast',
            requiresResponse: false
        }))
    })
```

- [ ] **Step 2: Write failing test: report mentioning another agent makes mentioned target required and third agents optional**

Append:

```ts
    it('marks report mentions required while broadcasting optional context to other non-source sessions', () => {
        const store = new Store(':memory:')
        const backendSession = store.sessions.getOrCreateSession('backend', { path: '/repo' }, null, 'default')
        const testsSession = store.sessions.getOrCreateSession('tests', { path: '/repo' }, null, 'default')
        const reviewerSession = store.sessions.getOrCreateSession('reviewer', { path: '/repo' }, null, 'default')
        const delivery = { deliver: mock(() => undefined) }
        const service = new TeamChatService(store, { emit: mock(() => undefined) }, delivery, () => ({
            active: true,
            thinking: false,
            agentState: { controlledByUser: false, requests: {}, completedRequests: {} }
        } as never))
        const chat = service.createTeamChat({ namespace: 'default', name: 'Team' })
        service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: backendSession.id, displayName: 'Backend', role: 'backend', color: '#60a5fa' })
        const tests = service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: testsSession.id, displayName: 'Tests', role: 'tests', color: '#fbbf24' })
        service.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: reviewerSession.id, displayName: 'Reviewer', role: 'reviewer', color: '#a78bfa' })

        const report = service.reportToTeam({
            namespace: 'default',
            teamChatId: chat.id,
            sourceSessionId: backendSession.id,
            type: 'handoff',
            summary: '@Tests please verify the new route'
        })

        expect(report.message.mentions).toEqual([{ participantId: tests.id, sessionId: testsSession.id }])
        expect(store.teamChats.listPendingMentionRequests('default', backendSession.id)).toEqual([])
        const testsRequest = store.teamChats.listPendingMentionRequests('default', testsSession.id)[0]
        const reviewerRequest = store.teamChats.listPendingMentionRequests('default', reviewerSession.id)[0]
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).deliveryKind).toBe('mention')
        expect((testsRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).requiresResponse).toBe(true)
        expect((reviewerRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).deliveryKind).toBe('broadcast')
        expect((reviewerRequest.contextSnapshot as { deliveryKind?: string; requiresResponse?: boolean }).requiresResponse).toBe(false)
    })
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
bun test hub/src/sync/teamReports.test.ts -t 'broadcasts agent reports|marks report mentions'
```

Expected: FAIL because `reportToTeam()` only delivers parsed mentions and does not optional-broadcast to others.

- [ ] **Step 4: Implement source-session exclusion helper**

Add private helper after `resolveReportAuthorParticipant()`:

```ts
    private getSourceSessionIdForReport(authorParticipant: StoredTeamParticipant, explicitSourceSessionId?: string): string | null {
        if (explicitSourceSessionId) return explicitSourceSessionId
        if (authorParticipant.type === 'session' && authorParticipant.sessionId) return authorParticipant.sessionId
        return null
    }
```

- [ ] **Step 5: Replace mention-only loop in `reportToTeam()`**

Remove the existing `for (const mention of parsedMentions) { ... }` block in `reportToTeam()` and replace with:

```ts
        const sourceSessionId = this.getSourceSessionIdForReport(authorParticipant, input.sourceSessionId)
        this.deliverTeamMessageToSessions({
            namespace: input.namespace,
            teamChatId: input.teamChatId,
            sourceMessageId: message.id,
            text,
            mentionedSessionIds: new Set(parsedMentions.map((mention) => mention.sessionId)),
            excludedSessionIds: new Set(sourceSessionId ? [sourceSessionId] : []),
            hopDepth,
            parentRequestId: input.replyToRequestId ?? null
        })
```

- [ ] **Step 6: Run reports tests**

```bash
bun test hub/src/sync/teamReports.test.ts
```

Expected: all `Team Chat reports` tests pass.

- [ ] **Step 7: Commit**

```bash
git add hub/src/sync/teamChatService.ts hub/src/sync/teamReports.test.ts
git commit -m "feat: broadcast team reports to other agents"
```

---

## Task 4: Delivery metadata tests and no regression on auto-report bridge

**Files:**
- Modify: `hub/src/sync/teamMentionDeliveryService.test.ts`
- Modify: `hub/src/sync/teamReports.test.ts`

- [ ] **Step 1: Add failing test for session message metadata**

Append in `hub/src/sync/teamMentionDeliveryService.test.ts`:

```ts
    it('stores delivery kind and response requirement in session message metadata', () => {
        const store = new Store(':memory:')
        const { request } = createRequest(store)
        const { io } = createIo()
        const publisher = { emit: mock(() => undefined) }
        const messageService = new MessageService(store, io as never, publisher as never)
        const delivery = new TeamMentionDeliveryService(messageService, store, publisher)

        delivery.deliver({
            namespace: 'default',
            request,
            envelope: '[HAPI_TEAM_MENTION]\nTeam update',
            mode: 'card-only',
            deliveryKind: 'broadcast',
            requiresResponse: false
        })

        const stored = store.messages.getMessages(request.targetSessionId, 10)[0]
        expect((stored.content as { meta?: Record<string, unknown> }).meta).toMatchObject({
            sentFrom: 'team-chat',
            teamMentionRequestId: request.id,
            deliveryKind: 'broadcast',
            requiresResponse: false
        })
    })
```

- [ ] **Step 2: Run metadata test**

```bash
bun test hub/src/sync/teamMentionDeliveryService.test.ts -t 'stores delivery kind'
```

Expected: FAIL until Task 2 metadata change exists; PASS after implementation.

- [ ] **Step 3: Add auto-report optional broadcast regression test**

Append in `hub/src/sync/teamReports.test.ts`:

```ts
    it('auto-posts a plain reply for optional broadcast requests when an agent chooses to respond', () => {
        const { store, service, chat, tests, user, testsSession } = createContext()
        const source = service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'FYI: new route shape' }).message
        const optionalRequest = store.teamChats.listPendingMentionRequests('default', testsSession.id)[0]

        const report = service.autoReportSessionReply({
            namespace: 'default',
            sessionId: testsSession.id,
            requestId: optionalRequest.id,
            text: 'I can add a route regression test for this shape.'
        })

        expect(report?.message.authorParticipantId).toBe(tests.id)
        expect(report?.message.replyToMessageId).toBe(source.id)
        expect(report?.message.text).toBe('I can add a route regression test for this shape.')
        expect(store.teamChats.getMentionRequest('default', optionalRequest.id)?.status).toBe('responded')
    })
```

- [ ] **Step 4: Run bridge tests**

```bash
bun test hub/src/sync/teamReports.test.ts -t 'auto-posts a plain reply for optional broadcast requests'
```

Expected: PASS after broadcast requests exist.

- [ ] **Step 5: Add optional no-action terminal state test**

Append in `hub/src/sync/teamReports.test.ts`:

```ts
    it('marks optional broadcast requests no_action when the agent decides no reply is needed', () => {
        const { store, service, chat, user, testsSession } = createContext()
        service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: 'FYI only: route naming changed' })
        const optionalRequest = store.teamChats.listPendingMentionRequests('default', testsSession.id)[0]

        service.markMentionNoAction({ namespace: 'default', sessionId: testsSession.id, requestId: optionalRequest.id })

        const stored = store.teamChats.getMentionRequest('default', optionalRequest.id)
        expect(stored?.status).toBe('no_action')
        expect(typeof stored?.resolvedAt).toBe('number')
    })
```

- [ ] **Step 6: Add multi-request reply mapping regression test**

Append in `hub/src/sync/teamReports.test.ts`:

```ts
    it('auto-posts plain replies to the latest Team request while explicit reportToTeam can target an older request', () => {
        const { store, service, chat, user, backendSession } = createContext()
        service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend first request' })
        const firstRequest = store.teamChats.listPendingMentionRequests('default', backendSession.id)[0]
        service.postMessage({ namespace: 'default', teamChatId: chat.id, authorParticipantId: user.id, text: '@Backend second request' })
        const secondRequest = store.teamChats.listPendingMentionRequests('default', backendSession.id).find((request) => request.id !== firstRequest.id)!

        service.autoReportSessionReply({
            namespace: 'default',
            sessionId: backendSession.id,
            requestId: secondRequest.id,
            text: 'Plain reply answers the latest request.'
        })
        service.reportToTeam({
            namespace: 'default',
            teamChatId: chat.id,
            sourceSessionId: backendSession.id,
            type: 'reply',
            summary: 'Explicit reply answers the older request.',
            replyToRequestId: firstRequest.id
        })

        expect(store.teamChats.getMentionRequest('default', firstRequest.id)?.status).toBe('responded')
        expect(store.teamChats.getMentionRequest('default', secondRequest.id)?.status).toBe('responded')
    })
```

- [ ] **Step 7: Run Task 4 tests**

```bash
bun test hub/src/sync/teamMentionDeliveryService.test.ts hub/src/sync/teamReports.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add hub/src/sync/teamMentionDeliveryService.test.ts hub/src/sync/teamReports.test.ts
git commit -m "test: cover team broadcast delivery metadata"
```

---

## Task 5: Session chat UI labels for mention vs optional broadcast

**Files:**
- Modify: `web/src/chat/types.ts`
- Modify: `web/src/chat/reducerTimeline.ts`
- Modify: `web/src/chat/reducerTimeline.test.ts`
- Modify: `web/src/components/AssistantChat/messages/TeamMentionMessage.tsx`
- Modify: `web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx`
- Modify: `web/src/components/AssistantChat/TeamMentionQueueBar.tsx`
- Modify: `web/src/components/AssistantChat/TeamMentionQueueBar.test.tsx`

- [ ] **Step 1: Write failing reducer test for broadcast metadata**

Append in `web/src/chat/reducerTimeline.test.ts`:

```ts
    it('renders Team Chat broadcast metadata as an optional team update block', () => {
        const { blocks } = reduceTimeline([makeUserMessage('[HAPI_TEAM_MENTION]\nTeam update', {
            meta: {
                sentFrom: 'team-chat',
                teamMentionRequestId: 'req-1',
                teamChatId: 'team-1',
                sourceMessageId: 'team-msg-1',
                deliveryKind: 'broadcast',
                requiresResponse: false
            }
        })], makeContext())

        expect(blocks[0]).toMatchObject({
            kind: 'team-mention',
            requestId: 'req-1',
            deliveryKind: 'broadcast',
            requiresResponse: false,
            text: 'Team update'
        })
    })
```

- [ ] **Step 2: Run reducer test to verify it fails**

```bash
bun test web/src/chat/reducerTimeline.test.ts -t 'broadcast metadata'
```

Expected: FAIL because `TeamMentionBlock` does not expose the fields.

- [ ] **Step 3: Add fields to `TeamMentionBlock`**

In `web/src/chat/types.ts`:

```ts
export type TeamMentionBlock = {
    kind: 'team-mention'
    id: string
    localId: string | null
    createdAt: number
    requestId: string
    teamChatId: string
    sourceMessageId: string
    text: string
    deliveryKind?: 'mention' | 'broadcast'
    requiresResponse?: boolean
    status: 'pending' | 'delivered' | 'seen' | 'processing' | 'responded' | 'no_action' | 'superseded' | 'failed'
    meta?: unknown
}
```

- [ ] **Step 4: Parse metadata in `reducerTimeline.ts`**

Change `getTeamMentionMeta()` return type:

```ts
function getTeamMentionMeta(meta: unknown): {
    requestId: string
    teamChatId: string
    sourceMessageId: string
    deliveryKind: 'mention' | 'broadcast'
    requiresResponse: boolean
} | null {
```

Add parsing before return:

```ts
    const deliveryKind = candidate.deliveryKind === 'broadcast' ? 'broadcast' : 'mention'
    const requiresResponse = typeof candidate.requiresResponse === 'boolean'
        ? candidate.requiresResponse
        : deliveryKind === 'mention'
```

Return:

```ts
    return {
        requestId: candidate.teamMentionRequestId,
        teamChatId: candidate.teamChatId,
        sourceMessageId: candidate.sourceMessageId,
        deliveryKind,
        requiresResponse
    }
```

Add block fields:

```ts
                    deliveryKind: teamMention.deliveryKind,
                    requiresResponse: teamMention.requiresResponse,
```

- [ ] **Step 5: Run reducer tests**

```bash
bun test web/src/chat/reducerTimeline.test.ts
```

Expected: pass.

- [ ] **Step 6: Update card label**

In `web/src/components/AssistantChat/messages/TeamMentionMessage.tsx`, replace title text:

```tsx
    const isBroadcast = props.block.deliveryKind === 'broadcast' || props.block.requiresResponse === false
    const title = isBroadcast ? 'Team update' : 'Team mention'
```

Then render:

```tsx
                <div className="font-medium text-[var(--app-fg)]">{title}</div>
```

Change the no-action button label for optional broadcasts:

```tsx
                <button className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-xs text-[var(--app-hint)]" onClick={props.onNoAction}>
                    {isBroadcast ? 'Seen, no reply' : 'No action needed'}
                </button>
```

- [ ] **Step 7: Add/adjust component test**

In `web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx`, add:

```tsx
it('labels optional broadcasts as Team updates', () => {
    render(<TeamMentionMessage
        block={{
            kind: 'team-mention',
            id: 'm1',
            localId: null,
            createdAt: 1,
            requestId: 'req-1',
            teamChatId: 'team-1',
            sourceMessageId: 'team-msg-1',
            text: 'Priority changed',
            deliveryKind: 'broadcast',
            requiresResponse: false,
            status: 'delivered'
        }}
        onOpenTeamChat={() => {}}
        onReplyToTeam={() => {}}
        onPostUpdate={() => {}}
        onViewOriginal={() => {}}
        onNoAction={() => {}}
    />)

    expect(screen.getByText('Team update')).toBeInTheDocument()
    expect(screen.getByText('Seen, no reply')).toBeInTheDocument()
})
```

- [ ] **Step 8: Run component tests**

```bash
bun test web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx
```

Expected: pass.

- [ ] **Step 9: Update queue wording for mixed mentions/broadcasts**

Because active optional broadcasts make the old wording misleading, change in `TeamMentionQueueBar.tsx`:

```tsx
            aria-label="Pending Team items"
```

and:

```tsx
                <div className="font-medium">{activeRequests.length} Team items waiting</div>
```

Update test expected labels accordingly.

- [ ] **Step 10: Commit**

```bash
git add web/src/chat/types.ts web/src/chat/reducerTimeline.ts web/src/chat/reducerTimeline.test.ts web/src/components/AssistantChat/messages/TeamMentionMessage.tsx web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx web/src/components/AssistantChat/TeamMentionQueueBar.tsx web/src/components/AssistantChat/TeamMentionQueueBar.test.tsx
git commit -m "fix: distinguish team broadcasts from mentions in session chat"
```

---

## Task 6: Full verification

**Files:**
- No source changes unless verification fails.

- [ ] **Step 1: Run focused hub tests**

```bash
bun test hub/src/sync/teamChatService.test.ts hub/src/sync/teamReports.test.ts hub/src/sync/teamMentionDeliveryService.test.ts hub/src/sync/sessionModel.test.ts hub/src/web/routes/teamChats.test.ts hub/src/web/routes/cliTeamReports.test.ts
```

Expected: all pass.

- [ ] **Step 2: Run focused web tests**

```bash
bun test web/src/chat/reducerTimeline.test.ts web/src/components/AssistantChat/messages/TeamMentionMessage.test.tsx web/src/components/AssistantChat/TeamMentionQueueBar.test.tsx
```

Expected: all pass.

- [ ] **Step 3: Run typecheck**

```bash
bun typecheck
```

Expected: `cli`, `web`, and `hub` typecheck pass.

- [ ] **Step 4: Run hub full tests**

```bash
bun run test:hub
```

Expected: all hub tests pass.

- [ ] **Step 5: Inspect diff and commit any remaining test/cleanup changes**

```bash
git status --short
git diff --check
```

Expected: no whitespace errors. If there are staged or unstaged changes from fixes, commit them with a focused message.

---

## Explicit Behavior Matrix

| Source | Message has mention? | Delivered to mentioned sessions | Delivered to non-mentioned sessions | Delivered to source session |
|---|---:|---|---|---|
| Human user | No | N/A | Optional broadcast, may reply or terminal no_action (UI: seen/no reply) | N/A |
| Human user | Yes | Required mention, must respond | Optional broadcast, may reply or terminal no_action (UI: seen/no reply) | N/A |
| Agent report/reply | No | N/A | Optional broadcast, may reply or terminal no_action | No self-echo |
| Agent report/reply | Yes | Required mention, must respond | Optional broadcast, may reply or terminal no_action | No self-echo |

## Non-goals / Guardrails

- No DB migration in this MVP; semantics live in `contextSnapshot` and message `meta`.
- No forced interruption of thinking/user-controlled/inactive sessions; `getMentionDeliveryMode()` remains the source of truth. Those sessions still receive a card-only Team item.
- No backfill of old Team messages.
- No unbounded Team transcript injection; context must use required-vs-compact caps from Task 2.
- No service restart/build in agent session; user handles final rebuild/restart.

## Self-review

- Spec coverage: user messages fan out to all session members; mentions are required; optional broadcasts allow reply or terminal no_action (shown as seen/no reply); agent reports skip self and fan out to others.
- Placeholder scan: no `TBD`/`TODO` placeholders; each task includes exact paths, code snippets, commands, and expected results.
- Type consistency: `TeamDeliveryKind`, `deliveryKind`, and `requiresResponse` names are consistent across hub delivery, session message meta, and web reducer/UI.
