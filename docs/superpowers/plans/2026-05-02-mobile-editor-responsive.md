# Mobile Editor Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile focus-mode Editor layout using the approved Variant A while preserving the current desktop three-pane Editor layout.

**Architecture:** Keep `EditorLayout` as the shared orchestrator for state, persistence, session creation, file actions, and terminal cleanup. Add a viewport hook and a `MobileEditorLayout` presentation component that receives the existing state/handlers and renders one active surface at a time. Add small mobile props to `EditorTabs` and `EditorTerminal` for touch-friendly close/save confirmation while keeping desktop behavior unchanged.

**Tech Stack:** React 19, TypeScript strict, TanStack Router/Query, Tailwind CSS, Vitest + Testing Library, Bun workspaces.

---

## File structure

- Create: `web/src/hooks/useMediaQuery.ts`
  - Generic SSR-safe viewport query hook.
- Create: `web/src/hooks/useMediaQuery.test.tsx`
  - Tests initial match, listener updates, and cleanup.
- Create: `web/src/components/editor/MobileEditorLayout.tsx`
  - Mobile Variant A shell: header, bottom nav, files/editor/chat/terminal surfaces.
- Create: `web/src/components/editor/MobileEditorLayout.test.tsx`
  - Tests bottom nav, `← Agents`, open-file view transition, and chat confirmation flow.
- Modify: `web/src/components/editor/EditorLayout.tsx`
  - Use media query; keep shared orchestration; branch to mobile or existing desktop JSX.
- Modify: `web/src/components/editor/EditorLayout.test.tsx`
  - Mock media query; assert desktop remains default and mobile branch appears under narrow viewport.
- Modify: `web/src/components/editor/EditorTabs.tsx`
  - Add mobile dirty-close flow and compact mobile tab styling.
- Modify: `web/src/components/editor/EditorTabs.test.tsx`
  - Add dirty close/save/discard tests.
- Modify: `web/src/components/editor/EditorTerminal.tsx`
  - Add mobile mode: no collapse UI, compact tab strip, close confirmation.
- Modify: `web/src/components/editor/EditorTerminal.test.tsx`
  - Add mobile close-confirm and no-collapse tests.

## Implementation notes

- Use breakpoint query `(max-width: 767px)`.
- Do not mount desktop and mobile layouts at the same time; CodeMirror/xterm side effects must not duplicate.
- Use existing visual scale: `text-xs`, `text-sm`, `px-2`, `px-3`, `py-1`, `py-1.5`, `py-2`, `rounded-md`, `rounded-lg`, `border-[var(--app-border)]`, `bg-[var(--app-bg)]`, `bg-[var(--app-subtle-bg)]`.
- No new backend APIs.
- Confirm all mobile terminal closes in first pass because the current `EditorTerminal` API does not expose reliable running/idle process state.

---

### Task 1: Add viewport query hook

**Files:**
- Create: `web/src/hooks/useMediaQuery.ts`
- Create: `web/src/hooks/useMediaQuery.test.tsx`

- [ ] **Step 1: Write failing tests for media query behavior**

Create `web/src/hooks/useMediaQuery.test.tsx`:

```tsx
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMediaQuery } from './useMediaQuery'

type Listener = (event: MediaQueryListEvent) => void

function installMatchMedia(initialMatches: boolean) {
    let matches = initialMatches
    const listeners = new Set<Listener>()

    window.matchMedia = vi.fn((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event: string, listener: Listener) => {
            if (event === 'change') listeners.add(listener)
        }),
        removeEventListener: vi.fn((event: string, listener: Listener) => {
            if (event === 'change') listeners.delete(listener)
        }),
        addListener: vi.fn((listener: Listener) => listeners.add(listener)),
        removeListener: vi.fn((listener: Listener) => listeners.delete(listener)),
        dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia

    return {
        setMatches(nextMatches: boolean) {
            matches = nextMatches
            const event = { matches: nextMatches, media: '(max-width: 767px)' } as MediaQueryListEvent
            for (const listener of listeners) listener(event)
        },
        listenerCount() {
            return listeners.size
        }
    }
}

describe('useMediaQuery', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('returns the current media query match', () => {
        installMatchMedia(true)

        const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))

        expect(result.current).toBe(true)
        expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
    })

    it('updates when the media query changes', () => {
        const media = installMatchMedia(false)
        const { result } = renderHook(() => useMediaQuery('(max-width: 767px)'))

        expect(result.current).toBe(false)

        act(() => media.setMatches(true))

        expect(result.current).toBe(true)
    })

    it('removes the change listener on unmount', () => {
        const media = installMatchMedia(false)
        const { unmount } = renderHook(() => useMediaQuery('(max-width: 767px)'))

        expect(media.listenerCount()).toBe(1)
        unmount()
        expect(media.listenerCount()).toBe(0)
    })
})
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
bun run --cwd web test src/hooks/useMediaQuery.test.tsx
```

Expected: FAIL because `./useMediaQuery` does not exist.

- [ ] **Step 3: Implement the hook**

Create `web/src/hooks/useMediaQuery.ts`:

```ts
import { useEffect, useState } from 'react'

function getInitialMatch(query: string): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false
    }
    return window.matchMedia(query).matches
}

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => getInitialMatch(query))

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            setMatches(false)
            return
        }

        const mediaQuery = window.matchMedia(query)
        setMatches(mediaQuery.matches)

        const handleChange = (event: MediaQueryListEvent) => {
            setMatches(event.matches)
        }

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleChange)
            return () => mediaQuery.removeEventListener('change', handleChange)
        }

        mediaQuery.addListener(handleChange)
        return () => mediaQuery.removeListener(handleChange)
    }, [query])

    return matches
}
```

