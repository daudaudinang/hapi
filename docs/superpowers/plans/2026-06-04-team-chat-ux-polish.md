# Team Chat UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish Team Chat lifecycle UX so users can rename/archive rooms, edit/remove members, understand empty-room next steps, and clearly distinguish Team Chat from direct session chat.

**Architecture:** Keep Team Chat as the existing first-class Hub domain. Add small PATCH endpoints for mutable room/member fields, keep archive as soft-delete, and keep member removal as participant archive. Web changes stay mostly inside Team Chat route/components; Session/Editor mode should only be touched for composer placeholder plumbing used by the direct-chat modal.

**Tech Stack:** Bun workspaces, TypeScript strict, Hono routes, SQLite via `bun:sqlite`, React 19, TanStack Router/Query, `bun:test` for hub tests, Vitest + Testing Library for web tests.

---

## Scope

Implement this P0/P1 UX batch:

1. Rename Team Chat.
2. Change destructive copy from `Delete` to `Archive`.
3. Move destructive actions into safer menus where practical.
4. Edit member alias/color/role.
5. Remove member from Team Chat without deleting the session.
6. Improve empty states after standalone room creation.
7. Add explicit composer placeholders for Team Chat vs direct-session modal.

Not in this batch:

- Restore archived room / undo archive.
- Full unread badge / last message preview aggregation.
- Search/group Team Chats.
- Analytics or onboarding tour.

## File structure

### Hub store/service/routes

- Modify: `hub/src/store/teamChatStore.ts`
  - Add `updateTeamChat(namespace, teamChatId, patch)`.
  - Add `updateParticipant(namespace, teamChatId, participantId, patch)`.
  - Keep `archiveTeamChat` and `archiveParticipant` semantics.
- Modify: `hub/src/sync/teamChatService.ts`
  - Add `updateTeamChat` and `updateParticipant` wrappers with validation + SSE emits.
- Modify: `hub/src/sync/syncEngine.ts`
  - Expose the new service methods.
- Modify: `hub/src/web/routes/teamChats.ts`
  - Add `PATCH /team-chats/:id`.
  - Add `PATCH /team-chats/:id/participants/:participantId`.
- Tests:
  - `hub/src/store/teamChatStore.test.ts`
  - `hub/src/web/routes/teamChats.test.ts`

### Web API/data

- Modify: `web/src/api/client.ts`
  - Add `updateTeamChat`, `updateTeamParticipant`, `removeTeamParticipant` if not present.
- Modify: `web/src/api/client.teamChat.test.ts`
- Modify: `web/src/hooks/mutations/useTeamChatActions.ts`
  - Add `renameTeamChat`, `updateTeamParticipant`, `removeTeamParticipant`.
  - Invalidate `teamChats`, `teamChat(id)`, `teamParticipants(id)`, and `sessionTeamMembershipsBase`.

### Web UI

- Modify: `web/src/routes/team-chats.tsx`
  - Replace visible `Delete` button with overflow/menu or at minimum `Archive` action.
  - Add rename/archive actions on list cards.
- Modify: `web/src/routes/team-chats/$teamChatId.tsx`
  - Wire rename/archive handlers in detail header.
