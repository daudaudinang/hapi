# Story 1.4 Shared SessionTerminalTabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-session terminal UI in modal/editor/route with shared `SessionTerminalTabs` backed by CLI terminal list, while keeping close/unmount detach-only and machine terminals legacy.

**Architecture:** Keep `useTerminalSocket` as terminal Socket.IO boundary, extend it with session-scope list/subscribe/create/write/resize/close-one APIs, and expose a session controller consumed by `SessionTerminalTabs`. Modal, session route, and session editor terminal render the same component. Machine/project editor terminal continues existing single-terminal path until Story 1.5 regression sweep.

**Tech Stack:** React, TypeScript strict, Socket.IO client, xterm, Vitest/Testing Library, shared `@hapi/protocol` terminal types.

---

## File Map

| File | Role | Change |
|---|---|---|
| `web/src/hooks/useTerminalSocket.ts` | Terminal socket boundary | Add typed session list/subscribe/keepalive/close-one support; keep legacy single terminal API for machine/project; no close-all export. |
| `web/src/components/Terminal/SessionTerminalTabs.tsx` | Shared session UI | New shared tabs/count/lifecycle hint/close confirm/closed-lost CTA/TerminalView integration. |
| `web/src/components/Terminal/SessionTerminalTabs.test.tsx` | Shared UI tests | New tests for count 0-3, max disabled, close-one confirm, detach-only cleanup, closed/lost CTA, replay attach. |
| `web/src/components/modals/TerminalModal.tsx` | Session terminal modal | Replace bespoke single terminal body with `SessionTerminalTabs`. |
| `web/src/components/modals/TerminalModal.test.tsx` | Modal integration tests | New/updated tests prove modal uses shared tabs and unmount detach-only. |
| `web/src/routes/sessions/terminal.tsx` | Session terminal route | Replace bespoke single terminal body with `SessionTerminalTabs`. |
| `web/src/routes/sessions/terminal.test.tsx` | Route integration tests | Update tests: unmount detach-only, not close; shared tabs renders. |
| `web/src/components/editor/EditorTerminal.tsx` | Editor terminal panel | For tabs with `sessionId`, render `SessionTerminalTabs`; for `machineId`, keep legacy body. |
| `web/src/components/editor/EditorTerminal.test.tsx` | Editor integration tests | Update tests for session tabs using shared component; machine path still legacy. |
| `web/src/components/editor/EditorLayout.tsx` | Editor runtime cleanup | Stop calling destructive close for session terminals on pagehide/project switch; use detach/disconnect for session tabs; keep machine/project legacy cleanup. |
| `web/src/components/editor/EditorLayout.test.tsx` | Cleanup tests | Update pagehide/project switch tests to assert session terminal detach path, machine close legacy path. |

## Critical Non-Negotiables

- UI close/unmount/pagehide/route/modal close must not emit `terminal:close` for session terminals; they only disconnect/detach socket view.
- User explicit tab close after confirm is only `terminal:close` path for session terminals.
- `close-all` never appears in web hook API.
- Session tabs use CLI list as source of truth; local optimistic state may exist only to select newly requested terminal. Task 0 CLI list bridge is required before UI work.
- Max create is UI guard only; CLI remains source of truth.
- Machine/project editor terminals keep existing single-terminal behavior for this wave. Session editor scope renders one shared component per session, not one shared component inside each legacy terminal tab body.


## Task 0: Preflight CLI session list bridge

**Files:**
- Modify: `cli/src/api/apiSession.ts`
- Modify: `cli/src/api/apiSession.test.ts`

- [ ] **Step 1: Add failing CLI socket bridge tests**

Add tests proving session client handles hub requests:

```ts
it('emits terminal list when hub requests session terminal list', async () => {
    // mock TerminalManager.list() returns two TerminalState records
    // trigger socket server event `terminal:list` { scopeType:'session', sessionId }
    // expect client emits `terminal:list` { scopeType:'session', sessionId, terminals }
})

it('handles keepalive without shell input and re-emits updated list', async () => {
    // trigger `terminal:keepalive` { scopeType:'session', sessionId, terminalId }
    // expect TerminalManager.keepalive or equivalent activity reset called if available
    // If manager has no keepalive yet, document gap and implement minimal method in TerminalManager with no shell write.
})
```

