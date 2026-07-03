# Story 2.3 Idle/Age Warning UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show session terminal idle/age warnings, provide a “Keep terminal” action, and show idle/age closed reasons with create-new CTA.

**Architecture:** `SessionTerminalTabs` stays shared UI for modal/route/editor session terminals. CLI/hub remain source of truth; UI renders from `TerminalState` list plus `terminal:warning` event, sends typed `terminal:keepalive`, never writes keepalive into shell. Existing machine terminal behavior remains untouched.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, HAPI i18n locales (`en`, `vi-VN`, `zh-CN`).

---

## Files

- Modify: `web/src/components/Terminal/SessionTerminalTabs.tsx`
  - Render warning banner for selected live terminal.
  - Render warning badge in tab.
  - Add keep terminal button using `controller.keepalive(terminalId)`.
  - Render localized closed idle/age/lost/archive copy and create CTA.
  - Replace hard-coded strings with translation keys for lifecycle strings touched in this story.
- Modify: `web/src/components/Terminal/SessionTerminalTabs.test.tsx`
  - Add tests for warning event, warning from list state, keepalive action, closed idle/age CTA, locale key coverage via mocked `t`.
- Modify: `web/src/hooks/useTerminalSocket.ts`
  - Ensure `terminal:warning` updates local terminal state if list refresh has not arrived yet.
  - Ensure keepalive emits only `terminal:keepalive`, not `terminal:write`.
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/vi-VN.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

## Task 1: Warning state model in web controller

**Files:**
- Modify: `web/src/hooks/useTerminalSocket.ts`

- [ ] Add local warning merge in `terminal:warning` handler:

```ts
socket.on('terminal:warning', (payload: TerminalWarningPayload) => {
    if (!isSessionPayload(payload)) return
    setTerminals((current) => current.map((terminal) => {
        if (terminal.terminalId !== payload.terminalId) return terminal
        return {
            ...terminal,
            status: payload.reason === 'idle' ? 'warning_idle' : 'warning_age',
            idleWarningAt: payload.reason === 'idle' ? Date.now() : terminal.idleWarningAt
        }
    }))
    warningHandlerRef.current(payload)
})
```

Do not add output data to state. Do not emit keepalive here.

- [ ] Keep existing `keepalive()` unchanged except confirm payload is typed and only emits `terminal:keepalive` + list request:

```ts
socket.emit('terminal:keepalive', { scopeType: 'session', sessionId: sessionIdRef.current, terminalId })
emitListRequest(socket)
```

## Task 2: Warning banner, tab badge, keep terminal action

**Files:**
- Modify: `web/src/components/Terminal/SessionTerminalTabs.tsx`

- [ ] Import translation:

```ts
import { useTranslation } from '@/lib/use-translation'
```

- [ ] Add helpers:

```ts
function warningReason(terminal: TerminalState): 'idle' | 'age' | null {
    if (terminal.status === 'warning_idle') return 'idle'
    if (terminal.status === 'warning_age') return 'age'
    return null
}
```

- [ ] In component call `const { t } = useTranslation()`.

- [ ] Replace lifecycle hint/count/error/closed strings touched by story with keys:

```ts
terminal.lifecycle.hint
terminal.limit.full
terminal.new
terminal.close.confirmTitle
terminal.close.confirmDescription
terminal.close.confirmAction
terminal.keep
terminal.warning.idle
terminal.warning.age
terminal.warning.badge.idle
terminal.warning.badge.age
terminal.closed.idle
terminal.closed.age
terminal.closed.user
terminal.closed.archive
terminal.closed.exited
terminal.closed.lost
terminal.closed.spawn
terminal.closed.generic
terminal.createNew
terminal.unsupported
terminal.inactive
```

- [ ] Render selected warning banner above terminal body:

```tsx
const activeWarning = activeLiveTerminal ? warningReason(activeLiveTerminal) : null
...
{activeWarning ? (
    <div role="status" className="...">
        <span>{t(activeWarning === 'idle' ? 'terminal.warning.idle' : 'terminal.warning.age')}</span>
        {activeWarning === 'idle' ? (
            <button type="button" onClick={() => controller.keepalive(activeLiveTerminal.terminalId)}>
                {t('terminal.keep')}
            </button>
        ) : null}
    </div>
) : null}
```

Age warning may still show keep button if product wants, but safer story interpretation: keepalive only helps idle; hard age cannot be extended. So only idle banner gets keep button.

- [ ] Render tab badge:

```tsx
const warning = warningReason(terminal)
{warning ? <span aria-label={t(warning === 'idle' ? 'terminal.warning.badge.idle' : 'terminal.warning.badge.age')}>⚠</span> : null}
```

- [ ] Closed state copy uses localized `closeReasonCopy(terminal, t)` and supports `closed_idle`/`closed_age` even if `closeReason` null by checking `status`.