- Modify: `web/src/components/TeamChat/TeamChatLayout.tsx`
  - Replace header `Delete` button with menu/action props: rename/archive.
  - Render empty-state panel when no session participants.
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.tsx`
  - Add member row action menu: edit alias, edit role/color, remove member.
- Modify: `web/src/components/TeamChat/TeamChatComposer.tsx`
  - Make placeholder/helper copy explicit.
- Modify: `web/src/components/TeamChat/TeamSessionChatModal.tsx`
  - Pass direct-session placeholder down to `SessionChat`.
- Modify: `web/src/components/SessionChat.tsx`
  - Add optional `composerPlaceholder` prop.
- Modify: `web/src/components/AssistantChat/HappyComposer.tsx`
  - Add optional `placeholder` prop.

---

## Task 1: Backend rename/update APIs

**Files:**
- Modify: `hub/src/store/teamChatStore.test.ts`
- Modify: `hub/src/store/teamChatStore.ts`
- Modify: `hub/src/web/routes/teamChats.test.ts`
- Modify: `hub/src/web/routes/teamChats.ts`
- Modify: `hub/src/sync/teamChatService.ts`
- Modify: `hub/src/sync/syncEngine.ts`

- [ ] **Step 1: Write failing store test for Team Chat rename**

Add to `hub/src/store/teamChatStore.test.ts`:

```ts
it('renames Team Chats and updates project path without unarchiving archived chats', () => {
    const store = new Store(':memory:')
    const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Old name', projectPath: '/old' })

    const updated = store.teamChats.updateTeamChat('default', chat.id, { name: 'New name', projectPath: '/new' })

    expect(updated.name).toBe('New name')
    expect(updated.projectPath).toBe('/new')
    expect(updated.updatedAt).toBeGreaterThanOrEqual(chat.updatedAt)
    store.teamChats.archiveTeamChat('default', chat.id)
    expect(() => store.teamChats.updateTeamChat('default', chat.id, { name: 'Hidden' })).toThrow('TEAM_CHAT_NOT_FOUND')
})
```

- [ ] **Step 2: Write failing route test for Team Chat rename**

Add to `hub/src/web/routes/teamChats.test.ts`:

```ts
it('renames Team Chats through the namespace-scoped engine API', async () => {
    const calls: unknown[] = []
    const engine = {
        updateTeamChat: (namespace: string, teamChatId: string, patch: unknown) => {
            calls.push({ namespace, teamChatId, patch })
            return { id: teamChatId, namespace, name: 'New name', projectPath: '/repo', createdAt: 1, updatedAt: 2 }
        }
    }
    const app = createApp('ns-a', engine)

    const response = await app.request('/api/team-chats/team-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: '  New name  ', projectPath: '/repo' })
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ teamChat: { id: 'team-1', namespace: 'ns-a', name: 'New name', projectPath: '/repo', createdAt: 1, updatedAt: 2 } })
    expect(calls).toEqual([{ namespace: 'ns-a', teamChatId: 'team-1', patch: { name: 'New name', projectPath: '/repo' } }])
})
```

- [ ] **Step 3: Run backend RED tests**

Run:

```bash
bun test hub/src/store/teamChatStore.test.ts hub/src/web/routes/teamChats.test.ts
```

Expected: fail because `updateTeamChat` and `PATCH /team-chats/:id` do not exist.

- [ ] **Step 4: Implement store update**

Add to `TeamChatStore`:

```ts
updateTeamChat(namespace: string, teamChatId: string, patch: { name?: string; projectPath?: string | null }): StoredTeamChat {
    this.requireTeamChat(namespace, teamChatId)
    const current = this.getTeamChat(namespace, teamChatId)
    if (!current) throw new Error('TEAM_CHAT_NOT_FOUND')
    const name = patch.name !== undefined ? patch.name.trim() : current.name
    if (!name) throw new Error('TEAM_CHAT_NAME_INVALID')
    const projectPath = patch.projectPath !== undefined ? patch.projectPath : current.projectPath
    const now = Date.now()
    this.db.prepare(`
        UPDATE team_chats
        SET name = ?, project_path = ?, updated_at = ?
        WHERE namespace = ? AND id = ? AND archived_at IS NULL
    `).run(name, projectPath ?? null, now, namespace, teamChatId)
    const updated = this.getTeamChat(namespace, teamChatId)
    if (!updated) throw new Error('TEAM_CHAT_NOT_FOUND')
    return updated
}
```

- [ ] **Step 5: Implement service/engine/route update**

In `TeamChatService`:

```ts
updateTeamChat(namespace: string, teamChatId: string, patch: { name?: string; projectPath?: string | null }) {
    const teamChat = this.store.teamChats.updateTeamChat(namespace, teamChatId, patch)
    this.publisher.emit({ type: 'team-chat-updated', namespace, teamChatId })
    return teamChat
}
```

In `SyncEngine`:

```ts
updateTeamChat(namespace: string, teamChatId: string, patch: { name?: string; projectPath?: string | null }) {
    return this.teamChatService.updateTeamChat(namespace, teamChatId, patch)
}
```

In `teamChats.ts` add schema and route:

```ts
const updateTeamChatSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    projectPath: z.string().trim().optional().nullable()
}).refine((input) => input.name !== undefined || input.projectPath !== undefined, {
    message: 'name or projectPath is required'
})

