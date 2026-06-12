# Focus Existing Pinned Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the duplicate Focus session modal with a one-instance focus overlay that visually expands the existing pinned `SessionChat`, preserving composer text, messages, scroll/cache, and attachment state.

**Architecture:** Keep `PinnedPanel` mounted exactly once per pinned session. Dashboard owns a `focusedPinnedSessionId`; when set, it applies focused CSS classes to the existing pinned panel and renders only a backdrop, not another `SessionChat`. The existing compact header Focus button and double-click behavior stay, but they now expand the same panel instance instead of creating `FocusedSessionChatModal`.

**Tech Stack:** React 19, TypeScript strict, TanStack Query, Vitest + Testing Library, CSS in `Dashboard/dashboard.css`, Bun commands from repo root/package root.

---

## Business / system flow

Current broken flow:

```text
Pinned SessionChat A is mounted
Focus opens FocusedSessionChatModal with another SessionChat A'
A and A' have separate composer runtime state
A' unmount clears shared message window for A
```

New flow:

```text
Pinned SessionChat A is mounted
Focus sets focusedPinnedSessionId = A.id
Dashboard applies focused overlay CSS to the existing panel that already contains A
Close clears focusedPinnedSessionId
SessionChat A never unmounts during focus open/close
```

This specifically fixes:

- Unsaved prompt text not appearing in focus view, because the same composer remains mounted.
- Chat disappearing after closing focus, because no second `useMessages(sessionId)` subscriber is created and unmounted.

---

## File structure and responsibilities

| File | Responsibility in this change |
|---|---|
| `web/src/components/Dashboard/index.tsx` | Remove duplicate modal render. Rename state to `focusedPinnedSessionId`. Apply focused classes/backdrop to existing pinned panel. Add Escape close and close when focused session is unpinned/resolved. |
| `web/src/components/Dashboard/session-context-menu.test.tsx` | Replace mock modal test with tests that prove the same pinned panel instance is expanded and remains mounted after close. |
| `web/src/components/Dashboard/dashboard.css` | Add backdrop and fixed-position focused panel styles; mobile must remain unaffected. |
| `web/src/components/FocusedSessionChatModal.tsx` | Delete obsolete duplicate-session modal. |
| `web/src/components/FocusedSessionChatModal.test.tsx` | Delete obsolete modal tests. |
| `web/src/components/SessionHeader.tsx` | No functional change expected. Existing Focus button/double-click callback stays. Only touch if tests reveal label/click issues. |
| `web/src/components/SessionChat.tsx` | No functional change expected. Existing `onFocusSession` prop stays. |

Do not modify backend, hub, cli, shared schemas, or API contracts.

---

## Task 1: Replace duplicate modal with focused existing panel

**Files:**
- Modify: `web/src/components/Dashboard/index.tsx`
- Modify: `web/src/components/Dashboard/session-context-menu.test.tsx`
- Modify: `web/src/components/Dashboard/dashboard.css`
- Modify only if helper reuse is preferred: `web/src/hooks/useMediaQuery.ts`
- Delete: `web/src/components/FocusedSessionChatModal.tsx`
- Delete: `web/src/components/FocusedSessionChatModal.test.tsx`

- [ ] **Step 1: Write failing dashboard tests for one-instance focus**

In `web/src/components/Dashboard/session-context-menu.test.tsx`, remove this mock completely:

```tsx
vi.mock('@/components/FocusedSessionChatModal', () => ({
    FocusedSessionChatModal: (props: { sessionId: string; onClose: () => void }) => (
        <div role="dialog" aria-label="Focus session">
            Focused modal {props.sessionId}
            <button type="button" onClick={props.onClose}>Close focused modal</button>
        </div>
    )
}))
```

Replace the `SessionChat` mock with a stateful mock that proves the same instance stays mounted:

```tsx
const sessionChatUnmounts = vi.fn()

vi.mock('@/components/SessionChat', async () => {
    const React = await import('react')
    return {
        SessionChat: (props: { session: { id: string }; onFocusSession?: () => void }) => {
            const instanceId = React.useId()
            const [draft, setDraft] = React.useState('')
            React.useEffect(() => () => sessionChatUnmounts(props.session.id), [props.session.id])
            return (
                <div data-testid="pinned-panel-chat" data-instance-id={instanceId}>
                    <span>{props.session.id}</span>
                    <label>
                        Draft
                        <input
                            aria-label="Mock composer draft"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                        />
                    </label>
                    {props.onFocusSession ? (
                        <button type="button" onClick={props.onFocusSession}>Mock focus session</button>
                    ) : null}
                </div>
            )
        }
    }
})
```

Update `beforeEach` to reset the new mock:

```tsx
sessionChatUnmounts.mockClear()
```

Replace the existing test named `opens and closes the focused session modal from a pinned panel focus callback` with this test:

```tsx
it('expands the existing pinned panel without remounting the session chat', () => {
    renderDashboard()

    fireEvent.click(screen.getByText('Build app'))
    const chat = screen.getByTestId('pinned-panel-chat')
    const instanceId = chat.getAttribute('data-instance-id')
    fireEvent.change(screen.getByRole('textbox', { name: 'Mock composer draft' }), { target: { value: 'draft before focus' } })

    fireEvent.click(screen.getByRole('button', { name: 'Mock focus session' }))

    const focusedPanel = screen.getByTestId('focused-pinned-panel')
    expect(focusedPanel).toContainElement(screen.getByTestId('pinned-panel-chat'))
    expect(screen.getByTestId('pinned-panel-chat')).toHaveAttribute('data-instance-id', instanceId)
    expect(screen.getByRole('textbox', { name: 'Mock composer draft' })).toHaveValue('draft before focus')
    expect(screen.getByRole('button', { name: 'Close focus session' })).toBeInTheDocument()
    expect(sessionStorage.getItem('mc-pinned-ids')).toBe(JSON.stringify(['session-1']))

    fireEvent.click(screen.getByRole('button', { name: 'Close focus session' }))

    expect(screen.queryByTestId('focused-pinned-panel')).not.toBeInTheDocument()
    expect(screen.getByTestId('pinned-panel-chat')).toHaveAttribute('data-instance-id', instanceId)
    expect(screen.getByRole('textbox', { name: 'Mock composer draft' })).toHaveValue('draft before focus')
    expect(sessionChatUnmounts).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('mc-pinned-ids')).toBe(JSON.stringify(['session-1']))
})
```

Add this test for Escape close:

```tsx
it('closes focused pinned panel with Escape without unmounting the chat', () => {
    renderDashboard()

    fireEvent.click(screen.getByText('Build app'))
    fireEvent.click(screen.getByRole('button', { name: 'Mock focus session' }))
    expect(screen.getByTestId('focused-pinned-panel')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByTestId('focused-pinned-panel')).not.toBeInTheDocument()
    expect(sessionChatUnmounts).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run dashboard test to verify it fails**

Run:

```bash
cd web && bun run test session-context-menu.test.tsx
```

Expected: FAIL because Dashboard still renders `FocusedSessionChatModal` and does not expose `data-testid="focused-pinned-panel"` or close button/backdrop for existing panel focus.

- [ ] **Step 3: Remove duplicate modal import/state/render from Dashboard**

In `web/src/components/Dashboard/index.tsx`, delete this import:

```tsx
import { FocusedSessionChatModal } from '@/components/FocusedSessionChatModal'
```

Rename current state:

```tsx
const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
```

to:

```tsx
const [focusedPinnedSessionId, setFocusedPinnedSessionId] = useState<string | null>(null)
```

Delete the old render block:

```tsx
{api && focusedSessionId ? (
    <FocusedSessionChatModal
        api={api}
        sessionId={focusedSessionId}
        onClose={() => setFocusedSessionId(null)}
    />
) : null}
```

- [ ] **Step 4: Add close helpers, Escape handling, and mobile resize safety**

In `Dashboard`, after state declarations, add:

```tsx
const closeFocusedPinnedSession = useCallback(() => {
    setFocusedPinnedSessionId(null)
}, [])
```

Add this effect after `pinnedSessions` is computed, or after `pinnedIds`/`activePinIndex` effects if easier:

```tsx
useEffect(() => {
    if (!focusedPinnedSessionId) return
    if (pinnedIds.includes(focusedPinnedSessionId)) return
    setFocusedPinnedSessionId(null)
}, [focusedPinnedSessionId, pinnedIds])
```

Add Escape handling:

```tsx
useEffect(() => {
    if (!focusedPinnedSessionId) return
    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
            setFocusedPinnedSessionId(null)
        }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
}, [focusedPinnedSessionId])
```

Add mobile resize safety so focus cannot remain half-active if the user opens focus on desktop then resizes/navigates to mobile. Use the same breakpoint as the header Focus gate:

```tsx
useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 768px)')
    const closeIfMobile = () => {
        if (media.matches) {
            setFocusedPinnedSessionId(null)
        }
    }
    closeIfMobile()
    if (typeof media.addEventListener === 'function') {
        media.addEventListener('change', closeIfMobile)
        return () => media.removeEventListener('change', closeIfMobile)
    }
    media.addListener(closeIfMobile)
    return () => media.removeListener(closeIfMobile)
}, [])
```

This is defensive. The Focus button should still not render on mobile.

- [ ] **Step 5: Apply focused classes to existing pinned panel**

Inside `pinnedSessions.map((s, idx) => ...)`, compute:

```tsx
const isFocused = focusedPinnedSessionId === s.id
```

If the map body currently uses implicit JSX, convert it to a block body:

```tsx
{pinnedSessions.map((s, idx) => {
    const isFocused = focusedPinnedSessionId === s.id
    return (
        <div
            key={s.id}
            data-testid={isFocused ? 'focused-pinned-panel' : undefined}
            className={[
                'db__pinned-panel',
                isFocused ? 'db__pinned-panel--focused' : '',
                focusedPinnedSessionId && !isFocused ? 'db__pinned-panel--focus-background' : '',
                pinnedIds.length >= 2 ? `db__pinned-panel--mobile-${idx === activePinIndex ? 'active' : 'hidden'}` : '',
                s.id === modalNewSessionId ? 'ring-2 ring-[var(--app-button)]' : ''
            ].filter(Boolean).join(' ')}
            onClick={() => {
                if (s.id === modalNewSessionId) clearNewSessionHighlight()
            }}
            onFocusCapture={() => {
                if (s.id === modalNewSessionId) clearNewSessionHighlight()
            }}
        >
            {isFocused ? (
                <button
                    type="button"
                    aria-label="Close focus session"
                    className="db__pinned-focus-close"
                    onClick={closeFocusedPinnedSession}
                >
                    Close
                </button>
            ) : null}
            <PinnedPanel
                sessionId={s.id}
                api={api}
                onUnpin={() => handleUnpin(s.id)}
                onSessionResolved={(newId) => {
                    setPinnedIds(prev => prev.map(id => id === s.id ? newId : id))
                    setFocusedPinnedSessionId(current => current === s.id ? newId : current)
                }}
                pinIndex={idx + 1}
                compact={true}
                isActive={activePinIndex === idx}
                onFocus={() => setActivePinIndex(idx)}
                onFocusSession={() => {
                    setActivePinIndex(idx)
                    setFocusedPinnedSessionId(s.id)
                }}
            />
        </div>
    )
})}
```

Important details:

- The close button is a sibling before `PinnedPanel`, not a replacement for it.
- `PinnedPanel` remains mounted while focused.
- `setActivePinIndex(idx)` is called when opening focus so Agent Mode tab state matches the focused session.
- The existing `onSessionResolved` updates `focusedPinnedSessionId` too.

- [ ] **Step 6: Add backdrop without duplicating SessionChat**

Before the pinned panels area, inside the returned JSX near the main content, render a backdrop when focused:

```tsx
{focusedPinnedSessionId ? (
    <button
        type="button"
        aria-label="Close focus session backdrop"
        className="db__pinned-focus-backdrop"
        onClick={closeFocusedPinnedSession}
    />
) : null}
```

Place it before the focused panel in DOM order so the panel can sit above it via z-index.

- [ ] **Step 7: Add CSS for focused existing panel**

In `web/src/components/Dashboard/dashboard.css`, near pinned panel styles, add:

```css
.db__pinned-focus-backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    border: 0;
    padding: 0;
    appearance: none;
    background: rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(4px);
    cursor: default;
}