## Task 3: Locale keys

**Files:**
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/vi-VN.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] Add matching keys in all three files. English canonical:

```ts
' terminal.lifecycle.hint': 'Closing this window only detaches. Terminals live with the session and stop only when you close them, archive the session, or timeout limits apply.',
```

Use exact key without leading space in implementation:

```ts
'terminal.lifecycle.hint': 'Closing this window only detaches. Terminals live with the session and stop only when you close them, archive the session, or timeout limits apply.',
'terminal.limit.full': 'Close an existing terminal before creating another.',
'terminal.new': 'New terminal',
'terminal.close.confirmTitle': 'Stop terminal process?',
'terminal.close.confirmDescription': 'Stop process and close this terminal tab?',
'terminal.close.confirmAction': 'Stop process and close',
'terminal.keep': 'Keep terminal',
'terminal.warning.idle': 'Terminal is idle and will stop soon unless activity resumes.',
'terminal.warning.age': 'Terminal is near its maximum lifetime and will stop soon.',
'terminal.warning.badge.idle': 'Idle warning',
'terminal.warning.badge.age': 'Age warning',
'terminal.closed.idle': 'Closed after idle timeout.',
'terminal.closed.age': 'Closed after hard timeout.',
'terminal.closed.user': 'Closed by user.',
'terminal.closed.archive': 'Closed because session was archived.',
'terminal.closed.exited': 'Process exited.',
'terminal.closed.lost': 'CLI connection was lost.',
'terminal.closed.spawn': 'CLI could not spawn this terminal.',
'terminal.closed.generic': 'Terminal is closed.',
'terminal.createNew': 'Create new terminal',
'terminal.unsupported': 'Remote terminal is not supported on this host.',
'terminal.inactive': 'Session is inactive. Terminal is unavailable.'
```

- [ ] Translate same keys into Vietnamese and Chinese. Ensure no key missing.

## Task 4: Tests

**Files:**
- Modify: `web/src/components/Terminal/SessionTerminalTabs.test.tsx`

- [ ] Extend test translation mock to return English values for new keys.

- [ ] Add helper support:

```ts
function state(id: string, status: TerminalState['status'] = 'running', closeReason: TerminalState['closeReason'] = null): TerminalState
```

Already exists; use it.

- [ ] Add warning-from-list test:

```ts
it('renders idle warning banner and tab badge from terminal list state', () => {
    mocks.controller = makeController([state('t1', 'warning_idle')])
    renderTabs()
    expect(screen.getByRole('status')).toHaveTextContent('Terminal is idle')
    expect(screen.getByLabelText('Idle warning')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep terminal' })).toBeInTheDocument()
})
```

- [ ] Add warning-event test by capturing `onWarning` handler:

```ts
it('renders warning after terminal warning event before list refresh', () => {
    mocks.controller = makeController([state('t1', 'running')])
    const rendered = renderTabs()
    const handler = mocks.controller.onWarning.mock.calls.at(-1)?.[0]
    handler?.({ scopeType: 'session', sessionId: 'session-1', terminalId: 't1', reason: 'idle', message: 'ignored raw message', closesAt: 9 })
    mocks.controller = { ...mocks.controller, terminals: [state('t1', 'warning_idle')] }
    rendered.rerender(<SessionTerminalTabs sessionId="session-1" active terminalSupported />)
    expect(screen.getByRole('status')).toHaveTextContent('Terminal is idle')
})
```

Preferred: component can maintain local warnings from `onWarning`, not only hook merge. If hook merge is enough, use hook tests instead. Simpler for this story: component registers `onWarning` and local warning map so event test does not require real hook state.

- [ ] Add keepalive action test:

```ts
fireEvent.click(screen.getByRole('button', { name: 'Keep terminal' }))
expect(mocks.controller.keepalive).toHaveBeenCalledWith('t1')
expect(mocks.controller.write).not.toHaveBeenCalled()
```

- [ ] Add age warning test: banner + age badge, no keep button or disabled keep.

- [ ] Add closed idle/age CTA test:

```ts
mocks.controller = makeController([state('idle-old', 'closed_idle', 'idle_timeout'), state('age-old', 'closed_age', 'hard_timeout')])
expect(screen.getByText('Closed after idle timeout.')).toBeInTheDocument()
expect(screen.getByText('Closed after hard timeout.')).toBeInTheDocument()
expect(screen.getAllByRole('button', { name: 'Create new terminal' })).toHaveLength(2)
```

- [ ] Add locale key coverage test in same test file or new locale test:

```ts
import { en, viVN, zhCN } from '@/lib/locales'
const keys = [...]
for (const key of keys) {
    expect(en[key]).toBeTruthy()
    expect(viVN[key]).toBeTruthy()
    expect(zhCN[key]).toBeTruthy()
}
```