- [ ] **Step 2: Implement list handler**

In `ApiSessionClient`, import `TerminalListRequestSchema` and `TerminalKeepalivePayloadSchema`. Add handlers after terminal detach:

```ts
this.socket.on('terminal:list', (data) => {
    const parsed = TerminalListRequestSchema.safeParse(data)
    if (!parsed.success || parsed.data.scopeType !== 'session' || parsed.data.sessionId !== this.sessionId) return
    this.socket.emit('terminal:list', {
        scopeType: 'session',
        sessionId: this.sessionId,
        terminals: this.terminalManager.list()
    })
})

this.socket.on('terminal:keepalive', (data) => {
    const parsed = TerminalKeepalivePayloadSchema.safeParse(data)
    if (!parsed.success || parsed.data.scopeType !== 'session' || parsed.data.sessionId !== this.sessionId) return
    this.terminalManager.keepalive?.(parsed.data.terminalId)
    this.socket.emit('terminal:list', {
        scopeType: 'session',
        sessionId: this.sessionId,
        terminals: this.terminalManager.list()
    })
})
```

If `TerminalManager.keepalive` does not exist yet, add a minimal no-shell-input method in `cli/src/terminal/TerminalManager.ts` that refreshes `lastActivityAt` for Story 1.4; Story 2.1 will own full idle policy semantics.

- [ ] **Step 3: Verify preflight**

Run:

```bash
cd cli && bun test src/api/apiSession.test.ts src/terminal/TerminalManager.test.ts
```

Expected: pass. Do not start web implementation until list bridge passes.

## Task 1: Extend terminal hook contract with session list controller

**Files:**
- Modify: `web/src/hooks/useTerminalSocket.ts`

- [ ] **Step 1: Import shared terminal types**

Add imports:

```ts
import type {
    TerminalListPayload,
    TerminalState,
    TerminalWarningPayload
} from '@hapi/protocol'
```

- [ ] **Step 2: Add controller types**

Add exported types:

```ts
export type TerminalScope =
    | { scopeType: 'session'; sessionId: string }
    | { scopeType: 'machine'; machineId: string }

export type SessionTerminalController = {
    state: TerminalConnectionState
    terminals: TerminalState[]
    connect: () => void
    disconnect: () => void
    subscribe: () => void
    create: (input: { terminalId: string; cols: number; rows: number; cwd?: string; replay?: boolean }) => void
    write: (terminalId: string, data: string) => void
    resize: (terminalId: string, cols: number, rows: number) => void
    closeOne: (terminalId: string) => void
    keepalive: (terminalId: string) => void
    onOutput: (handler: (terminalId: string, data: string) => void) => void
    onExit: (handler: (terminalId: string, code: number | null, signal: string | null) => void) => void
    onWarning: (handler: (payload: TerminalWarningPayload) => void) => void
}
```

- [ ] **Step 3: Add `useSessionTerminalSocket` without removing legacy `useTerminalSocket`**

Implement new hook in same file:

```ts
export function useSessionTerminalSocket(options: {
    baseUrl: string
    token: string
    sessionId: string
}): SessionTerminalController {
    // manager/socket setup same `/terminal` namespace as existing hook.
    // On connect: emit `terminal:subscribe` with { scopeType:'session', sessionId }.
    // On disconnect(): remove listeners + socket.disconnect(); must not emit `terminal:close`.
    // On terminal:list: set terminals from payload if scope/session matches.
    // On terminal:output/ready/exit/error: route by terminalId to callbacks; do not store raw output.
    // create(): emit `terminal:create` legacy payload { sessionId, terminalId, cols, rows, replay, cwd? }.
    // closeOne(): emit typed { scopeType:'session', sessionId, terminalId }.
    // keepalive(): emit typed keepalive.
}
```

Implementation requirements:
- Keep `terminals` metadata only; never store raw output.
- `disconnect()` must be detach-only.
- No exported `closeAll` or `close-all` method/string.
- Existing `useTerminalSocket` API remains source-compatible for machine/project and current tests.

