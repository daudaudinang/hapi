# Story 3.3 Archive Confirmation Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Archive confirmations warn when session terminals are known/running, without exposing any web close-all path.

**Architecture:** Hub augments `SessionSummary` with optional `terminalLiveCount` from a metadata-only cache fed by CLI `terminal:list`; this keeps detached-running terminals visible without making hub the process source of truth. Web uses one archive-copy helper across SessionList, SessionHeader, MobileEditorLayout, and Dashboard; count is shown only when number is a positive integer.

**Tech Stack:** TypeScript, React, Hono, TanStack Query, Vitest/Bun.

---

## File Structure

- Modify `shared/src/sessionSummary.ts`: add optional `terminalLiveCount?: number` to `SessionSummary`.
- Create `hub/src/socket/terminalSessionState.ts`: metadata-only session terminal list cache fed by CLI `terminal:list`; counts live statuses including `detached`.
- Test `hub/src/socket/terminalSessionState.test.ts`: namespace isolation, detached count, stale CLI disconnect clearing.
- Modify `hub/src/socket/handlers/cli/terminalHandlers.ts`: update cache on valid session `terminal:list`.
- Modify `hub/src/socket/handlers/cli/index.ts`: clear cache for CLI socket on disconnect.
- Modify `hub/src/socket/server.ts`: instantiate/pass cache and return it from socket server factory.
- Modify `hub/src/web/server.ts`: accept optional `getTerminalLiveCount(sessionId, namespace)` dependency and pass it to session routes.
- Modify `hub/src/web/routes/sessions.ts`: use optional counter to enrich summaries from `/api/sessions` only when count is known.
- Modify `hub/src/index.ts`: wire counter from `socketServer.terminalSessionState.countLiveSessionTerminals(sessionId, namespace)`.
- Create `web/src/lib/archiveConfirmation.ts`: localized copy builders for single session and group archive confirmation.
- Test `web/src/lib/archiveConfirmation.test.ts`: count >0, zero/unknown, archive-all total, no raw terminal data.
- Modify `web/src/components/ui/ConfirmDialog.tsx`: render newline descriptions with `whitespace-pre-line`.
- Modify `web/src/components/SessionList.tsx`: use helper for single and group archive dialogs.
- Modify `web/src/components/SessionHeader.tsx`: use helper for compact and normal archive dialogs.
- Modify `web/src/components/editor/MobileEditorLayout.tsx`: use helper for custom mobile confirmation modal.
- Modify `web/src/components/Dashboard/index.tsx`: use helper for `window.confirm` and inline group confirm.
- Modify locales `web/src/lib/locales/en.ts`, `vi-VN.ts`, `zh-CN.ts`: archive terminal-impact strings.
- Test/update `hub/src/web/routes/sessions.test.ts`: `/api/sessions` includes namespace-scoped terminal count when route dependency is present.
- Test/update `web/src/components/SessionHeader.test.tsx`: archive dialog shows terminal impact and count.
- Test/update `web/src/components/SessionList.editor.test.tsx`: item/archive-all dialogs show terminal impact and count.
- Test/update `web/src/components/editor/MobileEditorLayout.test.tsx`: custom modal shows terminal impact and count.
- Test/update `web/src/components/Dashboard/session-context-menu.test.tsx`: dashboard `window.confirm` and group inline confirm include terminal impact.
- Test/update `web/src/lib/archiveConfirmation.test.ts`: no returned copy contains `terminal:close-all` and helper never asks for a web close-all event.

---

### Task 1: Contract and CLI-fed hub summary count

**Files:**
- Modify: `shared/src/sessionSummary.ts`
- Create: `hub/src/socket/terminalSessionState.ts`
- Test: `hub/src/socket/terminalSessionState.test.ts`
- Modify: `hub/src/socket/handlers/cli/terminalHandlers.ts`
- Modify: `hub/src/socket/handlers/cli/index.ts`
- Modify: `hub/src/socket/server.ts`
- Modify: `hub/src/web/server.ts`
- Modify: `hub/src/web/routes/sessions.ts`
- Modify: `hub/src/index.ts`
- Test: `hub/src/web/routes/sessions.test.ts`

- [ ] **Step 1: Add failing route test**

Add `terminalSessionState.test.ts` verifying CLI `terminal:list` counts `running`, `detached`, `warning_idle`, `warning_age`; ignores closed states; isolates namespaces; clears by CLI socket. Add route tests that create `createSessionsRoutes(() => engine, { getTerminalLiveCount })`, authenticate namespace `ns-a`, and expect active session summary to contain `terminalLiveCount: 2`. Add another route test where counter returns `undefined` and summary omits `terminalLiveCount`.

Run: `cd hub && bun test src/socket/terminalSessionState.test.ts src/web/routes/sessions.test.ts`
Expected: FAIL because `createSessionsRoutes` has no second argument and summaries are not enriched.

- [ ] **Step 2: Add optional summary field and route dependency**

Create `TerminalSessionStateStore` and wire it into CLI terminal handlers before summary route wiring. In `shared/src/sessionSummary.ts`, add:

```ts
terminalLiveCount?: number
```

to `SessionSummary`.

In `hub/src/web/routes/sessions.ts`, change signature to:

```ts
export type SessionsRoutesOptions = {
    getTerminalLiveCount?: (sessionId: string, namespace: string) => number | undefined
}

export function createSessionsRoutes(getSyncEngine: () => SyncEngine | null, options: SessionsRoutesOptions = {}): Hono<WebAppEnv> {
```

Then map summaries:

```ts
.map((session) => {
    const summary = toSessionSummary(session)
    const terminalLiveCount = options.getTerminalLiveCount?.(session.id, namespace)
    return Number.isFinite(terminalLiveCount) && terminalLiveCount !== undefined
        ? { ...summary, terminalLiveCount }
        : summary
})
```