.db__pinned-panel--focused {
    position: fixed;
    inset: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    z-index: 50;
    border: 1px solid var(--app-border);
    border-radius: 16px;
    background: var(--app-bg);
    box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
}

.db__pinned-panel--focus-background {
    pointer-events: none;
}

.db__pinned-focus-close {
    position: absolute;
    right: 14px;
    top: 10px;
    z-index: 2;
    border: 1px solid var(--app-border);
    border-radius: 8px;
    background: var(--app-bg);
    color: var(--app-fg);
    padding: 4px 10px;
    font-size: 0.75rem;
    font-weight: 600;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.db__pinned-focus-close:hover {
    background: var(--app-secondary-bg);
}
```

Inside the existing `@media (max-width: 768px)` block, add safety override:

```css
.db__pinned-focus-backdrop,
.db__pinned-focus-close {
    display: none;
}

.db__pinned-panel--focused {
    position: static;
    inset: auto;
    z-index: auto;
    border-radius: 0;
    box-shadow: none;
}

.db__pinned-panel--focus-background {
    pointer-events: auto;
}
```

The mobile override is defensive; the Focus button should already not render on mobile.

- [ ] **Step 8: Delete obsolete duplicate modal files**

Delete:

```bash
rm web/src/components/FocusedSessionChatModal.tsx web/src/components/FocusedSessionChatModal.test.tsx
```

Verify no imports remain:

```bash
rg "FocusedSessionChatModal" web/src
```

Expected: no output.

- [ ] **Step 9: Run dashboard test**

Run:

```bash
cd web && bun run test session-context-menu.test.tsx
```

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add web/src/components/Dashboard/index.tsx web/src/components/Dashboard/session-context-menu.test.tsx web/src/components/Dashboard/dashboard.css web/src/components/FocusedSessionChatModal.tsx web/src/components/FocusedSessionChatModal.test.tsx
git commit -m "fix: focus existing pinned session"
```

If deleted files require `git add -u`, run:

```bash
git add -u web/src/components/FocusedSessionChatModal.tsx web/src/components/FocusedSessionChatModal.test.tsx
```

---

## Task 2: Regression checks for header focus behavior

**Files:**
- Modify only if tests fail: `web/src/components/SessionHeader.test.tsx`, `web/src/components/SessionHeader.tsx`

- [ ] **Step 1: Run existing SessionHeader focus tests**

Run:

```bash
cd web && bun run test SessionHeader.test.tsx
```

Expected: PASS. Existing tests already cover:

- desktop Focus button renders and calls callback;
- double-click title opens focus;
- child buttons do not open focus;
- mobile does not render/open focus;
- legacy `matchMedia` listener cleanup.

- [ ] **Step 2: Fix only if tests fail**

If tests fail because Dashboard-specific behavior leaked into header tests, fix the smallest issue. Do not add new modal logic. The `SessionHeader` responsibility remains only:

```tsx
props.onFocusSession?.()
```

It must not know whether focus is implemented by modal, CSS overlay, or another container.

- [ ] **Step 3: Commit only if changes were needed**

If no files changed, skip commit. If a fix was needed:

```bash
git add web/src/components/SessionHeader.tsx web/src/components/SessionHeader.test.tsx
git commit -m "test: keep pinned focus header behavior"
```

---

## Task 3: Verification

**Files:**
- No code changes expected unless verification reveals a bug.

- [ ] **Step 1: Run focused dashboard test**

```bash
cd web && bun run test session-context-menu.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run header focus test**

```bash
cd web && bun run test SessionHeader.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run Dashboard CSS test**

```bash
cd web && bun run test dashboard-mobile-css.test.ts
```

Expected: PASS.

- [ ] **Step 4: Run web typecheck**

```bash
cd web && bun run typecheck
```

Expected: PASS, no TypeScript errors.

- [ ] **Step 5: Run all web tests**

```bash
cd web && bun run test
```

Expected: PASS. If unrelated existing tests fail, capture the failing names and error output before changing anything.

- [ ] **Step 6: Manual QA checklist**

Run:

```bash
cd web && bun run dev
```

Desktop checks:

- [ ] Pin 3 sessions.
- [ ] Type unsent text in a pinned session composer.
- [ ] Click Focus for that session.
- [ ] The same typed text is still visible in focused view.
- [ ] Close Focus.
- [ ] The typed text is still visible in the pinned grid.
- [ ] Chat messages remain visible after close.
- [ ] Double-click compact header opens the same focus view.
- [ ] Files/Terminal/More/Unpin double-click does not open focus.
- [ ] Backdrop click closes focus.
- [ ] Escape closes focus.
- [ ] Resizing from desktop focused view to mobile closes focus cleanly.
- [ ] If the focused session is unpinned, focus closes cleanly.

Mobile viewport checks:

- [ ] Focus button is not rendered.
- [ ] Double-click/tap header does not open focus.
- [ ] Existing mobile pin tabs still work.

- [ ] **Step 7: Commit verification fixes only if needed**

If verification required small fixes:

```bash
git add web/src/components/Dashboard/index.tsx web/src/components/Dashboard/session-context-menu.test.tsx web/src/components/Dashboard/dashboard.css web/src/components/SessionHeader.tsx web/src/components/SessionHeader.test.tsx
git commit -m "test: verify existing pinned focus overlay"
```

Skip if no changes were needed.

---

## Rollback plan

If this refactor creates layout regressions:

```bash
git revert <commit-fix-existing-pinned-session>
```

This returns to the previous duplicate modal implementation. If reverting is not desired because the duplicate modal has known sync bugs, temporarily disable focus by not passing `onFocusSession` from Dashboard to `PinnedPanel`:

```tsx
onFocusSession={undefined}
```

No backend/data rollback is needed.

---

## Risk notes

- **Main risk:** CSS fixed overlay could visually conflict with existing dashboard modals. Mitigation: z-index below global modals when appropriate, test Files/Terminal modals while focus is closed; do not open nested Files/Terminal from focused overlay until manual QA confirms acceptable behavior.
- **State risk reduced:** This plan removes the second `SessionChat`, so composer and messages no longer need cross-view synchronization.
- **Accessibility risk:** There is still no full focus trap. This is same level as previous custom modal patterns; Escape/backdrop/Close button are required.
- **Mobile risk:** Focus should be inaccessible on mobile. Defensive CSS prevents fixed overlay if state is somehow set, and Dashboard clears focus when the viewport becomes mobile.

---

## Self-review

- Spec coverage: one-instance focus, unsent prompt preservation, message cache preservation, close behavior, Escape/backdrop, active tab alignment, mobile suppression including resize safety, and obsolete modal removal are all covered.
- Placeholder scan: no placeholder markers or vague implementation steps remain.
- Type consistency: new state name `focusedPinnedSessionId` is used consistently in Dashboard; `onFocusSession` remains the boundary between header/session chat and Dashboard.