- [ ] **Step 4: Red tests are UI-level for hook behavior**

No isolated hook test required in this story if UI tests mock hook. If worker adds hook tests, cover:
- subscribe emits typed scope on connect.
- closeOne emits typed close.
- disconnect does not emit close.

## Task 2: Create shared `SessionTerminalTabs`

**Files:**
- Create: `web/src/components/Terminal/SessionTerminalTabs.tsx`
- Create: `web/src/components/Terminal/SessionTerminalTabs.test.tsx`

- [ ] **Step 1: Write failing tests**

Test mock `useSessionTerminalSocket` and `TerminalView`.

Required tests:

```ts
it('renders lifecycle hint and count n/3 from CLI list', () => {
    // terminals=[running t1, detached t2]
    // expect text '2/3'
    // expect hint 'Closing this window only detaches'
})

it('disables plus at 3/3 with clear copy', () => {
    // terminals=[t1,t2,t3 live]
    // plus disabled
    // expect 'Close an existing terminal before creating another.'
})

it('does not expose or emit close-all from web hook/controller', () => {
    // expect controller has no closeAll property and emitted events never include terminal:close-all
})

it('unmount disconnects without close-one', () => {
    // render then unmount
    // expect controller.disconnect called
    // expect controller.closeOne not called
})

it('explicit close requires confirm and closes only selected terminal', () => {
    // click close on t2
    // confirm 'Stop process and close'
    // expect closeOne('t2') once, not t1
})

it('renders closed and lost terminal reason with create new CTA', () => {
    // terminals closed_idle/lost
    // expect reason copy and create CTA visible
})
```

- [ ] **Step 2: Implement component**

Public props:

```ts
export type SessionTerminalTabsProps = {
    sessionId: string
    title?: string
    subtitle?: string | null
    active: boolean
    terminalSupported: boolean
    cwd?: string
    compactFontSize?: boolean
    className?: string
}
```

Behavior:
- Calls `useSessionTerminalSocket({ token, baseUrl, sessionId })` using `useAppContext`.
- On mount when active/supported: `connect()`; cleanup: `disconnect()` only.
- Maintains active terminal id.
- Live terminal count = states `running`, `detached`, `warning_idle`, `warning_age`; display `n/3`.
- If list empty and first `TerminalView` resize produces dimensions, create first terminal with generated id and `replay:true`.
- Plus creates new terminal only when live count < 3 and last known size exists. If server/CLI rejects create due race, show error copy and request list refresh; do not optimistic-increment count.
- Terminal output uses per-terminal xterm refs plus bounded per-terminal UI buffer, not raw output in shared/global state.
- Quick keys/paste behavior from modal/route must move into `SessionTerminalTabs` or a shared child; do not silently remove user-visible quick input.
- Empty list bootstrap: render a hidden/empty `TerminalView` or explicit measured container so first resize can create the first terminal.
- Output safety: maintain per-terminal in-memory output buffers in the component while mounted, bounded to a small UI cap (for example 50k chars/terminal), so inactive tab output is not lost before xterm mounts. On reconnect/reopen, rely on CLI bounded replay.
- `TerminalView` may be rendered only for active terminal to reduce xterm cost, but switching active terminal must replay that terminal's UI buffer into xterm.
- Close button opens confirm dialog: title `Stop terminal process?`, body `Stop process and close this terminal tab?`, confirm `Stop process and close`.
- Closed/lost/exited tabs remain visible with reason copy and CTA `Create new terminal`. Copy map: idle timeout, hard timeout, user closed, archive closed, process exited, CLI lost/spawn error. CTA disabled if session inactive/unsupported.
- Lifecycle hint text: `Closing this window only detaches. Terminals live with the session and stop only when you close them, archive the session, or timeout limits apply.`

## Task 3: Replace modal and route with shared tabs

**Files:**
- Modify: `web/src/components/modals/TerminalModal.tsx`
- Create/modify: `web/src/components/modals/TerminalModal.test.tsx`
- Modify: `web/src/routes/sessions/terminal.tsx`
- Modify: `web/src/routes/sessions/terminal.test.tsx`

- [ ] **Step 1: Simplify `TerminalModal`**

