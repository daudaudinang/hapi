# Desktop Focus Session Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a desktop-only Focus action for pinned Agent Mode sessions so users can open a session in a large modal from the compact header button or by double-clicking the header.

**Architecture:** Keep the change frontend-only. Add a focused session modal that reuses the same hook pattern as the existing Team Chat direct-session modal, wire a focus callback through `Dashboard` → `PinnedPanel` → `SessionChat` → `SessionHeader`, and gate the button/double-click behavior to desktop viewports only. Avoid changing Team Chat behavior.

**Tech Stack:** React 19, TypeScript strict, TanStack Query/Router, Vitest + Testing Library, Bun workspace commands from repo root.

---

## File structure and responsibilities

| File | Responsibility in this change |
|---|---|
| `web/src/components/FocusedSessionChatModal.tsx` | New focused session modal for Agent Mode. Fetches session/messages, sends messages, renders `SessionChat` with `hideHeader=true`. |
| `web/src/components/FocusedSessionChatModal.test.tsx` | Tests modal copy, hook wiring, send behavior, and close behavior. |
| `web/src/components/SessionChat.tsx` | Adds optional `onFocusSession` prop and forwards it to `SessionHeader`. |
| `web/src/components/SessionHeader.tsx` | Adds optional desktop-only focus affordance in compact mode: button + header double-click. Blocks child button double-clicks from opening focus. |
| `web/src/components/SessionHeader.test.tsx` | Tests desktop focus button, desktop double-click, child button double-click guard, and mobile disablement. |
| `web/src/components/Dashboard/index.tsx` | Owns `focusedSessionId`, passes focus callback into pinned panels, renders focus modal, closes modal without changing pins. |
| `web/src/components/Dashboard/session-context-menu.test.tsx` | Adds dashboard integration coverage using a mocked `SessionChat` and mocked focus modal. |
| `web/src/components/Dashboard/dashboard.css` | Optional visual polish for focus button. If focus is conditionally not rendered on mobile, CSS only styles desktop appearance. |

Decision: create `FocusedSessionChatModal.tsx` instead of refactoring `TeamSessionChatModal.tsx` first. This keeps Team Chat stable and limits blast radius. Shared modal extraction can happen later if both modals drift.

---

## Task 1: Add focused session modal with tests

**Files:**
- Create: `web/src/components/FocusedSessionChatModal.tsx`
- Create: `web/src/components/FocusedSessionChatModal.test.tsx`

- [ ] **Step 1: Write the failing modal test**

Create `web/src/components/FocusedSessionChatModal.test.tsx`:

```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { AttachmentMetadata, Session } from '@/types/api'
import { FocusedSessionChatModal } from './FocusedSessionChatModal'

const useSessionMock = vi.fn()
const useMessagesMock = vi.fn()
const useSlashCommandsMock = vi.fn()
const useSkillsMock = vi.fn()
const useSendMessageMock = vi.fn()
const useRegisterActiveOverlaySessionMock = vi.fn()
const sessionChatMock = vi.fn()

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: (...args: unknown[]) => useSessionMock(...args)
}))

vi.mock('@/hooks/queries/useMessages', () => ({
    useMessages: (...args: unknown[]) => useMessagesMock(...args)
}))

vi.mock('@/hooks/queries/useSlashCommands', () => ({
    useSlashCommands: (...args: unknown[]) => useSlashCommandsMock(...args)
}))

vi.mock('@/hooks/queries/useSkills', () => ({
    useSkills: (...args: unknown[]) => useSkillsMock(...args)
}))

vi.mock('@/hooks/mutations/useSendMessage', () => ({
    useSendMessage: (...args: unknown[]) => useSendMessageMock(...args)
}))

vi.mock('@/lib/active-chat-session', () => ({
    useRegisterActiveOverlaySession: (...args: unknown[]) => useRegisterActiveOverlaySessionMock(...args)
}))

vi.mock('@/lib/toast-context', () => ({
    useToast: () => ({ toasts: [], addToast: vi.fn(), removeToast: vi.fn() })
}))

vi.mock('@/components/SessionChat', () => ({
    SessionChat: (props: {
        session: Session
        hideHeader?: boolean
        compactMode?: boolean
        disableVoice?: boolean
        onSend: (text: string, attachments?: AttachmentMetadata[]) => void
    }) => {
        sessionChatMock(props)
        return (
            <div data-testid="session-chat">
                Focused Session Chat {props.session.id}
                <button type="button" onClick={() => props.onSend('focus question')}>
                    Send focus
                </button>
            </div>
        )
    }
}))

function makeSession(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        namespace: 'default',
        seq: 1,
        createdAt: 1,
        updatedAt: 1,
        active: true,
        activeAt: 1,
        metadata: { path: '/repo/hapi', host: 'host', flavor: 'codex', name: 'Frontend polish' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 1,
        backgroundTaskCount: 0,
        todos: undefined,
        teamState: undefined,
        model: 'gpt-5.4',
        modelReasoningEffort: null,
        effort: 'high',
        permissionMode: 'default',
        collaborationMode: undefined,
        ...overrides
    }
}

describe('FocusedSessionChatModal', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        useSessionMock.mockReturnValue({ session: makeSession(), isLoading: false, error: null, refetch: vi.fn() })
        useMessagesMock.mockReturnValue({
            messages: [],
            warning: null,
            isLoading: false,
            isLoadingMore: false,
            hasMore: false,
            pendingCount: 0,
            messagesVersion: 0,
            loadMore: vi.fn(),
            refetch: vi.fn(),
            flushPending: vi.fn(),
            setAtBottom: vi.fn()
        })
        useSlashCommandsMock.mockReturnValue({ commands: [], isLoading: false, error: null, getSuggestions: vi.fn(async () => []) })
        useSkillsMock.mockReturnValue({ skills: [], isLoading: false, error: null, getSuggestions: vi.fn(async () => []) })
        useSendMessageMock.mockReturnValue({ sendMessage: vi.fn(), retryMessage: vi.fn(), isSending: false })
    })

    afterEach(() => {
        cleanup()
    })

    it('renders a large focused session chat and sends through the focused session', () => {
        const api = {} as ApiClient
        const onClose = vi.fn()
        const sendMessage = vi.fn()
        useSendMessageMock.mockReturnValue({ sendMessage, retryMessage: vi.fn(), isSending: false })
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

        render(
            <QueryClientProvider client={queryClient}>
                <FocusedSessionChatModal api={api} sessionId="session-1" onClose={onClose} />
            </QueryClientProvider>
        )

        expect(screen.getByRole('dialog', { name: /Focus session/i })).toBeInTheDocument()
        expect(screen.getByText('Frontend polish')).toBeInTheDocument()
        expect(screen.getByText(/gpt-5.4/)).toBeInTheDocument()
        expect(screen.getByTestId('session-chat')).toHaveTextContent('Focused Session Chat session-1')
        expect(useRegisterActiveOverlaySessionMock).toHaveBeenCalledWith('session-1')
        expect(sessionChatMock).toHaveBeenCalledWith(expect.objectContaining({
            api,
            hideHeader: true,
            compactMode: false,
            disableVoice: true
        }))

        fireEvent.click(screen.getByRole('button', { name: /Send focus/i }))
        fireEvent.click(screen.getByRole('button', { name: /Close focus session/i }))

        expect(sendMessage).toHaveBeenCalledWith('focus question', undefined)
        expect(onClose).toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run modal test to verify it fails**

Run from repo root:

```bash
bun --cwd web run test FocusedSessionChatModal.test.tsx
```

Expected: FAIL because `./FocusedSessionChatModal` does not exist.

- [ ] **Step 3: Implement `FocusedSessionChatModal`**

Create `web/src/components/FocusedSessionChatModal.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { SessionChat } from '@/components/SessionChat'
import { LoadingState } from '@/components/LoadingState'
import { useSendMessage } from '@/hooks/mutations/useSendMessage'
import { useMessages } from '@/hooks/queries/useMessages'
import { useSession } from '@/hooks/queries/useSession'
import { useSkills } from '@/hooks/queries/useSkills'
import { useSlashCommands } from '@/hooks/queries/useSlashCommands'
import { useRegisterActiveOverlaySession } from '@/lib/active-chat-session'
import { clearDraftsAfterSend } from '@/lib/clearDraftsAfterSend'
import { fetchLatestMessages, seedMessageWindowFromSession } from '@/lib/message-window-store'
import { queryKeys } from '@/lib/query-keys'
import { useToast } from '@/lib/toast-context'
import { cn } from '@/lib/utils'
import type { AttachmentMetadata, Session } from '@/types/api'