- [ ] **Step 4: Run hook tests and verify pass**

Run:

```bash
bun run --cwd web test src/hooks/useMediaQuery.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/hooks/useMediaQuery.ts web/src/hooks/useMediaQuery.test.tsx
git commit -m "feat(web): add media query hook"
```

---

### Task 2: Add mobile behavior to editor file tabs

**Files:**
- Modify: `web/src/components/editor/EditorTabs.tsx`
- Modify: `web/src/components/editor/EditorTabs.test.tsx`

- [ ] **Step 1: Add failing tests for dirty close and mobile close controls**

Append these tests inside `describe('EditorTabs', () => { ... })` in `web/src/components/editor/EditorTabs.test.tsx`:

```tsx
    it('asks before closing a dirty mobile tab and cancels without closing', async () => {
        const onCloseTab = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ id: 'tab-file', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx', dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onNewFile={vi.fn()}
                mobileMode={true}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Close tab App.tsx' }))

        expect(screen.getByRole('dialog', { name: 'Close unsaved tab?' })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        expect(onCloseTab).not.toHaveBeenCalled()
        expect(screen.queryByRole('dialog', { name: 'Close unsaved tab?' })).not.toBeInTheDocument()
    })

    it('discards a dirty mobile tab before closing', () => {
        const onCloseTab = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ id: 'tab-file', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx', dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onNewFile={vi.fn()}
                mobileMode={true}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Close tab App.tsx' }))
        fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))

        expect(onCloseTab).toHaveBeenCalledWith('tab-file')
    })

    it('saves a dirty mobile tab before closing', async () => {
        const onCloseTab = vi.fn()
        const onDirtyChange = vi.fn()
        const onSaveFile = vi.fn(async () => undefined)

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ id: 'tab-file', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx', dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onNewFile={vi.fn()}
                onDirtyChange={onDirtyChange}
                onSaveFile={onSaveFile}
                mobileMode={true}
            />
        )

        await waitFor(() => expect(cmMocks.editorViews[0]).toBeDefined())
        cmMocks.editorViews[0].simulateChange('console.log("saved before close")')

        fireEvent.click(screen.getByRole('button', { name: 'Close tab App.tsx' }))
        fireEvent.click(screen.getByRole('button', { name: 'Save then close' }))

        await waitFor(() => {
            expect(onSaveFile).toHaveBeenCalledWith('/repo/src/App.tsx', 'console.log("saved before close")')
            expect(onDirtyChange).toHaveBeenCalledWith('tab-file', false)
            expect(onCloseTab).toHaveBeenCalledWith('tab-file')
        })
    })
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd web test src/components/editor/EditorTabs.test.tsx
```

Expected: FAIL because `mobileMode` and close confirmation do not exist.

- [ ] **Step 3: Add mobile props and dirty-close helpers**

Modify the `EditorTabs` props type in `web/src/components/editor/EditorTabs.tsx`:

```ts
export function EditorTabs(props: {
    api: ApiClient | null
    machineId: string | null
    tabs: EditorTab[]
    activeTabId: string | null
    onSelectTab: (tabId: string) => void
    onCloseTab: (tabId: string) => void
    onNewFile: () => void
    onDirtyChange?: (tabId: string, dirty: boolean) => void
    onSaveFile?: (path: string, content: string) => Promise<void>
    onAddSelectionToChat?: (filePath: string, startLine: number, endLine: number, content: string) => void
    mobileMode?: boolean
}) {
```

Inside the component, after `const [saveError, setSaveError] = useState<string | null>(null)`, add:

```ts
    const [pendingCloseTab, setPendingCloseTab] = useState<EditorTab | null>(null)
```

Replace the current `saveActiveFile` callback with these two callbacks:

```ts
    const saveFileTab = useCallback(async (tab: EditorTab) => {
        if (tab.type !== 'file' || !tab.path || !tab.dirty) {
            return
        }

        const content = fileContentsRef.current.get(tab.id) ?? ''
        const saveFile = props.onSaveFile ?? (async (path: string, nextContent: string) => {
            if (!props.api || !props.machineId) {
                throw new Error('Cannot save file: API or machine is not available')
            }
            const response = await props.api.writeEditorFile(props.machineId, path, nextContent)
            if (!response.success) {
                throw new Error(response.error ?? 'Failed to save file')
            }
        })

        setSavingTabId(tab.id)
        setSaveError(null)
        try {
            await saveFile(tab.path, content)
            props.onDirtyChange?.(tab.id, false)
        } catch (error) {
            setSaveError(error instanceof Error ? error.message : 'Failed to save file')
            throw error
        } finally {
            setSavingTabId(null)
        }
    }, [props])

    const saveActiveFile = useCallback(async () => {
        if (!activeTab) return
        await saveFileTab(activeTab)
    }, [activeTab, saveFileTab])
```

Add close helpers after the keyboard shortcut effect:

```ts
    const requestCloseTab = useCallback((tab: EditorTab) => {
        if (props.mobileMode && tab.type === 'file' && tab.dirty) {
            setPendingCloseTab(tab)
            return
        }
        props.onCloseTab(tab.id)
    }, [props])

    const discardPendingClose = useCallback(() => {
        if (!pendingCloseTab) return
        props.onCloseTab(pendingCloseTab.id)
        setPendingCloseTab(null)
    }, [pendingCloseTab, props])

    const savePendingClose = useCallback(async () => {
        if (!pendingCloseTab) return
        try {
            await saveFileTab(pendingCloseTab)
            props.onCloseTab(pendingCloseTab.id)
            setPendingCloseTab(null)
        } catch {
            // saveError is already set by saveFileTab; keep the sheet open.
        }
    }, [pendingCloseTab, props, saveFileTab])
```

- [ ] **Step 4: Wire close buttons and mobile classes**

In the tab close button `onClick`, replace direct close with:

```ts
requestCloseTab(tab)
```

In the close button `onKeyDown`, replace direct close with:

```ts
requestCloseTab(tab)
```

Update the tab bar class from:

```tsx
<div className="flex items-center bg-[var(--app-subtle-bg)] border-b border-[var(--app-border)] overflow-x-auto shrink-0">
```

to:

```tsx
<div className={`flex items-center border-b border-[var(--app-border)] overflow-x-auto shrink-0 ${props.mobileMode ? 'bg-[var(--app-secondary-bg)]' : 'bg-[var(--app-subtle-bg)]'}`}>
```

Update the tab class expression to keep mobile compact:

```tsx
className={`flex items-center gap-1.5 py-1.5 text-xs border-r border-[var(--app-border)] whitespace-nowrap cursor-pointer transition-colors ${props.mobileMode ? 'px-2' : 'px-3'} ${
    isActive
        ? 'bg-[var(--app-bg)] border-b-2 border-b-[#6366f1] text-[var(--app-fg)]'
        : 'text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]'
}`}
```

- [ ] **Step 5: Render dirty close sheet**

Before the closing `</div>` of `EditorTabs`, render this confirmation after the tab content region:

```tsx
            {pendingCloseTab ? (
                <div className="fixed inset-0 z-[70] flex items-end bg-black/30 sm:items-center sm:justify-center" role="presentation">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Close unsaved tab?"
                        className="w-full rounded-t-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-sm text-[var(--app-fg)] shadow-xl sm:max-w-sm sm:rounded-lg"
                    >
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--app-border)] sm:hidden" />
                        <h2 className="text-sm font-semibold">Close unsaved tab?</h2>
                        <p className="mt-1 text-xs text-[var(--app-hint)]">
                            {pendingCloseTab.label} has unsaved changes.
                        </p>
                        {saveError ? (
                            <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500">
                                {saveError}
                            </div>
                        ) : null}
                        <div className="mt-4 grid gap-2">
                            <button
                                type="button"
                                className="rounded-md bg-[var(--app-fg)] px-3 py-2 text-xs font-semibold text-[var(--app-bg)] disabled:opacity-60"
                                disabled={savingTabId === pendingCloseTab.id}
                                onClick={() => { void savePendingClose() }}
                            >
                                {savingTabId === pendingCloseTab.id ? 'Saving…' : 'Save then close'}
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-500"
                                disabled={savingTabId === pendingCloseTab.id}
                                onClick={discardPendingClose}
                            >
                                Discard changes
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-fg)]"
                                disabled={savingTabId === pendingCloseTab.id}
                                onClick={() => setPendingCloseTab(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
```

- [ ] **Step 6: Run tests and verify pass**

Run:

```bash
bun run --cwd web test src/components/editor/EditorTabs.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/editor/EditorTabs.tsx web/src/components/editor/EditorTabs.test.tsx
git commit -m "feat(web): add mobile editor tab close flow"
```

---

### Task 3: Add mobile behavior to editor terminal

**Files:**
- Modify: `web/src/components/editor/EditorTerminal.tsx`
- Modify: `web/src/components/editor/EditorTerminal.test.tsx`

- [ ] **Step 1: Add failing mobile terminal tests**

Append these tests inside `describe('EditorTerminal', () => { ... })` in `web/src/components/editor/EditorTerminal.test.tsx`:

```tsx
    it('hides collapse controls in mobile mode', () => {
        render(
            <EditorTerminal
                api={null}
                tabs={[]}
                activeTabId={null}
                isCollapsed={false}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
                mobileMode={true}
            />
        )

        expect(screen.queryByRole('button', { name: 'Collapse terminal' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Expand terminal' })).not.toBeInTheDocument()
        expect(screen.getByText('No terminal open')).toBeInTheDocument()
    })

    it('confirms before closing a mobile terminal', () => {
        const onCloseTab = vi.fn()

        render(
            <EditorTerminal
                api={null}
                tabs={[{ id: 'terminal-1', type: 'terminal', label: 'Terminal: bash', shell: 'bash' }]}
                activeTabId="terminal-1"
                isCollapsed={false}
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onOpenTerminal={vi.fn()}
                onToggleCollapsed={vi.fn()}
                mobileMode={true}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Close terminal Terminal: bash' }))

        expect(screen.getByRole('dialog', { name: 'Close terminal?' })).toBeInTheDocument()
        expect(onCloseTab).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Stop process and close' }))

        expect(onCloseTab).toHaveBeenCalledWith('terminal-1')
    })
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd web test src/components/editor/EditorTerminal.test.tsx
```

Expected: FAIL because `mobileMode` and close confirmation do not exist.

- [ ] **Step 3: Add mobileMode prop and pending close state**

Modify `EditorTerminal` props in `web/src/components/editor/EditorTerminal.tsx`:

```ts
export function EditorTerminal(props: {
    api: ApiClient | null
    tabs: EditorTab[]
    activeTabId: string | null
    isCollapsed: boolean
    onSelectTab: (tabId: string) => void
    onCloseTab: (tabId: string) => void
    onOpenTerminal: () => void
    onToggleCollapsed: () => void
    onAddToChat?: (text: string) => void
    onRegisterTerminalClose?: (tabId: string, close: (() => void) | null) => void
    mobileMode?: boolean
}) {
```

Add state after `closeByTerminalIdRef`:

```ts
    const [pendingCloseTerminalId, setPendingCloseTerminalId] = useState<string | null>(null)
```

Ensure `useState` is imported from React at the top if it is not already.

- [ ] **Step 4: Confirm terminal close on mobile**

Replace `handleCloseTerminal` with:

```ts
    const closeTerminalNow = useCallback((tabId: string) => {
        closeByTerminalIdRef.current.get(tabId)?.()
        closeByTerminalIdRef.current.delete(tabId)
        props.onCloseTab(tabId)
    }, [props.onCloseTab])

    const handleCloseTerminal = useCallback((tabId: string) => {
        if (props.mobileMode) {
            setPendingCloseTerminalId(tabId)
            return
        }
        closeTerminalNow(tabId)
    }, [closeTerminalNow, props.mobileMode])
```

- [ ] **Step 5: Hide collapse control and keep mobile terminal expanded**

Replace the collapse button block with this conditional:

```tsx
                {!props.mobileMode ? (
                    <button
                        type="button"
                        aria-label={props.isCollapsed ? 'Expand terminal' : 'Collapse terminal'}
                        className="flex h-full w-7 items-center justify-center text-xs text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                        onClick={() => props.onToggleCollapsed()}
                        title={props.isCollapsed ? 'Expand terminal' : 'Collapse terminal'}
                    >
                        {props.isCollapsed ? '›' : '⌄'}
                    </button>
                ) : null}
```

Change the terminal body visibility condition from:

```tsx
<div className={`min-h-0 flex-1 overflow-hidden ${props.isCollapsed ? 'hidden' : ''}`}>
```

to:

```tsx
<div className={`min-h-0 flex-1 overflow-hidden ${props.isCollapsed && !props.mobileMode ? 'hidden' : ''}`}>
```

Change the empty state condition from:

```tsx
) : !props.isCollapsed ? (
```

to:

```tsx
) : !props.isCollapsed || props.mobileMode ? (
```

- [ ] **Step 6: Render mobile close confirmation**

Before the final closing `</div>` of `EditorTerminal`, render:

```tsx
            {pendingCloseTerminalId ? (
                <div className="fixed inset-0 z-[70] flex items-end bg-black/30 sm:items-center sm:justify-center" role="presentation">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-label="Close terminal?"
                        className="w-full rounded-t-lg border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-sm text-[var(--app-fg)] shadow-xl sm:max-w-sm sm:rounded-lg"
                    >
                        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--app-border)] sm:hidden" />
                        <h2 className="text-sm font-semibold">Close terminal?</h2>
                        <p className="mt-1 text-xs text-[var(--app-hint)]">
                            This will stop the terminal session if a process is running.
                        </p>
                        <div className="mt-4 grid gap-2">
                            <button
                                type="button"
                                className="rounded-md border border-red-500/40 px-3 py-2 text-xs font-semibold text-red-500"
                                onClick={() => {
                                    closeTerminalNow(pendingCloseTerminalId)
                                    setPendingCloseTerminalId(null)
                                }}
                            >
                                Stop process and close
                            </button>
                            <button
                                type="button"
                                className="rounded-md border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-fg)]"
                                onClick={() => setPendingCloseTerminalId(null)}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
```

- [ ] **Step 7: Run terminal tests and verify pass**

Run:

```bash
bun run --cwd web test src/components/editor/EditorTerminal.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/editor/EditorTerminal.tsx web/src/components/editor/EditorTerminal.test.tsx
git commit -m "feat(web): add mobile terminal controls"
```

---

### Task 4: Create the mobile editor layout component

**Files:**
- Create: `web/src/components/editor/MobileEditorLayout.tsx`
- Create: `web/src/components/editor/MobileEditorLayout.test.tsx`

- [ ] **Step 1: Write failing tests for mobile layout shell**