app.patch('/team-chats/:id', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    const body = await c.req.json().catch(() => null)
    const parsed = updateTeamChatSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
    try {
        return c.json({ teamChat: engine.updateTeamChat(c.get('namespace'), c.req.param('id'), parsed.data) })
    } catch (error) {
        return teamChatErrorResponse(c, error)
    }
})
```

- [ ] **Step 6: Run backend GREEN tests**

Run:

```bash
bun test hub/src/store/teamChatStore.test.ts hub/src/web/routes/teamChats.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add hub/src/store/teamChatStore.test.ts hub/src/store/teamChatStore.ts hub/src/web/routes/teamChats.test.ts hub/src/web/routes/teamChats.ts hub/src/sync/teamChatService.ts hub/src/sync/syncEngine.ts
git commit -m "feat: update team chat metadata"
```

---

## Task 2: Backend member edit/remove APIs

**Files:**
- Modify: `hub/src/store/teamChatStore.test.ts`
- Modify: `hub/src/store/teamChatStore.ts`
- Modify: `hub/src/web/routes/teamChats.test.ts`
- Modify: `hub/src/web/routes/teamChats.ts`
- Modify: `hub/src/sync/teamChatService.ts`
- Modify: `hub/src/sync/syncEngine.ts`

- [ ] **Step 1: Write failing store test for alias/color/role update**

Add to `hub/src/store/teamChatStore.test.ts`:

```ts
it('updates participant alias, role, and color with duplicate alias guard', () => {
    const store = new Store(':memory:')
    const sessionA = store.sessions.getOrCreateSession('session-a', { path: '/repo' }, null, 'default')
    const sessionB = store.sessions.getOrCreateSession('session-b', { path: '/repo' }, null, 'default')
    const chat = store.teamChats.createTeamChat({ namespace: 'default', name: 'Chat' })
    const backend = store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: sessionA.id, displayName: 'Backend', color: '#60a5fa', role: 'backend' })
    store.teamChats.addParticipant({ namespace: 'default', teamChatId: chat.id, type: 'session', sessionId: sessionB.id, displayName: 'UI', color: '#34d399', role: 'frontend' })

    const updated = store.teamChats.updateParticipant('default', chat.id, backend.id, { displayName: 'API', color: '#f87171', role: 'reviewer' })

    expect(updated.displayName).toBe('API')
    expect(updated.color).toBe('#f87171')
    expect(updated.role).toBe('reviewer')
    expect(() => store.teamChats.updateParticipant('default', chat.id, backend.id, { displayName: 'ui' })).toThrow('TEAM_PARTICIPANT_DISPLAY_NAME_EXISTS')
})
```

- [ ] **Step 2: Write failing route test for member update and remove**

Add to `hub/src/web/routes/teamChats.test.ts`:

```ts
it('updates Team Chat participants through the namespace-scoped engine API', async () => {
    const calls: unknown[] = []
    const engine = {
        updateTeamParticipant: (namespace: string, teamChatId: string, participantId: string, patch: unknown) => {
            calls.push({ namespace, teamChatId, participantId, patch })
            return { id: participantId, teamChatId, type: 'session', sessionId: 's1', displayName: 'API', role: 'reviewer', color: '#f87171', joinedAt: 1 }
        }
    }
    const app = createApp('ns-a', engine)

    const response = await app.request('/api/team-chats/team-1/participants/p1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: '  API  ', role: 'reviewer', color: '#f87171' })
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ participant: { id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'API', role: 'reviewer', color: '#f87171', joinedAt: 1 } })
    expect(calls).toEqual([{ namespace: 'ns-a', teamChatId: 'team-1', participantId: 'p1', patch: { displayName: 'API', role: 'reviewer', color: '#f87171' } }])
})
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
bun test hub/src/store/teamChatStore.test.ts hub/src/web/routes/teamChats.test.ts
```

Expected: fail because participant update API does not exist.

- [ ] **Step 4: Implement store participant update**

Add to `TeamChatStore`:

```ts
updateParticipant(
    namespace: string,
    teamChatId: string,
    participantId: string,
    patch: { displayName?: string; role?: StoredTeamParticipant['role']; color?: string }
): StoredTeamParticipant {
    this.requireParticipant(namespace, teamChatId, participantId)
    const current = this.getParticipant(namespace, participantId)
    if (!current) throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
    const displayName = patch.displayName !== undefined ? patch.displayName.trim() : current.displayName
    if (!displayName) throw new Error('TEAM_PARTICIPANT_DISPLAY_NAME_INVALID')
    if (displayName.toLowerCase() !== current.displayName.toLowerCase()) {
        const duplicate = this.db.prepare(`
            SELECT id FROM team_participants
            WHERE namespace = ? AND team_chat_id = ? AND archived_at IS NULL AND id <> ? AND lower(display_name) = lower(?)
            LIMIT 1
        `).get(namespace, teamChatId, participantId, displayName) as { id: string } | undefined
        if (duplicate) throw new Error('TEAM_PARTICIPANT_DISPLAY_NAME_EXISTS')
    }
    this.db.prepare(`
        UPDATE team_participants
        SET display_name = ?, role = ?, color = ?
        WHERE namespace = ? AND team_chat_id = ? AND id = ? AND archived_at IS NULL
    `).run(displayName, patch.role ?? current.role, patch.color ?? current.color, namespace, teamChatId, participantId)
    const updated = this.getParticipant(namespace, participantId)
    if (!updated) throw new Error('TEAM_PARTICIPANT_NOT_FOUND')
    return updated
}
```

- [ ] **Step 5: Implement service/engine/route participant update**

In `TeamChatService`:

```ts
updateParticipant(namespace: string, teamChatId: string, participantId: string, patch: { displayName?: string; role?: StoredTeamParticipant['role']; color?: string }) {
    const participant = this.store.teamChats.updateParticipant(namespace, teamChatId, participantId, patch)
    this.publisher.emit({ type: 'team-participant-updated', namespace, teamChatId, participantId })
    return participant
}
```

In `SyncEngine`:

```ts
updateTeamParticipant(namespace: string, teamChatId: string, participantId: string, patch: { displayName?: string; role?: StoredTeamParticipant['role']; color?: string }) {
    return this.teamChatService.updateParticipant(namespace, teamChatId, participantId, patch)
}
```

In `teamChats.ts` add route schema:

```ts
const updateParticipantSchema = z.object({
    displayName: z.string().trim().min(1).max(32).optional(),
    role: z.enum(['backend', 'frontend', 'tests', 'reviewer', 'docs', 'general']).optional(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i).optional()
}).refine((input) => input.displayName !== undefined || input.role !== undefined || input.color !== undefined, {
    message: 'displayName, role, or color is required'
})