function getSessionTitle(session: Session): string {
    return session.metadata?.name
        ?? session.metadata?.summary?.text
        ?? session.metadata?.path
        ?? session.id.slice(0, 8)
}

function getPendingRequestCount(session: Session): number {
    return session.agentState?.requests ? Object.keys(session.agentState.requests).length : 0
}

function getSessionStatus(session: Session): {
    label: string
    dotClassName: string
    pillClassName: string
} {
    if (getPendingRequestCount(session) > 0) {
        return {
            label: 'Needs input',
            dotClassName: 'bg-amber-400',
            pillClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        }
    }
    if (session.thinking) {
        return {
            label: 'Working',
            dotClassName: 'bg-sky-400',
            pillClassName: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
        }
    }
    if (session.active) {
        return {
            label: 'Active',
            dotClassName: 'bg-emerald-400',
            pillClassName: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        }
    }
    return {
        label: 'Idle',
        dotClassName: 'bg-[var(--app-border)]',
        pillClassName: 'border-[var(--app-border)] bg-[var(--app-secondary-bg)] text-[var(--app-hint)]'
    }
}

function getSessionMetaLine(session: Session): string {
    return [
        session.model,
        session.effort ? `${session.effort} effort` : null,
        session.metadata?.path
    ].filter((item): item is string => Boolean(item)).join(' · ')
}