Create `web/src/components/editor/MobileEditorLayout.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { EditorTab } from '@/hooks/useEditorState'
import { MobileEditorLayout } from './MobileEditorLayout'

vi.mock('./EditorFileTree', () => ({
    EditorFileTree: (props: { onOpenFile: (path: string) => void; onContextMenu: (path: string, x: number, y: number, items: Array<{ path: string; type: 'file' | 'directory' }>) => void }) => (
        <div data-testid="mobile-file-tree">
            <button type="button" onClick={() => props.onOpenFile('/repo/src/App.tsx')}>Open App</button>
            <button type="button" onClick={() => props.onContextMenu('/repo/src/App.tsx', 10, 20, [{ path: '/repo/src/App.tsx', type: 'file' }])}>File actions</button>
        </div>
    )
}))

vi.mock('./EditorTabs', () => ({
    EditorTabs: (props: { mobileMode?: boolean; tabs: EditorTab[]; onNewFile: () => void }) => (
        <div data-testid="mobile-editor-tabs">
            mobile tabs: {props.mobileMode ? 'yes' : 'no'} {props.tabs.map((tab) => tab.label).join(',')}
            <button type="button" onClick={props.onNewFile}>New file from tabs</button>
        </div>
    )
}))

vi.mock('./EditorChatPanel', () => ({
    EditorChatPanel: (props: { pendingDraftText?: string }) => (
        <div data-testid="mobile-chat-panel">draft: {props.pendingDraftText ?? ''}</div>
    )
}))

vi.mock('./EditorTerminal', () => ({
    EditorTerminal: (props: { mobileMode?: boolean; onOpenTerminal: () => void }) => (
        <div data-testid="mobile-terminal">
            mobile terminal: {props.mobileMode ? 'yes' : 'no'}
            <button type="button" onClick={props.onOpenTerminal}>Open terminal</button>
        </div>
    )
}))

function baseProps() {
    const fileTabs: EditorTab[] = [{ id: 'file-1', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx' }]
    const terminalTabs: EditorTab[] = [{ id: 'term-1', type: 'terminal', label: 'Terminal: bash', shell: 'bash' }]
    return {
        api: {} as ApiClient,
        machineId: 'machine-1',
        projectPath: '/repo',
        fileTabs,
        terminalTabs,
        activeFileTab: fileTabs[0],
        activeTerminalTab: terminalTabs[0],
        activeSessionId: 'session-1',
        pendingDraftText: undefined as string | undefined,
        newFileTargetPath: null as string | null,
        newSessionError: null as string | null,
        onBackToAgents: vi.fn(),
        onBrowseProject: vi.fn(),
        onOpenFile: vi.fn(),
        onShowContextMenu: vi.fn(),
        onCreateFile: vi.fn(async () => ({ success: true as const })),
        onCancelNewFile: vi.fn(),
        onNewFileFromTabs: vi.fn(),
        onDirtyChange: vi.fn(),
        onAddSelectionToChat: vi.fn(),
        onSelectFileTab: vi.fn(),
        onCloseTab: vi.fn(),
        onOpenNewSessionModal: vi.fn(),
        onSessionResolved: vi.fn(),
        onExpandDraft: (text: string) => text,
        onDraftConsumed: vi.fn(),
        onOpenTerminal: vi.fn(),
        onSelectTerminalTab: vi.fn(),
        onCloseTerminalTab: vi.fn(),
        onAddTerminalToChat: vi.fn(),
        onRegisterTerminalClose: vi.fn(),
    }
}

describe('MobileEditorLayout', () => {
    afterEach(() => cleanup())

    it('renders the Files view by default and navigates back to agents', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        expect(screen.getByTestId('mobile-file-tree')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Back to Agent Mode' }))

        expect(props.onBackToAgents).toHaveBeenCalledTimes(1)
    })

    it('switches views from the bottom navigation', () => {
        render(<MobileEditorLayout {...baseProps()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
        expect(screen.getByTestId('mobile-editor-tabs')).toHaveTextContent('mobile tabs: yes')

        fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
        expect(screen.getByTestId('mobile-chat-panel')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
        expect(screen.getByTestId('mobile-terminal')).toHaveTextContent('mobile terminal: yes')
    })

    it('opens a file and switches to the Editor view', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByText('Open App'))

        expect(props.onOpenFile).toHaveBeenCalledWith('/repo/src/App.tsx')
        expect(screen.getByTestId('mobile-editor-tabs')).toBeInTheDocument()
    })

    it('opens terminal and switches to the Terminal view', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
        fireEvent.click(screen.getByText('Open terminal'))

        expect(props.onOpenTerminal).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('mobile-terminal')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
bun run --cwd web test src/components/editor/MobileEditorLayout.test.tsx
```

Expected: FAIL because `MobileEditorLayout` does not exist.

- [ ] **Step 3: Implement MobileEditorLayout**

Create `web/src/components/editor/MobileEditorLayout.tsx` with this structure:

```tsx
import { useCallback, useMemo, useState } from 'react'
import type { ApiClient } from '@/api/client'
import type { EditorTab } from '@/hooks/useEditorState'
import type { EditorTreeItem } from '@/types/editor'
import { EditorChatPanel } from './EditorChatPanel'
import { EditorFileTree } from './EditorFileTree'
import { EditorTabs } from './EditorTabs'
import { EditorTerminal } from './EditorTerminal'

export type MobileEditorView = 'files' | 'editor' | 'chat' | 'terminal'

type MobileEditorLayoutProps = {
    api: ApiClient
    machineId: string | null
    projectPath: string | null
    fileTabs: EditorTab[]
    terminalTabs: EditorTab[]
    activeFileTab: EditorTab | null
    activeTerminalTab: EditorTab | null
    activeSessionId: string | null
    pendingDraftText?: string
    newFileTargetPath: string | null
    newSessionError: string | null
    onBackToAgents: () => void
    onBrowseProject: () => void
    onOpenFile: (path: string) => void
    onShowContextMenu: (filePath: string, x: number, y: number, items?: EditorTreeItem[]) => void
    onCreateFile: (parentPath: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string }>
    onCancelNewFile: () => void
    onNewFileFromTabs: () => void
    onDirtyChange: (tabId: string, dirty: boolean) => void
    onAddSelectionToChat: (filePath: string, startLine: number, endLine: number, content: string) => void
    onSelectFileTab: (tabId: string) => void
    onCloseTab: (tabId: string) => void
    onOpenNewSessionModal: () => void
    onSessionResolved: (resolvedSessionId: string) => void
    onExpandDraft: (text: string) => string
    onDraftConsumed: () => void
    onOpenTerminal: () => void
    onSelectTerminalTab: (tabId: string) => void
    onCloseTerminalTab: (tabId: string) => void
    onAddTerminalToChat: (text: string) => void
    onRegisterTerminalClose: (tabId: string, close: (() => void) | null) => void
}

function getRelativeLabel(projectPath: string | null, path: string | null | undefined): string {
    if (!path) return ''
    if (!projectPath) return path
    const root = projectPath.replace(/\/+$/, '')
    if (path === root) return path.split('/').filter(Boolean).pop() ?? path
    if (path.startsWith(`${root}/`)) return path.slice(root.length + 1)
    return path
}

function MobileHeader(props: {
    title: string
    subtitle: string
    action?: React.ReactNode
    onBackToAgents: () => void
}) {
    return (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-2">
            <button
                type="button"
                aria-label="Back to Agent Mode"
                className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                onClick={props.onBackToAgents}
            >
                ← Agents
            </button>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--app-fg)]">{props.title}</div>
                <div className="truncate text-[10px] text-[var(--app-hint)]">{props.subtitle}</div>
            </div>
            {props.action}
        </div>
    )
}

function BottomNav(props: { view: MobileEditorView; onViewChange: (view: MobileEditorView) => void }) {
    const items: Array<{ view: MobileEditorView; label: string; icon: string }> = [
        { view: 'files', label: 'Files', icon: '📁' },
        { view: 'editor', label: 'Editor', icon: '⌨️' },
        { view: 'chat', label: 'Chat', icon: '💬' },
        { view: 'terminal', label: 'Term', icon: '▣' },
    ]

    return (
        <div className="grid h-14 shrink-0 grid-cols-4 border-t border-[var(--app-border)] bg-[var(--app-bg)]">
            {items.map((item) => {
                const active = item.view === props.view
                return (
                    <button
                        key={item.view}
                        type="button"
                        aria-label={item.label === 'Term' ? 'Terminal' : item.label}
                        className={`flex flex-col items-center justify-center gap-0.5 text-[10px] ${active ? 'font-semibold text-[var(--app-fg)]' : 'text-[var(--app-hint)]'}`}
                        onClick={() => props.onViewChange(item.view)}
                    >
                        <span aria-hidden="true">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                )
            })}
        </div>
    )
}

export function MobileEditorLayout(props: MobileEditorLayoutProps) {
    const [view, setView] = useState<MobileEditorView>('files')
    const [contextNotice, setContextNotice] = useState<string | null>(null)

    const activeFilePath = props.activeFileTab?.path ?? null
    const title = useMemo(() => {
        if (view === 'files') return 'HAPI Editor'
        if (view === 'editor') return props.activeFileTab?.label ?? 'Editor'
        if (view === 'chat') return 'Chat'
        return 'Terminal'
    }, [props.activeFileTab?.label, view])

    const subtitle = useMemo(() => {
        if (view === 'files') return props.projectPath ?? 'Open a project'
        if (view === 'editor') return getRelativeLabel(props.projectPath, props.activeFileTab?.path) || 'Open a file'
        if (view === 'chat') return props.activeSessionId ? `Session ${props.activeSessionId.slice(0, 8)}` : 'No session selected'
        return props.activeTerminalTab?.label ?? 'No terminal open'
    }, [props.activeFileTab?.path, props.activeSessionId, props.activeTerminalTab?.label, props.projectPath, view])

    const handleOpenFile = useCallback((path: string) => {
        props.onOpenFile(path)
        setView('editor')
    }, [props])

    const handleOpenTerminal = useCallback(() => {
        props.onOpenTerminal()
        setView('terminal')
    }, [props])

    const handleAddSelectionToChat = useCallback((filePath: string, startLine: number, endLine: number, content: string) => {
        props.onAddSelectionToChat(filePath, startLine, endLine, content)
        setContextNotice('Selection added to chat draft')
    }, [props])

    const headerAction = view === 'editor' ? (
        <button
            type="button"
            className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
            onClick={props.onNewFileFromTabs}
        >
            +
        </button>
    ) : view === 'chat' ? (
        <button
            type="button"
            className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
            onClick={props.onOpenNewSessionModal}
        >
            +
        </button>
    ) : view === 'terminal' ? (
        <button
            type="button"
            className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
            onClick={handleOpenTerminal}
        >
            +
        </button>
    ) : (
        <button
            type="button"
            className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
            onClick={props.onBrowseProject}
        >
            Browse
        </button>
    )

    return (
        <div data-testid="mobile-editor-layout" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)]">
            <MobileHeader title={title} subtitle={subtitle} action={headerAction} onBackToAgents={props.onBackToAgents} />

            <div className="min-h-0 flex-1 overflow-hidden">
                {view === 'files' ? (
                    <EditorFileTree
                        api={props.api}
                        machineId={props.machineId}
                        projectPath={props.projectPath}
                        onOpenFile={handleOpenFile}
                        onContextMenu={props.onShowContextMenu}
                        activeFilePath={activeFilePath}
                        newFileTargetPath={props.newFileTargetPath}
                        onCreateFile={props.onCreateFile}
                        onCancelNewFile={props.onCancelNewFile}
                    />
                ) : null}

                {view === 'editor' ? (
                    <EditorTabs
                        api={props.api}
                        machineId={props.machineId}
                        tabs={props.fileTabs}
                        activeTabId={props.activeFileTab?.id ?? null}
                        onSelectTab={props.onSelectFileTab}
                        onCloseTab={props.onCloseTab}
                        onNewFile={props.onNewFileFromTabs}
                        onDirtyChange={props.onDirtyChange}
                        onAddSelectionToChat={handleAddSelectionToChat}
                        mobileMode={true}
                    />
                ) : null}

                {view === 'chat' ? (
                    <EditorChatPanel
                        api={props.api}
                        sessionId={props.activeSessionId}
                        pendingDraftText={props.pendingDraftText}
                        onDraftConsumed={props.onDraftConsumed}
                        onExpandDraft={props.onExpandDraft}
                        onSessionResolved={props.onSessionResolved}
                        onNewSessionRequested={props.onOpenNewSessionModal}
                    />
                ) : null}

                {view === 'terminal' ? (
                    <EditorTerminal
                        api={props.api}
                        tabs={props.terminalTabs}
                        activeTabId={props.activeTerminalTab?.id ?? null}
                        isCollapsed={false}
                        onSelectTab={props.onSelectTerminalTab}
                        onCloseTab={props.onCloseTerminalTab}
                        onOpenTerminal={handleOpenTerminal}
                        onToggleCollapsed={() => {}}
                        onAddToChat={props.onAddTerminalToChat}
                        onRegisterTerminalClose={props.onRegisterTerminalClose}
                        mobileMode={true}
                    />
                ) : null}
            </div>

            {contextNotice ? (
                <div className="shrink-0 border-t border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 text-xs text-[var(--app-fg)]">
                    <span>{contextNotice}</span>
                    <button type="button" className="ml-2 font-semibold" onClick={() => setView('chat')}>Open chat</button>
                    <button type="button" className="ml-2 text-[var(--app-hint)]" onClick={() => setContextNotice(null)}>Dismiss</button>
                </div>
            ) : null}

            {props.newSessionError ? (
                <div className="shrink-0 border-t border-[var(--app-border)] px-3 py-2 text-xs text-red-500">
                    {props.newSessionError}
                </div>
            ) : null}

            <BottomNav view={view} onViewChange={setView} />
        </div>
    )
}
```