Remove bespoke `TerminalView`, quick keys, random terminalId, and `useTerminalSocket` usage. Keep session loading/unsupported/inactive wrapper. Render:

```tsx
<SessionTerminalTabs
    sessionId={sessionId}
    title="Terminal"
    subtitle={session.metadata?.path ?? sessionId}
    active={Boolean(session?.active)}
    terminalSupported={terminalSupported}
/>
```

- [ ] **Step 2: Simplify `TerminalPage` route**

Remove bespoke single terminal code. Render page header/back button and `SessionTerminalTabs` body with same props.

- [ ] **Step 3: Tests**

Mock `SessionTerminalTabs` and assert:
- modal passes sessionId/active/supported/subtitle.
- route passes sessionId/active/supported/subtitle.
- unmounting modal/route does not call old `close` because `useTerminalSocket` is no longer used there.
- route old test `closes the remote terminal when leaving the page` must become `detaches via shared tabs only` or removed if covered by component test.

## Task 4: Integrate editor session terminals while preserving machine legacy

**Files:**
- Modify: `web/src/components/editor/EditorTerminal.tsx`
- Modify: `web/src/components/editor/EditorTerminal.test.tsx`

- [ ] **Step 1: Branch session vs machine tabs**

Editor integration rule:
- `EditorTerminal` must group session terminal tabs by `sessionId` and render exactly one `SessionTerminalTabs` per active session scope. Do not render a full shared tabs UI inside every legacy editor terminal tab.
- Outer editor terminal tab close for a session terminal only closes/hides the editor UI tab; it must not call session close-one or legacy close. Destructive close lives inside `SessionTerminalTabs` confirm.
- Branch session vs machine before calling legacy `useTerminalSocket`, registering close callbacks, or rendering legacy quick keys.
- Keep current body for `machineId` tabs unchanged.

- [ ] **Step 2: Tests**

Update/add:
- Session tab renders mocked `SessionTerminalTabs` and passes `sessionId`.
- Session tab close button in editor closes UI tab only unless shared component explicit close confirm is used inside tabs. It must not call legacy `close` on tab header close.
- Machine tab still uses legacy `useTerminalSocket` and close function.
- Machine/project quick keys still render.

## Task 5: Make EditorLayout cleanup non-destructive for session terminals

**Files:**
- Modify: `web/src/components/editor/EditorLayout.tsx`
- Modify: `web/src/components/editor/EditorLayout.test.tsx`

- [ ] **Step 1: Register terminal cleanup kind**

Replace `terminalCloseFnsRef` with entries carrying scope kind if needed:

```ts
type TerminalCleanupEntry = { scope: 'session' | 'machine'; cleanup: () => void }
```

If `EditorTerminal` no longer registers session destructive close, simpler patch is:
- Keep registry only for machine legacy closes.
- Ensure pagehide/project switch no longer invokes session close callbacks.

- [ ] **Step 2: Tests**

Update old tests:
- Pagehide clears persisted editor state but does not close session terminal process.
- Project switch keeps existing machine close behavior.
- If tests use mock close registration, register machine-specific close for legacy path.

## Task 6: Verification sweep for Story 1.4

Run:

```bash
cd cli && bun test src/api/apiSession.test.ts src/terminal/TerminalManager.test.ts
cd ../web && bun run test -- src/components/Terminal/SessionTerminalTabs.test.tsx src/components/modals/TerminalModal.test.tsx src/components/editor/EditorTerminal.test.tsx src/components/editor/EditorLayout.test.tsx src/routes/sessions/terminal.test.tsx
cd /home/huynq/notebooks/hapi && bun run typecheck
```

Expected:
- Focused web tests pass.
- Typecheck passes.

## Self-Review Checklist

- Modal/editor/route all use `SessionTerminalTabs` for session terminals.
- Unmount/pagehide/route close does not call session `terminal:close`.
- Explicit close-one uses typed scope and one terminal id.
- Max 3 UI guard and count visible.
- Closed/lost state remains visible with reason + CTA.
- Hook exposes no `closeAll` or `terminal:close-all` API.
- Machine/project terminal legacy behavior remains routed through old single-terminal path.