In `hub/src/web/server.ts`, add `getTerminalLiveCount?: (sessionId: string, namespace: string) => number | undefined` to server options and pass it to `createSessionsRoutes`.

In `hub/src/index.ts`, pass:

```ts
getTerminalLiveCount: (sessionId, namespace) => socketServer.terminalSessionState.countLiveSessionTerminals(sessionId, namespace)
```

- [ ] **Step 3: Verify hub route test**

Run: `cd hub && bun test src/socket/terminalSessionState.test.ts src/web/routes/sessions.test.ts`
Expected: PASS.

---

### Task 2: Web archive copy helper and locales

**Files:**
- Create: `web/src/lib/archiveConfirmation.ts`
- Create: `web/src/lib/archiveConfirmation.test.ts`
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/vi-VN.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] **Step 1: Add failing helper tests**

Tests assert:
- `getArchiveSessionDescription(t, { name:'Build', terminalLiveCount:2 })` contains base archive text, terminal impact text, and `Running terminals: 2/3`.
- Count `0`, `undefined`, `NaN`, and negative do not include `Running terminals`.
- `getArchiveAllDescription` with sessions `[2, undefined, 1]` includes total count `3` but does not invent per-session `n/3`.

Run: `cd web && bun test src/lib/archiveConfirmation.test.ts`
Expected: FAIL because helper absent.

- [ ] **Step 2: Implement helper**

Implement:

```ts
const MAX_SESSION_TERMINALS = 3

export function getKnownLiveTerminalCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

export function getArchiveSessionDescription(t, input) {
    const lines = [t('dialog.archive.description', { name: input.name })]
    const count = getKnownLiveTerminalCount(input.terminalLiveCount)
    if (count !== null) {
        lines.push(t('dialog.archive.terminalImpact'))
        lines.push(t('dialog.archive.terminalCount', { n: count, max: MAX_SESSION_TERMINALS }))
    }
    return lines.join('\n')
}
```

Also implement `getArchiveAllDescription(t, { sessionCount, terminalLiveCount })` with base `dialog.archiveAll.description`, optional `dialog.archiveAll.terminalImpact`, and optional `dialog.archiveAll.terminalCount`.

- [ ] **Step 3: Add locale strings**

Add keys in en/vi/zh:

```ts
'dialog.archive.terminalImpact': 'Archiving will stop all running terminals in this session.',
'dialog.archive.terminalCount': 'Running terminals: {n}/{max}',
'dialog.archiveAll.terminalImpact': 'Archiving these sessions will stop their running terminals.',
'dialog.archiveAll.terminalCount': 'Running terminals: {n}',
```

Use equivalent Vietnamese and Chinese translations.

- [ ] **Step 4: Verify helper tests**

Run: `cd web && bun test src/lib/archiveConfirmation.test.ts`
Expected: PASS.

---

### Task 3: Wire helper through all archive entry points

**Files:**
- Modify: `web/src/components/ui/ConfirmDialog.tsx`
- Modify: `web/src/components/SessionList.tsx`
- Modify: `web/src/components/SessionHeader.tsx`
- Modify: `web/src/components/editor/MobileEditorLayout.tsx`
- Modify: `web/src/components/Dashboard/index.tsx`
- Test: `web/src/components/editor/MobileEditorLayout.test.tsx`

- [ ] **Step 1: Add failing mobile modal test**

Add tests in `SessionHeader.test.tsx`, `SessionList.editor.test.tsx`, `MobileEditorLayout.test.tsx`, and `Dashboard/session-context-menu.test.tsx` that open archive confirmation paths and expect terminal-impact copy plus counts when provided.

Run: `cd web && bun test src/components/SessionHeader.test.tsx src/components/SessionList.editor.test.tsx src/components/editor/MobileEditorLayout.test.tsx src/components/Dashboard/session-context-menu.test.tsx`
Expected: FAIL because archive paths still use static copy.

- [ ] **Step 2: Update UI entry points**

- `ConfirmDialog`: add `whitespace-pre-line` to description class.
- `SessionList`: use `getArchiveSessionDescription` and `getArchiveAllDescription`.
- `SessionHeader`: use `getArchiveSessionDescription` in both compact and normal confirm.
- `MobileEditorLayout`: use `useTranslation`; archive modal text uses `getArchiveSessionDescription`.
- `Dashboard`: single `window.confirm` uses session title and `getArchiveSessionDescription`; group inline confirm uses `getArchiveAllDescription`.

- [ ] **Step 3: Verify web focused tests**

Run:

```bash
cd web && bun test src/lib/archiveConfirmation.test.ts src/components/SessionHeader.test.tsx src/components/SessionList.editor.test.tsx src/components/editor/MobileEditorLayout.test.tsx src/components/Dashboard/session-context-menu.test.tsx
```

Expected: PASS.

---

### Task 4: Safety verification

**Files:**
- No additional source unless tests fail.

- [ ] **Step 1: Verify no web close-all event**

Run helper/unit test assertion plus grep:

```bash
cd web && bun test src/lib/archiveConfirmation.test.ts
rg "terminal:close-all" web/src
```

Expected: helper test passes and grep returns no matches.

- [ ] **Step 2: Run focused verification**

Run:

```bash
cd hub && bun test src/socket/terminalSessionState.test.ts src/web/routes/sessions.test.ts
cd web && bun test src/lib/archiveConfirmation.test.ts src/components/SessionHeader.test.tsx src/components/SessionList.editor.test.tsx src/components/editor/MobileEditorLayout.test.tsx src/components/Dashboard/session-context-menu.test.tsx
bun run typecheck
```

Expected: all exit 0.