- [ ] **Step 4: Run mobile layout tests and verify pass**

Run:

```bash
bun run --cwd web test src/components/editor/MobileEditorLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/editor/MobileEditorLayout.tsx web/src/components/editor/MobileEditorLayout.test.tsx
git commit -m "feat(web): add mobile editor layout"
```

---

### Task 5: Branch EditorLayout between desktop and mobile

**Files:**
- Modify: `web/src/components/editor/EditorLayout.tsx`
- Modify: `web/src/components/editor/EditorLayout.test.tsx`

- [ ] **Step 1: Add failing EditorLayout tests for mobile branch**

In `web/src/components/editor/EditorLayout.test.tsx`, add `isMobileEditor` to the hoisted mocks object:

```ts
    isMobileEditor: false,
```

Add mocks:

```ts
vi.mock('@/hooks/useMediaQuery', () => ({
    useMediaQuery: () => mocks.isMobileEditor
}))

vi.mock('./MobileEditorLayout', () => ({
    MobileEditorLayout: (props: {
        onBackToAgents: () => void
        onOpenFile: (path: string) => void
        onOpenTerminal: () => void
        fileTabs: Array<{ label: string }>
    }) => (
        <div data-testid="mobile-editor-layout">
            Mobile Editor
            <div>Mobile tabs: {props.fileTabs.map((tab) => tab.label).join(',')}</div>
            <button type="button" onClick={props.onBackToAgents}>Mobile back agents</button>
            <button type="button" onClick={() => props.onOpenFile('/repo/src/Mobile.tsx')}>Mobile open file</button>
            <button type="button" onClick={props.onOpenTerminal}>Mobile open terminal</button>
        </div>
    )
}))
```

In `beforeEach`, reset:

```ts
        mocks.isMobileEditor = false
```

Append tests:

```tsx
    it('renders mobile editor layout on narrow screens', () => {
        mocks.isMobileEditor = true

        renderEditorLayout({} as ApiClient)

        expect(screen.getByTestId('mobile-editor-layout')).toBeInTheDocument()
        expect(screen.queryByTestId('editor-layout-body')).not.toBeInTheDocument()
    })

    it('mobile back button returns to agent mode', () => {
        mocks.isMobileEditor = true

        renderEditorLayout({} as ApiClient)
        fireEvent.click(screen.getByText('Mobile back agents'))

        expect(mocks.navigate).toHaveBeenCalledWith({ to: '/sessions' })
    })

    it('shares file and terminal handlers with mobile layout', () => {
        mocks.isMobileEditor = true

        renderEditorLayout({} as ApiClient)
        fireEvent.click(screen.getByText('Mobile open file'))
        fireEvent.click(screen.getByText('Mobile open terminal'))

        expect(screen.getByTestId('mobile-editor-layout')).toHaveTextContent('Mobile tabs: Mobile.tsx')
        expect(mocks.createSession).not.toHaveBeenCalled()
    })
```

- [ ] **Step 2: Run EditorLayout tests and verify failure**

Run:

```bash
bun run --cwd web test src/components/editor/EditorLayout.test.tsx
```

Expected: FAIL because `EditorLayout` does not use `useMediaQuery` or `MobileEditorLayout` yet.

- [ ] **Step 3: Import hook and mobile component**