export function FocusedSessionChatModal(props: {
    api: ApiClient
    sessionId: string
    onClose: () => void
}) {
    const [activeSessionId, setActiveSessionId] = useState(props.sessionId)
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const { session, isLoading, error, refetch: refetchSession } = useSession(props.api, activeSessionId)
    const messagesState = useMessages(props.api, activeSessionId)
    const agentType = session?.metadata?.flavor ?? 'claude'
    const slashCommands = useSlashCommands(props.api, activeSessionId, agentType)
    const skills = useSkills(props.api, activeSessionId)
    useRegisterActiveOverlaySession(activeSessionId)

    useEffect(() => {
        setActiveSessionId(props.sessionId)
    }, [props.sessionId])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') props.onClose()
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [props.onClose])

    const { sendMessage, retryMessage, isSending } = useSendMessage(props.api, activeSessionId, {
        isSessionThinking: session?.thinking ?? false,
        onSuccess: (sentSessionId) => {
            clearDraftsAfterSend(sentSessionId, activeSessionId)
        },
        resolveSessionId: async (currentSessionId) => {
            if (!session || session.active) return currentSessionId
            try {
                return await props.api.resumeSession(currentSessionId, { permissionMode: session.permissionMode ?? undefined })
            } catch (resumeError) {
                const message = resumeError instanceof Error ? resumeError.message : 'Resume failed'
                addToast({ title: 'Resume failed', body: message, sessionId: currentSessionId, url: '' })
                throw resumeError
            }
        },
        onSessionResolved: (resolvedSessionId) => {
            if (resolvedSessionId === activeSessionId) return
            if (session) {
                seedMessageWindowFromSession(session.id, resolvedSessionId)
                queryClient.setQueryData(queryKeys.session(resolvedSessionId), {
                    session: { ...session, id: resolvedSessionId, active: true }
                })
            }
            setActiveSessionId(resolvedSessionId)
            void Promise.all([
                queryClient.prefetchQuery({
                    queryKey: queryKeys.session(resolvedSessionId),
                    queryFn: () => props.api.getSession(resolvedSessionId),
                }),
                fetchLatestMessages(props.api, resolvedSessionId),
            ]).catch(() => {})
        },
        onBlocked: (reason) => {
            if (reason !== 'no-api') return
            addToast({ title: 'Cannot send message', body: 'Hub connection is unavailable.', sessionId: activeSessionId, url: '' })
        }
    })

    const getAutocompleteSuggestions = useCallback(async (query: string) => {
        if (query.startsWith('$')) return await skills.getSuggestions(query)
        return await slashCommands.getSuggestions(query)
    }, [skills, slashCommands])

    const refreshSession = useCallback(() => {
        void refetchSession()
        void messagesState.refetch()
    }, [messagesState, refetchSession])

    const status = useMemo(() => session ? getSessionStatus(session) : null, [session])
    const title = session ? getSessionTitle(session) : activeSessionId.slice(0, 8)
    const metaLine = session ? getSessionMetaLine(session) : ''

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-label="Focus session"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-2 backdrop-blur-sm sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) props.onClose()
            }}
        >
            <div className="flex h-[min(92vh,900px)] w-[min(1120px,calc(100vw-1rem))] min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--app-border)] bg-[var(--app-bg)] text-[var(--app-fg)] shadow-2xl sm:w-[min(1120px,calc(100vw-2rem))]">
                <div className="border-b border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 sm:px-4">
                    <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <div className="truncate text-sm font-semibold sm:text-base">Focus session</div>
                                {status ? (
                                    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium', status.pillClassName)}>
                                        <span className={cn('h-1.5 w-1.5 rounded-full', status.dotClassName, session?.thinking ? 'animate-pulse' : '')} />
                                        {status.label}
                                    </span>
                                ) : null}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[var(--app-hint)]">{title}</div>
                            {metaLine ? <div className="mt-0.5 truncate text-[11px] text-[var(--app-hint)]">{metaLine}</div> : null}
                        </div>
                        <button
                            type="button"
                            aria-label="Close focus session"
                            onClick={props.onClose}
                            className="rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                        >
                            Close
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1">
                    {isLoading ? (
                        <div className="flex h-full items-center justify-center p-4">
                            <LoadingState label="Loading focused session…" className="text-sm" />
                        </div>
                    ) : error || !session ? (
                        <div className="flex h-full items-center justify-center p-4 text-sm text-red-500">
                            {error ?? 'Focused session unavailable'}
                        </div>
                    ) : (
                        <SessionChat
                            key={session.id}
                            api={props.api}
                            session={session}
                            messages={messagesState.messages}
                            messagesWarning={messagesState.warning}
                            hasMoreMessages={messagesState.hasMore}
                            isLoadingMessages={messagesState.isLoading}
                            isLoadingMoreMessages={messagesState.isLoadingMore}
                            isSending={isSending}
                            pendingCount={messagesState.pendingCount}
                            messagesVersion={messagesState.messagesVersion}
                            onBack={props.onClose}
                            onRefresh={refreshSession}
                            onLoadMore={messagesState.loadMore}
                            onSend={(text: string, attachments?: AttachmentMetadata[]) => sendMessage(text, attachments)}
                            onFlushPending={messagesState.flushPending}
                            onAtBottomChange={messagesState.setAtBottom}
                            onRetryMessage={retryMessage}
                            autocompleteSuggestions={getAutocompleteSuggestions}
                            availableSlashCommands={slashCommands.commands}
                            hideHeader={true}
                            compactMode={false}
                            disableVoice={true}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Run modal test to verify it passes**

Run:

```bash
bun --cwd web run test FocusedSessionChatModal.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit modal**

```bash
git add web/src/components/FocusedSessionChatModal.tsx web/src/components/FocusedSessionChatModal.test.tsx
git commit -m "feat: add focused session modal"
```

---

## Task 2: Wire focus affordance through SessionChat and SessionHeader

**Files:**
- Modify: `web/src/components/SessionChat.tsx`
- Modify: `web/src/components/SessionHeader.tsx`
- Modify: `web/src/components/SessionHeader.test.tsx`
- Modify: `web/src/components/Dashboard/dashboard.css`

- [ ] **Step 1: Write failing SessionHeader focus tests**

Append these helpers near the top of `web/src/components/SessionHeader.test.tsx`, after `makeSession`:

```tsx
function setDesktopViewport(isDesktop: boolean) {
    Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        value: vi.fn((query: string) => ({
            matches: query.includes('max-width') ? !isDesktop : isDesktop,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn()
        }))
    })
}
```

Add this `beforeEach` line inside the existing `describe('SessionHeader editor entry point', ...)` block:

```tsx
setDesktopViewport(true)
```

Append these tests inside the same describe block:

```tsx
it('shows a desktop-only compact focus button and opens focus from it', () => {
    setDesktopViewport(true)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onFocusSession = vi.fn()

    render(
        <QueryClientProvider client={qc}>
            <SessionHeader
                session={makeSession()}
                onBack={vi.fn()}
                api={null}
                compactMode
                pinIndex={1}
                onFocusSession={onFocusSession}
            />
        </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Focus session' }))

    expect(onFocusSession).toHaveBeenCalledTimes(1)
})

it('opens focus when double-clicking the compact header title on desktop', () => {
    setDesktopViewport(true)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onFocusSession = vi.fn()

    render(
        <QueryClientProvider client={qc}>
            <SessionHeader
                session={makeSession()}
                onBack={vi.fn()}
                api={null}
                compactMode
                pinIndex={1}
                onFocusSession={onFocusSession}
            />
        </QueryClientProvider>
    )

    fireEvent.doubleClick(screen.getByText('repo'))

    expect(onFocusSession).toHaveBeenCalledTimes(1)
})

it('does not open focus when double-clicking compact header action buttons', () => {
    setDesktopViewport(true)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onFocusSession = vi.fn()
    const onBack = vi.fn()

    render(
        <QueryClientProvider client={qc}>
            <SessionHeader
                session={makeSession()}
                onBack={onBack}
                api={null}
                compactMode
                pinIndex={1}
                onFocusSession={onFocusSession}
            />
        </QueryClientProvider>
    )

    fireEvent.doubleClick(screen.getByTitle('button.files'))
    fireEvent.doubleClick(screen.getByTitle('button.terminal'))
    fireEvent.doubleClick(screen.getByTitle('session.more'))
    fireEvent.doubleClick(screen.getByTitle('Unpin this session'))

    expect(onFocusSession).not.toHaveBeenCalled()
})

it('does not render compact focus controls or double-click behavior on mobile', () => {
    setDesktopViewport(false)
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onFocusSession = vi.fn()

    render(
        <QueryClientProvider client={qc}>
            <SessionHeader
                session={makeSession()}
                onBack={vi.fn()}
                api={null}
                compactMode
                pinIndex={1}
                onFocusSession={onFocusSession}
            />
        </QueryClientProvider>
    )

    expect(screen.queryByRole('button', { name: 'Focus session' })).not.toBeInTheDocument()
    fireEvent.doubleClick(screen.getByText('repo'))

    expect(onFocusSession).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run SessionHeader test to verify it fails**

Run:

```bash
bun --cwd web run test SessionHeader.test.tsx
```

Expected: FAIL because `onFocusSession` prop and Focus button do not exist.

- [ ] **Step 3: Add SessionChat prop forwarding**

In `web/src/components/SessionChat.tsx`, add this optional prop to the `SessionChat` props object:

```ts
onFocusSession?: () => void
```

In the `SessionHeader` render block, pass it through:

```tsx
<SessionHeader
    session={props.session}
    onBack={props.onBack}
    onViewFiles={terminalSupported ? handleViewFiles : undefined}
    onOpenOutline={() => setOutlineOpen(true)}
    api={props.api}
    onSessionDeleted={props.onBack}
    compactMode={props.compactMode}
    pinIndex={props.pinIndex}
    onFocusSession={props.onFocusSession}
/>
```

- [ ] **Step 4: Add desktop focus helpers and prop to SessionHeader**

In `web/src/components/SessionHeader.tsx`, update the props type:

```ts
onFocusSession?: () => void
```

Add this helper near the other small helper functions:

```tsx
function isDesktopFocusViewport(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
    return !window.matchMedia('(max-width: 768px)').matches
}
```

Inside `SessionHeader`, add state/effect after the existing `useState` calls:

```tsx
const [desktopFocusEnabled, setDesktopFocusEnabled] = useState(() => isDesktopFocusViewport())

useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(max-width: 768px)')
    const update = () => setDesktopFocusEnabled(!media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
}, [])

const canFocusSession = Boolean(compactMode && props.onFocusSession && desktopFocusEnabled)
```

Add a compact header double-click handler before the `if (compactMode)` return:

```tsx
const handleCompactHeaderDoubleClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!canFocusSession) return
    const target = event.target as HTMLElement | null
    if (target?.closest('button,a,input,select,textarea,[role="button"],[data-focus-ignore="true"]')) return
    props.onFocusSession?.()
}, [canFocusSession, props.onFocusSession])
```

- [ ] **Step 5: Render focus button and double-click handler in compact header**

In the compact mode JSX, update the header wrapper:

```tsx
<div className="db-pinned__compact-header" onDoubleClick={handleCompactHeaderDoubleClick}>
```

Inside `.db-pinned__compact-actions`, place this before the Editor button:

```tsx
{canFocusSession ? (
    <button
        type="button"
        className="db-pinned__compact-action db-pinned__compact-action--focus"
        onClick={props.onFocusSession}
        onDoubleClick={(event) => event.stopPropagation()}
        title="Focus session"
        aria-label="Focus session"
    >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M9 21H3v-6" />
            <path d="M14 10 3 21" />
        </svg>
    </button>
) : null}
```

Add `onDoubleClick={(event) => event.stopPropagation()}` to each compact child button: Editor, Team, Files, Terminal, More, and Unpin. Example for Files:

```tsx
<button
    type="button"
    className="db-pinned__compact-action"
    onClick={() => navigate({ search: (prev: any) => ({ ...prev, modal: 'files', modalSessionId: session.id }) } as any)}
    onDoubleClick={(event) => event.stopPropagation()}
    title="Files"
>
    <FolderIcon className="w-4 h-4" />
</button>
```

Use the same `onDoubleClick` pattern on the other compact action buttons.

- [ ] **Step 6: Add focus button CSS polish**

In `web/src/components/Dashboard/dashboard.css`, near `.db-pinned__compact-action`, add:

```css
.db-pinned__compact-action--focus {
    color: var(--app-fg);
}
```

No mobile CSS is needed if the component does not render the button on mobile.

- [ ] **Step 7: Run SessionHeader test to verify it passes**

Run:

```bash
bun --cwd web run test SessionHeader.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit header wiring**

```bash
git add web/src/components/SessionChat.tsx web/src/components/SessionHeader.tsx web/src/components/SessionHeader.test.tsx web/src/components/Dashboard/dashboard.css
git commit -m "feat: add desktop focus control to pinned header"
```

---

## Task 3: Wire Dashboard focus modal

**Files:**
- Modify: `web/src/components/Dashboard/index.tsx`
- Modify: `web/src/components/Dashboard/session-context-menu.test.tsx`

- [ ] **Step 1: Write failing Dashboard integration test**

In `web/src/components/Dashboard/session-context-menu.test.tsx`, add this mock after the existing `SessionChat` mock, replacing that mock with a version that can call the focus callback:

```tsx
vi.mock('@/components/SessionChat', () => ({
    SessionChat: (props: { session: { id: string }; onFocusSession?: () => void }) => (
        <div data-testid="pinned-panel">
            {props.session.id}
            {props.onFocusSession ? (
                <button type="button" onClick={props.onFocusSession}>Mock focus session</button>
            ) : null}
        </div>
    )
}))

vi.mock('@/components/FocusedSessionChatModal', () => ({
    FocusedSessionChatModal: (props: { sessionId: string; onClose: () => void }) => (
        <div role="dialog" aria-label="Focus session">
            Focused modal {props.sessionId}
            <button type="button" onClick={props.onClose}>Close focused modal</button>
        </div>
    )
}))
```

If the file already has a `vi.mock('@/components/SessionChat'...)`, replace it with the version above instead of adding a duplicate mock.

Add this test inside `describe('Dashboard session context menu', ...)`:

```tsx
it('opens and closes the focused session modal from a pinned panel focus callback', () => {
    renderDashboard()

    fireEvent.click(screen.getByText('Build app'))
    fireEvent.click(screen.getByRole('button', { name: 'Mock focus session' }))

    expect(screen.getByRole('dialog', { name: 'Focus session' })).toHaveTextContent('Focused modal session-1')
    expect(sessionStorage.getItem('mc-pinned-ids')).toBe(JSON.stringify(['session-1']))

    fireEvent.click(screen.getByRole('button', { name: 'Close focused modal' }))

    expect(screen.queryByRole('dialog', { name: 'Focus session' })).not.toBeInTheDocument()
    expect(sessionStorage.getItem('mc-pinned-ids')).toBe(JSON.stringify(['session-1']))
})
```

- [ ] **Step 2: Run Dashboard test to verify it fails**

Run:

```bash
bun --cwd web run test session-context-menu.test.tsx
```

Expected: FAIL because `Dashboard` does not pass `onFocusSession` to pinned panels or render `FocusedSessionChatModal`.

- [ ] **Step 3: Import focus modal and add Dashboard state**

In `web/src/components/Dashboard/index.tsx`, add import:

```tsx
import { FocusedSessionChatModal } from '@/components/FocusedSessionChatModal'
```

Inside `Dashboard`, next to other state:

```tsx
const [focusedSessionId, setFocusedSessionId] = useState<string | null>(null)
```

- [ ] **Step 4: Add focus callback to PinnedPanel**

Update `PinnedPanelProps`:

```ts
onFocusSession?: () => void
```

Update function signature:

```tsx
function PinnedPanel({ sessionId, api, onUnpin, onSessionResolved, onFocusSession, pinIndex, compact, isActive, onFocus }: PinnedPanelProps) {
```

Pass through to `SessionChat`:

```tsx
<SessionChat
    api={api!}
    session={session}
    messages={messages}
    messagesWarning={messagesWarning}
    hasMoreMessages={messagesHasMore}
    isLoadingMessages={messagesLoading}
    isLoadingMoreMessages={messagesLoadingMore}
    isSending={isSending}
    pendingCount={pendingCount}
    messagesVersion={messagesVersion}
    onBack={onUnpin}
    onRefresh={refreshSession}
    onLoadMore={loadMoreMessages}
    onSend={(text: string, attachments?: AttachmentMetadata[]) => sendMessage(text, attachments)}
    onFlushPending={flushPending}
    onAtBottomChange={setAtBottom}
    onRetryMessage={retryMessage}
    autocompleteSuggestions={getAutocompleteSuggestions}
    availableSlashCommands={slashCommands}
    disableVoice
    compactMode={true}
    pinIndex={pinIndex}
    onFocusSession={onFocusSession}
/>
```

- [ ] **Step 5: Pass focus callback from pinned panel render**

In the pinned panels map in `Dashboard`, add:

```tsx
onFocusSession={() => setFocusedSessionId(s.id)}
```

The `PinnedPanel` call should include:

```tsx
<PinnedPanel
    sessionId={s.id}
    api={api}
    onUnpin={() => handleUnpin(s.id)}
    onSessionResolved={(newId) => {
        setPinnedIds(prev => prev.map(id => id === s.id ? newId : id))
        setFocusedSessionId(current => current === s.id ? newId : current)
    }}
    onFocusSession={() => setFocusedSessionId(s.id)}
    pinIndex={idx + 1}
    compact={true}
    isActive={activePinIndex === idx}
    onFocus={() => setActivePinIndex(idx)}
/>
```

- [ ] **Step 6: Render modal and close without changing pins**

Near the other Dashboard modal renders, before the `pendingReplacePin` block, add:

```tsx
{api && focusedSessionId ? (
    <FocusedSessionChatModal
        api={api}
        sessionId={focusedSessionId}
        onClose={() => setFocusedSessionId(null)}
    />
) : null}
```

- [ ] **Step 7: Run Dashboard test to verify it passes**

Run:

```bash
bun --cwd web run test session-context-menu.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit Dashboard wiring**

```bash
git add web/src/components/Dashboard/index.tsx web/src/components/Dashboard/session-context-menu.test.tsx
git commit -m "feat: open focused session modal from dashboard"
```

---

## Task 4: Run focused regression checks

**Files:**
- No code changes expected unless checks fail.

- [ ] **Step 1: Run modal test**

```bash
bun --cwd web run test FocusedSessionChatModal.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run header test**

```bash
bun --cwd web run test SessionHeader.test.tsx
```

Expected: PASS.

- [ ] **Step 3: Run dashboard test**

```bash
bun --cwd web run test session-context-menu.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run web typecheck**

```bash
bun --cwd web run typecheck
```

Expected: PASS, no TypeScript errors.

- [ ] **Step 5: Run all web tests if focused checks pass**

```bash
bun --cwd web run test
```

Expected: PASS. If unrelated existing tests fail, capture the failing test names and errors before changing anything else.

- [ ] **Step 6: Commit verification-only fixes if needed**

If any small test/type fix was required during verification:

```bash
git add web/src/components/FocusedSessionChatModal.tsx web/src/components/FocusedSessionChatModal.test.tsx web/src/components/SessionChat.tsx web/src/components/SessionHeader.tsx web/src/components/SessionHeader.test.tsx web/src/components/Dashboard/index.tsx web/src/components/Dashboard/session-context-menu.test.tsx web/src/components/Dashboard/dashboard.css
git commit -m "test: cover desktop focus session modal"
```

If no fixes were needed, skip this commit.

---

## Manual QA checklist

Run the app locally:

```bash
bun run dev:web
```

Check these cases in a desktop browser:

- [ ] Pin 3 sessions, click Focus button in a compact header, modal opens correct session.
- [ ] Pin 4 sessions, click Focus button, modal opens correct session and 2x2 layout stays behind it.
- [ ] Double-click compact header title/background, modal opens correct session.
- [ ] Double-click Files, Terminal, More, and Unpin buttons; focus modal does not open from those child buttons.
- [ ] Send a message in the focus modal; message is sent to the same session.
- [ ] Close modal; pinned sessions remain pinned.

Check mobile viewport at or below 768px:

- [ ] Focus button is not rendered.
- [ ] Double-click/tap header does not open focus modal.
- [ ] Existing mobile pin tab behavior still works.

---

## Rollback plan

If the feature causes layout or modal issues:

```bash
git revert <commit-for-dashboard-wiring> <commit-for-header-wiring> <commit-for-focused-modal>
```

Frontend-only rollback is enough. No database, backend, API, or stored session data changes are involved.

---

## Self-review

- Spec coverage: desktop button, desktop double-click, mobile exclusion, modal chat behavior, close behavior, and pinned layout preservation are covered by Tasks 1–4 and manual QA.
- Placeholder scan: no placeholder implementation steps remain; every code-changing step has concrete code or exact edit instructions.
- Type consistency: `onFocusSession?: () => void` is consistently used in `SessionChat`, `SessionHeader`, `PinnedPanelProps`, and Dashboard wiring.
