# Offline Session Runtime Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow inactive/offline sessions to persist model, Codex collaboration mode, and model reasoning effort changes through existing hub config endpoints.

**Architecture:** Keep existing API endpoints and `engine.applySessionConfig` as persistence path. Remove active-session requirement in hub route guards for config endpoints, then relax web callback gating so composer controls can call same mutations while offline. Dynamic model discovery remains active-only.

**Tech Stack:** TypeScript strict, Hono routes, Bun test runner, React, TanStack Query mutations.

---

## File Map

- Modify: `hub/src/web/routes/sessions.test.ts`
  - Add failing regression tests proving inactive Codex sessions can save collaboration mode, model, and reasoning effort.
- Modify: `hub/src/web/routes/sessions.ts`
  - Remove `{ requireActive: true }` from three runtime config routes.
- Modify: `web/src/components/SessionChat.tsx`
  - Remove `props.session.active` from three composer callback gates.
- Reference only: `docs/superpowers/specs/2026-05-24-offline-session-runtime-config-design.md`
  - Approved behavior spec.

---

### Task 1: Add Hub Regression Tests For Inactive Config Saves

**Files:**
- Modify: `hub/src/web/routes/sessions.test.ts`

- [ ] **Step 1: Insert inactive collaboration mode test after active collaboration mode test**

Add this test immediately after `it('applies collaboration mode changes for remote Codex sessions', ...)`:

```ts
    it('applies collaboration mode changes for inactive remote Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/collaboration-mode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'plan' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { collaborationMode: 'plan' }]
        ])
    })
```

- [ ] **Step 2: Insert inactive reasoning effort test after active Codex reasoning effort test**

Add this test immediately after `it('applies model reasoning effort changes for remote Codex sessions', ...)`:

```ts
    it('applies model reasoning effort changes for inactive remote Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/model-reasoning-effort', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ modelReasoningEffort: 'xhigh' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { modelReasoningEffort: 'xhigh' }]
        ])
    })
```

- [ ] **Step 3: Insert inactive model test after active Codex model test**

Add this test immediately after `it('applies model changes for remote Codex sessions', ...)`:

```ts
    it('applies model changes for inactive remote Codex sessions', async () => {
        const { app, applySessionConfigCalls } = createApp(createSession({ active: false }))

        const response = await app.request('/api/sessions/session-1/model', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-5.5' })
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ ok: true })
        expect(applySessionConfigCalls).toEqual([
            ['session-1', { model: 'gpt-5.5' }]
        ])
    })
```

- [ ] **Step 4: Run tests to verify current failure**

Run:

```bash
bun test hub/src/web/routes/sessions.test.ts
```

Expected before implementation: the three new inactive tests fail with non-200 status caused by active-session requirement.

- [ ] **Step 5: Commit failing tests**

Do not commit if repo policy forbids red commits. If allowed:

```bash
git add hub/src/web/routes/sessions.test.ts
git commit -m "test: cover inactive session runtime config"
```

---

### Task 2: Allow Hub Config Endpoints To Resolve Inactive Sessions

**Files:**
- Modify: `hub/src/web/routes/sessions.ts`

- [ ] **Step 1: Update collaboration mode session lookup**

Find:

```ts
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
```

inside `app.post('/sessions/:id/collaboration-mode', ...)` and replace with:

```ts
        const sessionResult = requireSessionFromParam(c, engine)
```

- [ ] **Step 2: Update model session lookup**

Find:

```ts
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
```

inside `app.post('/sessions/:id/model', ...)` and replace with:

```ts
        const sessionResult = requireSessionFromParam(c, engine)
```

- [ ] **Step 3: Update model reasoning effort session lookup**

Find:

```ts
        const sessionResult = requireSessionFromParam(c, engine, { requireActive: true })
```

inside `app.post('/sessions/:id/model-reasoning-effort', ...)` and replace with:

```ts
        const sessionResult = requireSessionFromParam(c, engine)
```

- [ ] **Step 4: Run hub route tests**

Run:

```bash
bun test hub/src/web/routes/sessions.test.ts
```

Expected: all tests in file pass.

- [ ] **Step 5: Commit hub route fix**

```bash
git add hub/src/web/routes/sessions.ts hub/src/web/routes/sessions.test.ts
git commit -m "fix: allow inactive session runtime config saves"
```

---

### Task 3: Relax Web Composer Callback Gating For Offline Sessions

**Files:**
- Modify: `web/src/components/SessionChat.tsx`

- [ ] **Step 1: Update collaboration mode callback gate**

Find the `HappyComposer` prop:

```tsx
                        onCollaborationModeChange={
                            codexCollaborationModeSupported && props.session.active && !controlledByUser
                                ? handleCollaborationModeChange
                                : undefined
                        }
```

Replace with:

```tsx
                        onCollaborationModeChange={
                            codexCollaborationModeSupported && !controlledByUser
                                ? handleCollaborationModeChange
                                : undefined
                        }
```

- [ ] **Step 2: Update Codex model callback gate**

Find the `HappyComposer` prop:

```tsx
                        onModelChange={
                            agentFlavor === 'codex'
                                ? (props.session.active && !controlledByUser && !codexModelsState.error ? handleModelChange : undefined)
                                : handleModelChange
                        }
```

Replace with:

```tsx
                        onModelChange={
                            agentFlavor === 'codex'
                                ? (!controlledByUser && !codexModelsState.error ? handleModelChange : undefined)
                                : handleModelChange
                        }
```

- [ ] **Step 3: Update reasoning effort callback gate**

Find the `HappyComposer` prop:

```tsx
                        onModelReasoningEffortChange={
                            (agentFlavor === 'codex' || agentFlavor === 'opencode') && props.session.active && !controlledByUser
                                ? handleModelReasoningEffortChange
                                : undefined
                        }
```

Replace with:

```tsx
                        onModelReasoningEffortChange={
                            (agentFlavor === 'codex' || agentFlavor === 'opencode') && !controlledByUser
                                ? handleModelReasoningEffortChange
                                : undefined
                        }
```

- [ ] **Step 4: Verify dynamic model fetch remains active-only**

Confirm these lines are still unchanged near top of `SessionChat`:

```ts
        enabled: agentFlavor === 'codex' && props.session.active && !controlledByUser
```

and:

```ts
        enabled: agentFlavor === 'opencode' && props.session.active
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
bun typecheck
```

Expected: typecheck passes.

- [ ] **Step 6: Commit web gate fix**

```bash
git add web/src/components/SessionChat.tsx
git commit -m "fix: show runtime config controls offline"
```

---

### Task 4: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run focused hub tests**

```bash
bun test hub/src/web/routes/sessions.test.ts
```

Expected: pass.

- [ ] **Step 2: Run full repo tests**

```bash
bun run test
```

Expected: pass.

- [ ] **Step 3: Run full typecheck**

```bash
bun typecheck
```

Expected: pass.

- [ ] **Step 4: Inspect final diff**

```bash
git diff --stat
```

Expected changed files:

```text
docs/superpowers/specs/2026-05-24-offline-session-runtime-config-design.md
docs/superpowers/plans/2026-05-24-offline-session-runtime-config.md
hub/src/web/routes/sessions.ts
hub/src/web/routes/sessions.test.ts
web/src/components/SessionChat.tsx
```

- [ ] **Step 5: Final commit if previous commits were skipped**

```bash
git add docs/superpowers/specs/2026-05-24-offline-session-runtime-config-design.md docs/superpowers/plans/2026-05-24-offline-session-runtime-config.md hub/src/web/routes/sessions.ts hub/src/web/routes/sessions.test.ts web/src/components/SessionChat.tsx
git commit -m "fix: persist offline session runtime config"
```