## Task 5: Verification

Run:

```bash
cd web && bun run test -- src/components/Terminal/SessionTerminalTabs.test.tsx
cd web && bun run typecheck
bun run typecheck
```

Expected: pass.

Optional wider web focused checks if affected:

```bash
cd web && bun run test -- src/components/modals/TerminalModal.test.tsx src/components/editor/EditorTerminal.test.tsx src/routes/sessions/terminal.test.tsx
```

## BMAD risk checklist

- Warning event lost before list refresh: component or hook must reflect it.
- Keep terminal must emit keepalive only; must not write shell input.
- Age warning cannot extend 24h hard lifetime; copy should not imply it can.
- Closed idle/age reason must render when user returns later from list state.
- Locale keys must exist in `en`, `vi-VN`, `zh-CN`.
- Machine/project terminal path must not be modified.
- UI must still use shared `SessionTerminalTabs` for modal/editor/route.

---

## BMAD party review patch — must implement before coding

Review result: RED until these corrections are applied.

### Source of truth decision

- `useSessionTerminalSocket` owns warning merge into `terminals`.
- `SessionTerminalTabs` renders warnings only from `TerminalState.status` / `closeReason`.
- Do **not** add component-local warning map.
- `terminal:warning` handler must never render/use `payload.message`; use localized fixed copy.

### Warning merge guard

Add helper in `useTerminalSocket.ts`:

```ts
const LIVE_STATUSES = new Set<TerminalState['status']>(['running', 'detached', 'warning_idle', 'warning_age'])

function warningStatus(reason: TerminalWarningPayload['reason']): TerminalState['status'] {
    return reason === 'idle' ? 'warning_idle' : 'warning_age'
}
```

In `terminal:warning` handler:

```ts
socket.on('terminal:warning', (payload: TerminalWarningPayload) => {
    if (!isSessionPayload(payload)) return
    setTerminals((current) => current.map((terminal) => {
        if (terminal.terminalId !== payload.terminalId) return terminal
        if (!LIVE_STATUSES.has(terminal.status)) return terminal
        return {
            ...terminal,
            status: warningStatus(payload.reason),
            idleWarningAt: payload.reason === 'idle' ? Date.now() : terminal.idleWarningAt
        }
    }))
    warningHandlerRef.current(payload)
})
```

This must not revive `closed_*`, `lost`, or `exited`.

### Required hook/socket tests

Create or modify `web/src/hooks/useTerminalSocket.test.tsx`.

Mock `socket.io-client` `Manager` and capture namespace socket handlers/emits. Tests must prove:

1. Warning event idle updates hook `terminals` to `warning_idle` without list refresh.
2. Warning event age updates to `warning_age`.
3. Wrong session warning ignored.
4. Stale warning for `closed_idle` terminal ignored; closed state not revived.
5. Warning `payload.message = 'token=SECRET'` never appears in `SessionTerminalTabs` UI after hook state update.
6. `keepalive('t1')` emits:
   - `terminal:keepalive` typed payload
   - `terminal:list` typed payload
   - no `terminal:write` event.

If hook testing is expensive, worker may add a focused integration-style component test with mocked real hook socket, but it must verify real socket emits and event handler state update. Pure mocked-controller tests are insufficient for event source-of-truth.

### SessionTerminalTabs active selection rule

Current UI auto-prefers live terminal. Change rule:

- If active terminal remains in `controller.terminals`, keep it selected even if it becomes `closed_idle`/`closed_age`/`lost`.
- Only auto-switch when active terminal is absent from list.
- Initial selection still prefers first live terminal over old closed records.

Add/update tests:

- Initial list `[closed_idle, running]` selects running.
- Selected `t1` changes from running to `closed_idle`; UI shows closed reason + CTA and does not auto-switch to `t2`.
- If `t1` removed from list, UI selects first live `t2`.

### Age warning UX

- Age warning banner copy must use fixed `terminal.warning.age` and mention maximum lifetime/hard limit.
- Do not show `Keep terminal` for `warning_age`.
- Test: age warning has age badge, age copy, and no keep button.

### Keepalive behavior

- Component test: clicking `Keep terminal` calls `controller.keepalive('t1')` and `controller.write` is not called.
- Hook/socket test: `keepalive` emits no `terminal:write`.

### Locale coverage

- Import `{ en, viVN, zhCN }` from `web/src/lib/locales` in test.
- Assert all lifecycle keys listed in Task 3 exist and are non-empty.
- Include dialog/action keys actually used (`button.cancel` may remain existing key; if reused, assert existing key still present in all locales).

### Machine legacy guard

- Do not modify legacy `useTerminalSocket` machine path.
- Verification include `git diff -- web/src/hooks/useTerminalSocket.ts` review: changes limited to `useSessionTerminalSocket` warning merge/keepalive tests.