app.patch('/team-chats/:id/participants/:participantId', async (c) => {
    const engine = requireSyncEngine(c, getSyncEngine)
    if (engine instanceof Response) return engine
    const body = await c.req.json().catch(() => null)
    const parsed = updateParticipantSchema.safeParse(body)
    if (!parsed.success) return c.json({ error: 'Invalid body' }, 400)
    try {
        return c.json({ participant: engine.updateTeamParticipant(c.get('namespace'), c.req.param('id'), c.req.param('participantId'), parsed.data) })
    } catch (error) {
        return teamChatErrorResponse(c, error)
    }
})
```

- [ ] **Step 6: Run GREEN tests**

Run:

```bash
bun test hub/src/store/teamChatStore.test.ts hub/src/web/routes/teamChats.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add hub/src/store/teamChatStore.test.ts hub/src/store/teamChatStore.ts hub/src/web/routes/teamChats.test.ts hub/src/web/routes/teamChats.ts hub/src/sync/teamChatService.ts hub/src/sync/syncEngine.ts
git commit -m "feat: update team chat members"
```

---

## Task 3: Web API and mutation hooks

**Files:**
- Modify: `web/src/api/client.teamChat.test.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/hooks/mutations/useTeamChatActions.ts`

- [ ] **Step 1: Write failing API client tests**

Add to `web/src/api/client.teamChat.test.ts`:

```ts
it('updates Team Chats and participants with URL encoding', async () => {
    const fetchMock = mockJson({ ok: true })
    const api = new ApiClient('token')

    await api.updateTeamChat('team/1', { name: 'Planning', projectPath: '/repo' })
    await api.updateTeamParticipant('team/1', 'participant/2', { displayName: 'API', role: 'reviewer', color: '#f87171' })
    await api.removeTeamParticipant('team/1', 'participant/2')

    expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ name: 'Planning', projectPath: '/repo' })
    }))
    expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/participants/participant%2F2', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'API', role: 'reviewer', color: '#f87171' })
    }))
    expect(fetchMock).toHaveBeenCalledWith('/api/team-chats/team%2F1/participants/participant%2F2', expect.objectContaining({
        method: 'DELETE'
    }))
})
```

- [ ] **Step 2: Run RED test**

Run:

```bash
bun run --cwd web test src/api/client.teamChat.test.ts
```

Expected: fail because new client methods do not exist.

- [ ] **Step 3: Implement client methods**

Add to `ApiClient`:

```ts
async updateTeamChat(teamChatId: string, input: { name?: string; projectPath?: string | null }): Promise<TeamChatResponse> {
    return await this.request<TeamChatResponse>(`/api/team-chats/${encodeURIComponent(teamChatId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
    })
}

async updateTeamParticipant(
    teamChatId: string,
    participantId: string,
    input: Partial<Pick<TeamParticipant, 'displayName' | 'role' | 'color'>>
): Promise<{ participant: TeamParticipant }> {
    return await this.request<{ participant: TeamParticipant }>(`/api/team-chats/${encodeURIComponent(teamChatId)}/participants/${encodeURIComponent(participantId)}`, {
        method: 'PATCH',
        body: JSON.stringify(input)
    })
}

async removeTeamParticipant(teamChatId: string, participantId: string): Promise<void> {
    await this.request(`/api/team-chats/${encodeURIComponent(teamChatId)}/participants/${encodeURIComponent(participantId)}`, {
        method: 'DELETE'
    })
}
```

- [ ] **Step 4: Extend mutation hook**

In `useTeamChatActions`, return:

```ts
renameTeamChat: async (targetTeamChatId, input) => {
    await renameMutation.mutateAsync({ teamChatId: targetTeamChatId, input })
},
updateTeamParticipant: async (targetTeamChatId, participantId, input) => {
    await updateParticipantMutation.mutateAsync({ teamChatId: targetTeamChatId, participantId, input })
},
removeTeamParticipant: async (targetTeamChatId, participantId, sessionId) => {
    await removeParticipantMutation.mutateAsync({ teamChatId: targetTeamChatId, participantId, sessionId })
}
```

Each mutation must invalidate:

```ts
queryClient.invalidateQueries({ queryKey: queryKeys.teamChats })
queryClient.invalidateQueries({ queryKey: queryKeys.teamChat(teamChatId) })
queryClient.invalidateQueries({ queryKey: queryKeys.teamParticipants(teamChatId) })
queryClient.invalidateQueries({ queryKey: queryKeys.sessionTeamMembershipsBase })
```

- [ ] **Step 5: Run GREEN test**

Run:

```bash
bun run --cwd web test src/api/client.teamChat.test.ts
bun run typecheck:web
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/client.teamChat.test.ts web/src/api/client.ts web/src/hooks/mutations/useTeamChatActions.ts
git commit -m "feat: add team chat update client actions"
```

---

## Task 4: Safer Team Chat list UX + rename/archive

**Files:**
- Modify: `web/src/routes/team-chats.test.tsx`
- Modify: `web/src/routes/team-chats.tsx`

- [ ] **Step 1: Update failing list-page tests**

Modify `web/src/routes/team-chats.test.tsx` so it expects `Archive` instead of `Delete` and add rename:

```ts
it('renames a Team Chat from the list card menu', async () => {
    const renameTeamChat = vi.fn(async () => {})
    useTeamChatsMock.mockReturnValue({
        teamChats: [{ id: 'team-1', namespace: 'default', name: 'Planning', projectPath: '/repo', createdAt: 1, updatedAt: 2 }],
        isLoading: false,
        error: null
    })
    useTeamChatActionsMock.mockReturnValue({
        createTeamChat: vi.fn(async () => 'team-new'),
        addTeamParticipantTo: vi.fn(async () => {}),
        deleteTeamChat: vi.fn(async () => {}),
        renameTeamChat,
        isPending: false
    })

    render(<TeamChatsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Team Chat actions for Planning/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /Team Chat name/i }), { target: { value: 'Execution Room' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }))

    await waitFor(() => expect(renameTeamChat).toHaveBeenCalledWith('team-1', { name: 'Execution Room', projectPath: '/repo' }))
})

it('archives a Team Chat after confirmation without deleting sessions', async () => {
    const deleteTeamChat = vi.fn(async () => {})
    useTeamChatsMock.mockReturnValue({
        teamChats: [{ id: 'team-1', namespace: 'default', name: 'Planning', projectPath: '/repo', createdAt: 1, updatedAt: 2 }],
        isLoading: false,
        error: null
    })
    useTeamChatActionsMock.mockReturnValue({
        createTeamChat: vi.fn(async () => 'team-new'),
        addTeamParticipantTo: vi.fn(async () => {}),
        deleteTeamChat,
        renameTeamChat: vi.fn(async () => {}),
        isPending: false
    })

    render(<TeamChatsPage />)

    fireEvent.click(screen.getByRole('button', { name: /Team Chat actions for Planning/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/i }))
    expect(screen.getByText('Sessions in this Team Chat will not be deleted.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Archive Team Chat$/i }))

    await waitFor(() => expect(deleteTeamChat).toHaveBeenCalledWith('team-1'))
})
```

- [ ] **Step 2: Run RED tests**

Run:

```bash
bun run --cwd web test src/routes/team-chats.test.tsx
```

Expected: fail because menu/rename/archive copy do not exist.

- [ ] **Step 3: Implement list menu and dialogs**

In `team-chats.tsx`:

- Rename `deleteCandidate` state to `archiveCandidate`.
- Add `menuOpenTeamChatId` state.
- Add `renameCandidate` state and reuse the existing create dialog form layout for rename.
- Card action button:

```tsx
<button
    type="button"
    aria-label={`Team Chat actions for ${chat.name}`}
    aria-haspopup="menu"
    aria-expanded={menuOpenTeamChatId === chat.id}
    onClick={() => setMenuOpenTeamChatId((current) => current === chat.id ? null : chat.id)}
    className="shrink-0 rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)]"
>
    ⋯
</button>
```

Menu items:

```tsx
<button role="menuitem" type="button" onClick={() => openRenameDialog(chat)}>Rename</button>
<button role="menuitem" type="button" onClick={() => openArchiveDialog(chat)}>Archive</button>
```

Archive dialog copy:

```text
Archive Team Chat?
This archives <name>.
Sessions in this Team Chat will not be deleted.
```

- [ ] **Step 4: Run GREEN tests**

Run:

```bash
bun run --cwd web test src/routes/team-chats.test.tsx
bun run typecheck:web
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/routes/team-chats.test.tsx web/src/routes/team-chats.tsx
git commit -m "feat: polish team chat list actions"
```

---

## Task 5: Detail header rename/archive and empty-room guidance

**Files:**
- Modify: `web/src/components/TeamChat/TeamChatLayout.test.tsx`
- Modify: `web/src/components/TeamChat/TeamChatLayout.tsx`
- Modify: `web/src/routes/team-chats/$teamChatId.tsx`

- [ ] **Step 1: Write failing layout test**

Add to `web/src/components/TeamChat/TeamChatLayout.test.tsx`:

```ts
it('renders room actions and empty member guidance', () => {
    const onRenameTeamChat = vi.fn()
    const onArchiveTeamChat = vi.fn()
    render(<TeamChatLayout
        teamChat={teamChat}
        messages={[]}
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'user', displayName: 'You', role: 'general', color: '#34d399', joinedAt: 1 }]}
        currentParticipantId="p1"
        onSend={vi.fn()}
        onLoadAround={vi.fn()}
        onRenameTeamChat={onRenameTeamChat}
        onArchiveTeamChat={onArchiveTeamChat}
    />)

    fireEvent.click(screen.getByRole('button', { name: /Team Chat actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Rename/i }))
    fireEvent.click(screen.getByRole('button', { name: /Team Chat actions/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Archive/i }))

    expect(screen.getByText('Add sessions to start collaborating.')).toBeInTheDocument()
    expect(onRenameTeamChat).toHaveBeenCalled()
    expect(onArchiveTeamChat).toHaveBeenCalled()
})
```

- [ ] **Step 2: Run RED test**

Run:

```bash
bun run --cwd web test src/components/TeamChat/TeamChatLayout.test.tsx
```

Expected: fail because actions and empty guidance do not exist.

- [ ] **Step 3: Implement header action menu**

In `TeamChatLayout` props add:

```ts
onRenameTeamChat?: () => void
onArchiveTeamChat?: () => void
```

Replace visible destructive header button with `⋯` menu:

```tsx
<button type="button" aria-label="Team Chat actions" aria-haspopup="menu" onClick={() => setActionsOpen((open) => !open)}>⋯</button>
{actionsOpen ? (
    <div role="menu">
        <button role="menuitem" type="button" onClick={props.onRenameTeamChat}>Rename</button>
        <button role="menuitem" type="button" onClick={props.onArchiveTeamChat}>Archive</button>
    </div>
) : null}
```

- [ ] **Step 4: Implement empty guidance**

Derive:

```ts
const sessionParticipantCount = props.participants.filter((participant) => participant.type === 'session').length
```

When zero, render above timeline:

```tsx
<div className="m-3 rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--app-card-bg,var(--app-bg))] p-4 text-sm">
    <div className="font-semibold text-[var(--app-fg)]">Add sessions to start collaborating.</div>
    <div className="mt-1 text-[var(--app-hint)]">Use Members → Add member to bring existing sessions into this Team Chat.</div>
</div>
```

- [ ] **Step 5: Wire detail route handlers**

In `$teamChatId.tsx`, add rename dialog state and archive dialog copy. Use:

```ts
await renameTeamChat(teamChatId, { name: normalizedName, projectPath: normalizedProjectPath || null })
await deleteTeamChat(teamChatId)
```

Archive dialog label must be `Archive Team Chat`, not `Delete Team Chat`.

- [ ] **Step 6: Run GREEN tests**

Run:

```bash
bun run --cwd web test src/components/TeamChat/TeamChatLayout.test.tsx
bun run typecheck:web
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/TeamChat/TeamChatLayout.test.tsx web/src/components/TeamChat/TeamChatLayout.tsx 'web/src/routes/team-chats/$teamChatId.tsx'
git commit -m "feat: polish team chat detail actions"
```

---

## Task 6: Member edit/remove UX

**Files:**
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.test.tsx`
- Modify: `web/src/components/TeamChat/TeamChatRightPanel.tsx`
- Modify: `web/src/components/TeamChat/TeamChatLayout.tsx`
- Modify: `web/src/routes/team-chats/$teamChatId.tsx`

- [ ] **Step 1: Write failing right-panel test**

Add to `TeamChatRightPanel.test.tsx`:

```ts
it('edits a member alias and removes a session member from the Team Chat', () => {
    const onUpdateParticipant = vi.fn()
    const onRemoveParticipant = vi.fn()
    render(<TeamChatRightPanel
        participants={[{ id: 'p2', teamChatId: 'team-1', type: 'session', sessionId: 's2', displayName: 'UI', role: 'frontend', color: '#a78bfa', joinedAt: 1 }]}
        availableSessions={[{ id: 's2', active: true, thinking: false, activeAt: 1, updatedAt: 2, metadata: { path: '/repo/hapi', name: 'Frontend polish' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null }]}
        onUpdateParticipant={onUpdateParticipant}
        onRemoveParticipant={onRemoveParticipant}
    />)

    fireEvent.click(screen.getByRole('button', { name: /Member actions for @UI/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Edit member/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /Team alias/i }), { target: { value: 'Frontend' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save member$/i }))

    expect(onUpdateParticipant).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2' }), {
        displayName: 'Frontend',
        role: 'frontend',
        color: '#a78bfa'
    })

    fireEvent.click(screen.getByRole('button', { name: /Member actions for @UI/i }))
    fireEvent.click(screen.getByRole('menuitem', { name: /Remove from Team Chat/i }))
    expect(screen.getByText('This removes @UI from the Team Chat. The session is not deleted.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Remove member$/i }))

    expect(onRemoveParticipant).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2', sessionId: 's2' }))
})
```

- [ ] **Step 2: Run RED test**

Run:

```bash
bun run --cwd web test src/components/TeamChat/TeamChatRightPanel.test.tsx
```

Expected: fail because member action menu/dialogs do not exist.

- [ ] **Step 3: Extend props and implement member action menu**

Add props:

```ts
onUpdateParticipant?: (participant: TeamParticipant, patch: { displayName: string; role: TeamParticipant['role']; color: string }) => void
onRemoveParticipant?: (participant: TeamParticipant) => void
```

Add member row action button:

```tsx
<button type="button" aria-label={`Member actions for @${participant.displayName}`} aria-haspopup="menu">⋯</button>
```

Menu:

```tsx
<button role="menuitem" type="button" onClick={() => openEditParticipant(participant)}>Edit member</button>
<button role="menuitem" type="button" onClick={() => openRemoveParticipant(participant)}>Remove from Team Chat</button>
```

Edit dialog fields:

- `Team alias` textbox.
- `Role` select: `general`, `backend`, `frontend`, `tests`, `reviewer`, `docs`.
- Color swatches: `#60a5fa`, `#a78bfa`, `#34d399`, `#fbbf24`, `#f87171`, `#22d3ee`, `#fb7185`, `#818cf8`.

Alias validation:

```ts
const duplicateAlias = props.participants.some((item) => item.id !== editing.id && item.displayName.toLowerCase() === normalizedAlias.toLowerCase())
```

- [ ] **Step 4: Wire route handlers**

In `$teamChatId.tsx`:

```tsx
onUpdateParticipant={(participant, patch) => {
    if (!teamChatId) return
    void updateTeamParticipant(teamChatId, participant.id, patch)
}}
onRemoveParticipant={(participant) => {
    if (!teamChatId) return
    void removeTeamParticipant(teamChatId, participant.id, participant.sessionId ?? null)
}}
```

- [ ] **Step 5: Run GREEN tests**

Run:

```bash
bun run --cwd web test src/components/TeamChat/TeamChatRightPanel.test.tsx
bun run typecheck:web
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/TeamChat/TeamChatRightPanel.test.tsx web/src/components/TeamChat/TeamChatRightPanel.tsx web/src/components/TeamChat/TeamChatLayout.tsx 'web/src/routes/team-chats/$teamChatId.tsx'
git commit -m "feat: manage team chat members"
```

---

## Task 7: Composer clarity for Team vs Direct Chat

**Files:**
- Modify: `web/src/components/TeamChat/TeamChatComposer.test.tsx`
- Modify: `web/src/components/TeamChat/TeamChatComposer.tsx`
- Modify: `web/src/components/TeamChat/TeamSessionChatModal.test.tsx`
- Modify: `web/src/components/TeamChat/TeamSessionChatModal.tsx`
- Modify: `web/src/components/SessionChat.tsx`
- Modify: `web/src/components/AssistantChat/HappyComposer.tsx`

- [ ] **Step 1: Write failing Team composer test**

Modify `TeamChatComposer.test.tsx` to assert explicit copy:

```ts
expect(screen.getByPlaceholderText('Message the team. Use @alias to ask a session.')).toBeInTheDocument()
expect(screen.getByText('Team message: visible to everyone in this room.')).toBeInTheDocument()
```

- [ ] **Step 2: Write failing direct modal test**

In `TeamSessionChatModal.test.tsx`, assert mocked `SessionChat` receives:

```ts
expect(sessionChatMock).toHaveBeenCalledWith(expect.objectContaining({
    composerPlaceholder: 'Message @UI directly. This will not post to the Team Chat.'
}))
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
bun run --cwd web test src/components/TeamChat/TeamChatComposer.test.tsx src/components/TeamChat/TeamSessionChatModal.test.tsx
```

Expected: fail because placeholder prop/copy is missing.

- [ ] **Step 4: Implement Team composer copy**

In `TeamChatComposer.tsx`:

```tsx
placeholder="Message the team. Use @alias to ask a session."
```

Helper text:

```tsx
<div className="text-xs text-[var(--app-hint)]">Team message: visible to everyone in this room.</div>
```

- [ ] **Step 5: Add SessionChat placeholder plumbing**

In `SessionChat` props:

```ts
composerPlaceholder?: string
```

Pass to `HappyComposer`:

```tsx
placeholder={props.composerPlaceholder}
```

In `HappyComposer` props:

```ts
placeholder?: string
```

Use:

```tsx
placeholder={props.placeholder ?? (showContinueHint ? t('misc.typeMessage') : t('misc.typeAMessage'))}
```

- [ ] **Step 6: Pass direct placeholder from modal**

In `TeamSessionChatModal.tsx`:

```tsx
composerPlaceholder={`Message @${props.alias} directly. This will not post to the Team Chat.`}
```

- [ ] **Step 7: Run GREEN tests**

Run:

```bash
bun run --cwd web test src/components/TeamChat/TeamChatComposer.test.tsx src/components/TeamChat/TeamSessionChatModal.test.tsx
bun run typecheck:web
```

Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/TeamChat/TeamChatComposer.test.tsx web/src/components/TeamChat/TeamChatComposer.tsx web/src/components/TeamChat/TeamSessionChatModal.test.tsx web/src/components/TeamChat/TeamSessionChatModal.tsx web/src/components/SessionChat.tsx web/src/components/AssistantChat/HappyComposer.tsx
git commit -m "feat: clarify team chat composers"
```

---

## Task 8: Final verification and regression checklist

**Files:**
- No production files expected unless fixes required.

- [ ] **Step 1: Run formatting/diff check**

```bash
git diff --check
```

Expected: no output, exit 0.

- [ ] **Step 2: Run full typecheck**

```bash
bun run typecheck
```

Expected: cli/web/hub typecheck all pass.

- [ ] **Step 3: Run full test suite**

```bash
bun run test
```

Expected: all existing tests pass. Existing skipped integration tests may remain skipped.

- [ ] **Step 4: Manual UX smoke checklist**

Ask user to rebuild/restart manually, then verify:

```text
/team-chats:
- Can create standalone room.
- New room opens and shows guidance to add sessions.
- List card action menu can rename room.
- List card action menu can archive room.
- Archive confirm says sessions are not deleted.

/team-chats/:id:
- Header action menu can rename room.
- Header action menu can archive room and returns to list.
- Member panel can add session.
- Member row can edit alias/role/color.
- Member row can remove session member.
- Removing member does not delete underlying session.

Direct modal:
- Click member opens full direct chat.
- Composer placeholder says direct message does not post to Team Chat.

Regression:
- Agent Mode opens normally.
- Editor Mode opens normally.
- Existing Session Chat send still works.
```

- [ ] **Step 5: Final commit if verification fixes were made**

If fixes were needed:

```bash
git add <changed files>
git commit -m "fix: stabilize team chat ux polish"
```

---

## Risk checklist

- **Alias race/duplicate:** backend duplicate guard remains authoritative. UI duplicate guard only improves feedback.
- **Archived room references:** existing archived room links may 404. This is acceptable for this batch; future batch should add archived-room read state.
- **Direct chat confusion:** placeholder + modal header both state direct-only.
- **Agent/Editor regressions:** only shared change is optional composer placeholder prop; default behavior must remain unchanged when prop omitted.
- **Member removal:** archive participant only; do not delete sessions or session messages.

## Self-review

- Spec coverage: all agreed UX items have tasks: rename/archive/member edit/remove/empty state/placeholders.
- Placeholder scan: no TBD/TODO markers.
- Type consistency: `updateTeamChat`, `updateTeamParticipant`, `removeTeamParticipant`, `renameTeamChat` are introduced before UI tasks use them.
- Scope: focused UX lifecycle polish; no restore/search/unread implementation in this plan.