In `web/src/components/editor/EditorLayout.tsx`, add imports:

```ts
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { MobileEditorLayout } from './MobileEditorLayout'
```

Inside `EditorLayout`, after router/query setup, add:

```ts
    const isMobileEditor = useMediaQuery('(max-width: 767px)')
```

Add this handler near other navigation handlers:

```ts
    const handleBackToAgents = useCallback(() => {
        void navigate({ to: '/sessions' })
    }, [navigate])
```

- [ ] **Step 4: Render MobileEditorLayout before desktop JSX**

After the `if (!props.api)` guard and before the current desktop `return`, add:

```tsx
    if (isMobileEditor) {
        return (
            <MobileEditorLayout
                api={props.api}
                machineId={editor.machineId}
                projectPath={editor.projectPath}
                fileTabs={fileTabs}
                terminalTabs={terminalTabs}
                activeFileTab={activeFileTab}
                activeTerminalTab={activeTerminalTab}
                activeSessionId={editor.activeSessionId}
                pendingDraftText={pendingDraftText}
                newFileTargetPath={newFileTargetPath}
                newSessionError={newSession.error}
                onBackToAgents={handleBackToAgents}
                onBrowseProject={handleBrowseProject}
                onOpenFile={editor.openFile}
                onShowContextMenu={editor.showContextMenu}
                onCreateFile={handleCreateFile}
                onCancelNewFile={handleCancelNewFile}
                onNewFileFromTabs={handleNewFileFromTabs}
                onDirtyChange={editor.setTabDirty}
                onAddSelectionToChat={handleAddSelectionToChat}
                onSelectFileTab={editor.setActiveTabId}
                onCloseTab={editor.closeTab}
                onOpenNewSessionModal={handleOpenNewSessionModal}
                onSessionResolved={handleSessionResolved}
                onExpandDraft={handleExpandDraft}
                onDraftConsumed={() => setPendingDraftText(undefined)}
                onOpenTerminal={handleOpenTerminal}
                onSelectTerminalTab={editor.setActiveTabId}
                onCloseTerminalTab={editor.closeTab}
                onAddTerminalToChat={handleAddTerminalToChat}
                onRegisterTerminalClose={handleRegisterTerminalClose}
            />
        )
    }
```

- [ ] **Step 5: Keep desktop branch unchanged**

Do not remove or restyle the current desktop JSX. The existing `EditorHeader`, sidebars, separators, and terminal collapse logic remain in the non-mobile return branch.

- [ ] **Step 6: Run EditorLayout tests and verify pass**

Run:

```bash
bun run --cwd web test src/components/editor/EditorLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/editor/EditorLayout.tsx web/src/components/editor/EditorLayout.test.tsx
git commit -m "feat(web): enable mobile editor layout"
```

---

### Task 6: Final integration verification and polish

**Files:**
- Modify only files that fail verification from previous tasks.

- [ ] **Step 1: Run focused editor tests**

Run:

```bash
bun run --cwd web test src/components/editor/EditorLayout.test.tsx src/components/editor/MobileEditorLayout.test.tsx src/components/editor/EditorTabs.test.tsx src/components/editor/EditorTerminal.test.tsx src/hooks/useMediaQuery.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run full web tests**

Run:

```bash
bun run test:web
```

Expected: PASS.

- [ ] **Step 3: Run web typecheck**

Run:

```bash
bun run typecheck:web
```

Expected: PASS.

- [ ] **Step 4: Manual browser check**

Run:

```bash
bun run dev:web
```

Open the web app with mobile viewport width below 768px and verify:

- `/editor` shows mobile layout, not three desktop panes.
- `← Agents` navigates to `/sessions`.
- Bottom nav switches Files / Editor / Chat / Term.
- Opening a file from Files switches to Editor.
- Dirty file close prompts Save then close / Discard / Cancel.
- Chat uses compact app styling and composer remains reachable.
- Terminal screen has no collapse bar.
- Desktop width at or above 768px still shows the current three-pane editor.

Stop the dev server after checking.

- [ ] **Step 5: Commit final polish if files changed**

If Step 1-4 required code changes:

```bash
git add web/src
git commit -m "fix(web): polish mobile editor integration"
```

If no files changed, skip this commit.

---

## Self-review

Spec coverage:

- Mobile focus-mode layout: Task 4 and Task 5.
- Desktop layout preserved: Task 5 and Task 6 manual check.
- Agent Mode visual language: Task 4 class choices and Task 6 manual check.
- `← Agents`: Task 4 and Task 5.
- Bottom nav: Task 4.
- Files actions: Task 4 uses existing `EditorFileTree` and context menu flow from `EditorLayout`.
- Editor close/save/selection: Task 2 and Task 4.
- Chat compact reuse: Task 4.
- Terminal full-screen/no collapse/close confirm: Task 3 and Task 4.
- Tests: Tasks 1-6.

Implementation decisions resolved:

1. Breakpoint uses `useMediaQuery('(max-width: 767px)')`.
2. First pass reuses `EditorFileTree`; mobile-specific file action sheet is outside this implementation scope.
3. Terminal close confirmation always appears on mobile because running/idle state is not exposed.
4. Files filter tabs are deferred; existing tree is shipped first for pragmatic scope.

Completeness scan: no `TBD`, `TODO`, or unspecified implementation steps remain.

Type consistency: `MobileEditorView`, `mobileMode`, and handler prop names are defined before use and match across tasks.
