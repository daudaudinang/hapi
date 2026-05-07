# Session Context Menu & Per-Tab Pins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace localStorage+URL pins with per-tab sessionStorage pins, add unified right-click context menu (Pin/Unpin, Archive, Delete, Open in new tab, Copy session ID) with desktop floating menu + mobile bottom sheet.

**Architecture:** sessionStorage for tab-scoped pin state (no URL sync needed). Unified `SessionContextMenu` component replaces `PinnedSessionContextMenu`, rendered on all session cards via `onContextMenu` (desktop) or `onClick` long-press (mobile). Archive/Delete single sessions via existing API endpoints with `window.confirm()` dialogs.

**Tech Stack:** React, TanStack Router, TanStack Query, CSS custom properties, sessionStorage API

---

## File Structure

| File | Role |
|------|------|
| `web/src/components/Dashboard/index.tsx` | Core: sessionStorage pins, unified context menu, double-click, archive/delete handlers |
| `web/src/components/Dashboard/dashboard.css` | Context menu, bottom sheet, confirm dialog styles |
| `web/src/router.tsx` | Remove `pins` from search schema |
| `web/src/routes/dashboard/index.tsx` | Remove pins from URL → props |
| `web/src/components/ToastContainer.tsx` | No change needed (already dispatches custom event) |
| `web/src/components/modals/NewSessionModal.tsx` | sessionStorage write instead of URL navigate |
| `web/src/components/modals/ReplacePinModal.tsx` | sessionStorage write instead of URL navigate |
| `web/src/lib/locales/en.ts` | New i18n keys |
| `web/src/lib/locales/vi-VN.ts` | New i18n keys |
| `web/src/lib/locales/zh-CN.ts` | New i18n keys |

---

### Task 1: Add i18n keys for new context menu actions

**Files:**
- Modify: `web/src/lib/locales/en.ts`
- Modify: `web/src/lib/locales/vi-VN.ts`
- Modify: `web/src/lib/locales/zh-CN.ts`

- [ ] **Step 1: Add English i18n keys**

In `web/src/lib/locales/en.ts`, after the existing `dashboard` block (line ~368), add:

```typescript
'dashboard.archiveSession': 'Archive session',
'dashboard.deleteSession': 'Delete session',
'dashboard.openInNewTab': 'Open in new tab',
'dashboard.copySessionId': 'Copy session ID',
'dashboard.copied': 'Copied!',
'dashboard.confirmArchiveSingle': 'Archive this session?',
'dashboard.confirmDeleteSingle': 'Permanently delete this session? This cannot be undone.',
```

- [ ] **Step 2: Add Vietnamese i18n keys**

In `web/src/lib/locales/vi-VN.ts`, after the existing `dashboard` block, add:

```typescript
'dashboard.archiveSession': 'Lưu trữ phiên',
'dashboard.deleteSession': 'Xóa phiên',
'dashboard.openInNewTab': 'Mở trong tab mới',
'dashboard.copySessionId': 'Sao chép ID phiên',
'dashboard.copied': 'Đã sao chép!',
'dashboard.confirmArchiveSingle': 'Lưu trữ phiên này?',
'dashboard.confirmDeleteSingle': 'Xóa vĩnh viễn phiên này? Không thể hoàn tác.',
```

- [ ] **Step 3: Add Chinese i18n keys**

In `web/src/lib/locales/zh-CN.ts`, after the existing `dashboard` block, add:

```typescript
'dashboard.archiveSession': '归档会话',
'dashboard.deleteSession': '删除会话',
'dashboard.openInNewTab': '在新标签页打开',
'dashboard.copySessionId': '复制会话 ID',
'dashboard.copied': '已复制！',
'dashboard.confirmArchiveSingle': '归档此会话？',
'dashboard.confirmDeleteSingle': '永久删除此会话？此操作不可撤销。',
```

---

### Task 2: Migrate pin storage from localStorage+URL to sessionStorage

**Files:**
- Modify: `web/src/components/Dashboard/index.tsx:714-770`

- [ ] **Step 1: Update LS_PINS_KEY comment and change storage**

At line 714, replace:
```typescript
const LS_PINS_KEY = 'mc-pinned-ids'
```

With:
```typescript
const PINS_KEY = 'mc-pinned-ids'  // sessionStorage — per-tab, survives refresh, auto-clears on tab close
```

- [ ] **Step 2: Update useState initializer to read from sessionStorage**

At lines 742-753, replace:
```typescript
const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    // URL takes priority
    if (initialPinnedIds.length > 0) return initialPinnedIds.slice(0, MAX_PINS)
    // Fallback to localStorage
    try {
        const saved = localStorage.getItem(LS_PINS_KEY)
        if (saved) return (JSON.parse(saved) as string[]).slice(0, MAX_PINS)
    } catch { /* ignore */ }
    return []
})
```

With:
```typescript
const [pinnedIds, setPinnedIds] = useState<string[]>(() => {
    try {
        const saved = sessionStorage.getItem(PINS_KEY)
        if (saved) return (JSON.parse(saved) as string[]).slice(0, MAX_PINS)
    } catch { /* ignore */ }
    return []
})
```

- [ ] **Step 3: Remove the initialPinnedIds sync useEffect**

Delete lines 756-765 (the entire `useEffect` that syncs `initialPinnedIds → pinnedIds`):
```typescript
// DELETE THIS BLOCK:
useEffect(() => {
    const incoming = initialPinnedIds.join(',')
    const current = pinnedIds.join(',')
    if (incoming !== current && incoming !== '') {
        setPinnedIds(initialPinnedIds.slice(0, MAX_PINS))
    }
}, [initialPinnedIds.join(',')])
```

- [ ] **Step 4: Update the pinnedIds → storage sync useEffect**

Replace lines 766-770:
```typescript
useEffect(() => {
    localStorage.setItem(LS_PINS_KEY, JSON.stringify(pinnedIds))
    const pinsParam = pinnedIds.length > 0 ? pinnedIds.join(',') : undefined
    void navigate({ to: '/sessions', search: (prev) => ({ ...prev, pins: pinsParam }), replace: true })
}, [pinnedIds, navigate])
```

With:
```typescript
useEffect(() => {
    sessionStorage.setItem(PINS_KEY, JSON.stringify(pinnedIds))
}, [pinnedIds])
```

- [ ] **Step 5: Verify no remaining localStorage or `pins` URL references**

Run: `grep -n "localStorage\|LS_PINS_KEY\|\?pins\|pinsParam\|search.*pins" web/src/components/Dashboard/index.tsx`

Expected: Only `LS_PINS_KEY` should have been renamed to `PINS_KEY`. No `localStorage`, no `pinsParam`, no `navigate` calls with `pins`.

---

### Task 3: Add archive/delete single-session handlers and API calls

**Files:**
- Modify: `web/src/components/Dashboard/index.tsx`

- [ ] **Step 1: Add archive and delete handlers after existing `handleUnpinAll`**

At line ~917 (after `handleUnpinAll`), add:

```typescript
const handleArchiveSession = useCallback(async (sessionId: string) => {
    if (!api) return
    if (!window.confirm(t('dashboard.confirmArchiveSingle'))) return
    try {
        await api.archiveSession(sessionId)
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    } catch (err) {
        console.error('Archive failed:', err)
    }
}, [api, queryClient, t])

const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (!api) return
    if (!window.confirm(t('dashboard.confirmDeleteSingle'))) return
    try {
        await api.deleteSession(sessionId)
        void queryClient.invalidateQueries({ queryKey: queryKeys.sessions })
    } catch (err) {
        console.error('Delete failed:', err)
    }
}, [api, queryClient, t])
```

- [ ] **Step 2: Verify API client has archiveSession and deleteSession methods**

Run: `grep -n "archiveSession\|deleteSession" web/src/api/client.ts`

Expected: Both methods exist. If not, note them and continue (spec says existing endpoints are sufficient).

---

### Task 4: Replace PinnedSessionContextMenu with unified SessionContextMenu

**Files:**
- Modify: `web/src/components/Dashboard/index.tsx:401-500`

- [ ] **Step 1: Delete old PinnedSessionContextMenu component (lines 401-480)**

Delete the entire `PinnedSessionContextMenu` function and its `PinnedSessionContextMenuProps` interface.

- [ ] **Step 2: Add new SessionContextMenuProps interface and SessionContextMenu component at the same location**

```typescript
// ─── Session Context Menu ─────────────────────────────────────────────────────

interface SessionContextMenuProps {
    sessionId: string
    sessionTitle: string
    x: number
    y: number
    isPinned: boolean
    onFocus: () => void
    onPin: () => void
    onUnpin: () => void
    onArchive: () => void
    onDelete: () => void
    onCancel: () => void
}

function SessionContextMenu({ sessionId, sessionTitle, x, y, isPinned, onFocus, onPin, onUnpin, onArchive, onDelete, onCancel }: SessionContextMenuProps) {
    const { t } = useTranslation()
    const menuRef = useRef<HTMLDivElement>(null)
    const [pos, setPos] = useState({ left: x, top: y })
    const isMobile = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

    // Adjust position for desktop floating menu
    useEffect(() => {
        if (isMobile) return
        if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect()
            let newX = x
            let newY = y
            if (x + rect.width > window.innerWidth) newX = window.innerWidth - rect.width - 10
            if (y + rect.height > window.innerHeight) newY = window.innerHeight - rect.height - 10
            setPos({ left: newX, top: newY })
        }
    }, [x, y, isMobile])

    // Close on outside click (desktop) or overlay click (mobile)
    useEffect(() => {
        const handleClickOutside = () => onCancel()
        const timer = setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 10)
        return () => {
            clearTimeout(timer)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [onCancel])

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', handleKeyDown)
        return () => document.removeEventListener('keydown', handleKeyDown)
    }, [onCancel])

    const [copied, setCopied] = useState(false)
    const handleCopyId = useCallback(() => {
        void navigator.clipboard.writeText(sessionId).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
        })
    }, [sessionId])

    const menuItems = (
        <>
            {/* Header */}
            <div className="db__context-menu-header">
                {sessionTitle}
            </div>

            {/* Pin / Unpin toggle */}
            <button type="button" className="db__context-menu-item" onClick={() => { isPinned ? onUnpin() : onPin(); onCancel() }}>
                <PinIcon filled={isPinned} />
                <span>{isPinned ? t('dashboard.unpinSession') : t('dashboard.pinSession')}</span>
            </button>

            {/* Focus (only when pinned) */}
            {isPinned && (
                <button type="button" className="db__context-menu-item" onClick={() => { onFocus(); onCancel() }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                    </svg>
                    <span>{t('dashboard.focus')}</span>
                </button>
            )}

            <div className="db__context-menu-divider" />

            {/* Archive */}
            <button type="button" className="db__context-menu-item" onClick={() => { onArchive(); onCancel() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="21 8 21 21 3 21 3 8"/>
                    <rect x="1" y="3" width="22" height="5"/>
                    <line x1="10" y1="12" x2="14" y2="12"/>
                </svg>
                <span>{t('dashboard.archiveSession')}</span>
            </button>

            {/* Delete */}
            <button type="button" className="db__context-menu-item db__context-menu-item--danger" onClick={() => { onDelete(); onCancel() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                </svg>
                <span>{t('dashboard.deleteSession')}</span>
            </button>

            <div className="db__context-menu-divider" />

            {/* Open in new tab */}
            <button type="button" className="db__context-menu-item" onClick={() => { window.open(`/sessions/${sessionId}`, '_blank'); onCancel() }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
                <span>{t('dashboard.openInNewTab')}</span>
            </button>

            {/* Copy session ID */}
            <button type="button" className="db__context-menu-item" onClick={handleCopyId}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                <span>{copied ? t('dashboard.copied') : t('dashboard.copySessionId')}</span>
            </button>
        </>
    )

    // Mobile: bottom sheet overlay
    if (isMobile) {
        return (
            <div className="db__bottom-sheet-overlay" onClick={onCancel}>
                <div className="db__bottom-sheet" onClick={e => e.stopPropagation()}>
                    {menuItems}
                    <button type="button" className="db__context-menu-item db__context-menu-item--cancel" onClick={onCancel}>
                        {t('dashboard.cancel')}
                    </button>
                </div>
            </div>
        )
    }

    // Desktop: floating menu
    return (
        <div
            ref={menuRef}
            className="db__context-menu"
            style={{
                position: 'fixed',
                left: pos.left,
                top: pos.top,
                zIndex: 9999,
            }}
            onMouseDown={e => e.stopPropagation()}
        >
            {menuItems}
        </div>
    )
}
```

---

### Task 5: Update Dashboard render to wire context menu and double-click

**Files:**
- Modify: `web/src/components/Dashboard/index.tsx`

- [ ] **Step 1: Update `handlePin` to trigger context menu on pinned sessions always**

At lines 881-898, replace `handlePin` with:

```typescript
const handlePin = useCallback((sessionId: string, e?: React.MouseEvent) => {
    if (e) {
        // Right-click or click on pin button — show context menu
        setPinnedAction({ id: sessionId, x: e.clientX, y: e.clientY })
        return
    }
    // Double-click — toggle pin
    if (pinnedIds.includes(sessionId)) {
        setPinnedIds(prev => prev.filter(id => id !== sessionId))
        return
    }
    if (pinnedIds.length >= MAX_PINS) {
        setPendingReplacePin(sessionId)
        return
    }
    setPinnedIds(prev => [...prev, sessionId])
    setActivePinIndex(pinnedIds.length)
    setShowOverviewDrawer(false)
}, [pinnedIds])

const handleContextMenu = useCallback((sessionId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPinnedAction({ id: sessionId, x: e.clientX, y: e.clientY })
}, [])
```

- [ ] **Step 2: Update SessionCard to accept and use `onContextMenu` and `onDoubleClick`**

At lines 262-271 (SessionCardProps), add the new props:

Replace:
```typescript
interface SessionCardProps {
    session: SessionSummary
    status: SessionStatus
    isPinned: boolean
    pinIndex?: number
    pinDisabled?: boolean
    compact?: boolean
    isAddedArchived?: boolean
    isHighlighted?: boolean
    onSelect: (e?: React.MouseEvent) => void
    onDetach?: () => void
    onFocusCapture?: () => void
}
```

With:
```typescript
interface SessionCardProps {
    session: SessionSummary
    status: SessionStatus
    isPinned: boolean
    pinIndex?: number
    pinDisabled?: boolean
    compact?: boolean
    isAddedArchived?: boolean
    isHighlighted?: boolean
    onSelect: (e?: React.MouseEvent) => void
    onDetach?: () => void
    onFocusCapture?: () => void
    onContextMenu?: (e: React.MouseEvent) => void
    onDoubleClick?: () => void
}
```

- [ ] **Step 3: Update SessionCard destructuring**

At line 276, replace:
```typescript
function SessionCard({ session, status, isPinned, pinIndex, pinDisabled, compact, isAddedArchived, isHighlighted, onSelect, onDetach, onFocusCapture }: SessionCardProps) {
```

With:
```typescript
function SessionCard({ session, status, isPinned, pinIndex, pinDisabled, compact, isAddedArchived, isHighlighted, onSelect, onDetach, onFocusCapture, onContextMenu, onDoubleClick }: SessionCardProps) {
```

- [ ] **Step 4: Add `onContextMenu` and `onDoubleClick` to SessionCard root div**

At lines ~300-312 (the root div of SessionCard), add the handlers:

Replace:
```typescript
<div
    className={[
        // ... existing classes
    ].filter(Boolean).join(' ')}
    onClick={(e) => onSelect(e)}
    role="button"
    tabIndex={0}
    onFocusCapture={onFocusCapture}
    onKeyDown={(e) => { if (e.key === 'Enter') onSelect() }}
    title={isPinned ? t('dashboard.clickToUnpin') : t('dashboard.clickToPin')}
>
```

With:
```typescript
<div
    className={[
        // ... existing classes unchanged
    ].filter(Boolean).join(' ')}
    onClick={(e) => onSelect(e)}
    onContextMenu={onContextMenu}
    onDoubleClick={onDoubleClick}
    role="button"
    tabIndex={0}
    onFocusCapture={onFocusCapture}
    onKeyDown={(e) => { if (e.key === 'Enter') onSelect() }}
    title={isPinned ? t('dashboard.rightClickForMenu') : t('dashboard.rightClickForMenu')}
>
```

- [ ] **Step 5: Update pin button onClick in SessionCard**

At lines ~346-353, replace the pin button so it triggers context menu instead of `onSelect`:

Replace:
```typescript
<button
    type="button"
    className={`db-card__pin-btn ${isPinned ? 'db-card__pin-btn--active' : ''}`}
    onClick={e => { e.stopPropagation(); onSelect(e) }}
    title={isPinned ? t('dashboard.unpinSession') : t('dashboard.pinSession')}
>
    <PinIcon filled={isPinned} />
</button>
```

With:
```typescript
<button
    type="button"
    className={`db-card__pin-btn ${isPinned ? 'db-card__pin-btn--active' : ''}`}
    onClick={e => { e.stopPropagation(); onContextMenu ? onContextMenu(e) : onSelect(e) }}
    title={isPinned ? t('dashboard.unpinSession') : t('dashboard.pinSession')}
>
    <PinIcon filled={isPinned} />
</button>
```

- [ ] **Step 6: Pass `onContextMenu` and `onDoubleClick` props to all SessionCard instances**

There are 3 places where `SessionCard` is rendered (lines ~1167, ~1266, and the 4th-cell placeholder):

For each `<SessionCard ... />` instance, add these two props:
```tsx
onContextMenu={(e) => handleContextMenu(session.id, e)}
onDoubleClick={() => handlePin(session.id)}
```

Example — change from:
```tsx
<SessionCard
    key={session.id}
    session={session}
    status={statuses.get(session.id) ?? 'archived'}
    isPinned={pinnedIds.includes(session.id)}
    pinIndex={...}
    pinDisabled={...}
    compact={true}
    isAddedArchived={...}
    isHighlighted={...}
    onSelect={(e) => {
        if (session.id === modalNewSessionId) clearNewSessionHighlight()
        handlePin(session.id, e)
    }}
    onFocusCapture={() => { ... }}
/>
```

To:
```tsx
<SessionCard
    key={session.id}
    session={session}
    status={statuses.get(session.id) ?? 'archived'}
    isPinned={pinnedIds.includes(session.id)}
    pinIndex={...}
    pinDisabled={...}
    compact={true}
    isAddedArchived={...}
    isHighlighted={...}
    onSelect={(e) => {
        if (session.id === modalNewSessionId) clearNewSessionHighlight()
        handlePin(session.id, e)
    }}
    onContextMenu={(e) => handleContextMenu(session.id, e)}
    onDoubleClick={() => handlePin(session.id)}
    onFocusCapture={() => { ... }}
/>
```

- [ ] **Step 7: Replace old PinnedSessionContextMenu usage at end of Dashboard**

At lines ~1318-1335, replace:
```tsx
{pinnedAction && (
    <PinnedSessionContextMenu
        sessionTitle={getSessionTitle(sessions.find(s => s.id === pinnedAction.id) || { id: pinnedAction.id } as any)}
        x={pinnedAction.x}
        y={pinnedAction.y}
        onFocus={() => {
            const idx = pinnedIds.indexOf(pinnedAction.id)
            if (idx !== -1) setActivePinIndex(idx)
            setPinnedAction(null)
            setShowOverviewDrawer(false)
        }}
        onUnpin={() => {
            setPinnedIds(prev => prev.filter(id => id !== pinnedAction.id))
            setPinnedAction(null)
        }}
        onCancel={() => setPinnedAction(null)}
    />
)}
```

With:
```tsx
{pinnedAction && (() => {
    const ctxSession = sessions.find(s => s.id === pinnedAction.id)
    const ctxTitle = ctxSession ? getSessionTitle(ctxSession) : pinnedAction.id.slice(0, 8)
    const ctxIsPinned = pinnedIds.includes(pinnedAction.id)
    return (
        <SessionContextMenu
            sessionId={pinnedAction.id}
            sessionTitle={ctxTitle}
            x={pinnedAction.x}
            y={pinnedAction.y}
            isPinned={ctxIsPinned}
            onFocus={() => {
                const idx = pinnedIds.indexOf(pinnedAction.id)
                if (idx !== -1) setActivePinIndex(idx)
                setPinnedAction(null)
                setShowOverviewDrawer(false)
            }}
            onPin={() => {
                if (pinnedIds.length >= MAX_PINS) {
                    setPendingReplacePin(pinnedAction.id)
                } else {
                    setPinnedIds(prev => [...prev, pinnedAction.id])
                    setActivePinIndex(pinnedIds.length)
                }
                setPinnedAction(null)
            }}
            onUnpin={() => {
                setPinnedIds(prev => prev.filter(id => id !== pinnedAction.id))
                setPinnedAction(null)
            }}
            onArchive={() => {
                void handleArchiveSession(pinnedAction.id)
                // Also unpin if archived
                setPinnedIds(prev => prev.filter(id => id !== pinnedAction.id))
                setPinnedAction(null)
            }}
            onDelete={() => {
                void handleDeleteSession(pinnedAction.id)
                // Also unpin if deleted
                setPinnedIds(prev => prev.filter(id => id !== pinnedAction.id))
                setPinnedAction(null)
            }}
            onCancel={() => setPinnedAction(null)}
        />
    )
})()}
```

- [ ] **Step 8: Update the overview drawer list items to trigger context menu on right-click**

At lines ~978-994 (the `renderMiniSessionList` button), add `onContextMenu`:

Replace:
```tsx
<button
    key={s.id}
    type="button"
    className={`db__overview-item ${pinnedIds.includes(s.id) ? 'db__overview-item--pinned' : ''} ${isHighlighted ? 'ring-2 ring-[var(--app-button)]' : ''}`}
    onClick={(e) => { 
        if (isHighlighted) clearNewSessionHighlight()
        handlePin(s.id, e)
    }}
```

With:
```tsx
<button
    key={s.id}
    type="button"
    className={`db__overview-item ${pinnedIds.includes(s.id) ? 'db__overview-item--pinned' : ''} ${isHighlighted ? 'ring-2 ring-[var(--app-button)]' : ''}`}
    onClick={(e) => { 
        if (isHighlighted) clearNewSessionHighlight()
        handlePin(s.id, e)
    }}
    onContextMenu={(e) => {
        // Right-click on overview item shows context menu
        if (isHighlighted) clearNewSessionHighlight()
        handleContextMenu(s.id, e)
    }}
```

---

### Task 6: Remove `pins` from router search schema

**Files:**
- Modify: `web/src/router.tsx`
- Modify: `web/src/routes/dashboard/index.tsx`

- [ ] **Step 1: Remove pins from sessionsIndexRoute validateSearch**

In `web/src/router.tsx`, find `sessionsIndexRoute` (around line ~500). Replace:

```typescript
const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>): { pins?: string } => {
        if (typeof search.pins === 'string' && search.pins) {
            return { pins: search.pins }
        }
        return {}
    },
    component: SessionsIndexPage,
})
```

With:
```typescript
const sessionsIndexRoute = createRoute({
    getParentRoute: () => sessionsRoute,
    path: '/',
    validateSearch: (search: Record<string, unknown>) => {
        return {}
    },
    component: SessionsIndexPage,
})
```

- [ ] **Step 2: Simplify DashboardPage route component**

In `web/src/routes/dashboard/index.tsx`, replace the entire file:

```typescript
import { Dashboard } from '@/components/Dashboard'
import { useAppContext } from '@/lib/app-context'

export default function DashboardPage() {
    const { api } = useAppContext()
    return <Dashboard api={api} />
}
```

- [ ] **Step 3: Remove `initialPinnedIds` prop from Dashboard component interface and destructuring**

In `web/src/components/Dashboard/index.tsx`, at line ~718:

Replace:
```typescript
interface DashboardProps {
    api: ApiClient | null
    initialPinnedIds: string[]
}

export function Dashboard({ api, initialPinnedIds }: DashboardProps) {
```

With:
```typescript
interface DashboardProps {
    api: ApiClient | null
}

export function Dashboard({ api }: DashboardProps) {
```

- [ ] **Step 4: Remove `search` usage for pins in Dashboard**

At line ~724, `const search = useSearch(...)` — keep it (still used for `modalNewSessionId` and `modalPath`, etc.) — but verify no remaining `search.pins` references.

Run: `grep -n "\.pins\|pins:" web/src/components/Dashboard/index.tsx`

Expected: No results.

---

### Task 7: Update NewSessionModal pin handling to use sessionStorage

**Files:**
- Modify: `web/src/components/modals/NewSessionModal.tsx`

- [ ] **Step 1: Replace localStorage reads with sessionStorage reads**

At lines ~48-60, replace:
```typescript
// Always read pins from localStorage (source of truth when dashboard is not active)
let currentPins: string[] = []
try {
    const saved = localStorage.getItem('mc-pinned-ids')
    if (saved) currentPins = JSON.parse(saved)
} catch { /* ignore */ }
// Also check URL params as secondary fallback
if (currentPins.length === 0 && typeof (search as any).pins === 'string' && (search as any).pins) {
    currentPins = (search as any).pins.split(',')
}
```

With:
```typescript
// Read pins from sessionStorage (per-tab, sessionStorage is source of truth)
let currentPins: string[] = []
try {
    const saved = sessionStorage.getItem('mc-pinned-ids')
    if (saved) currentPins = JSON.parse(saved)
} catch { /* ignore */ }
```

- [ ] **Step 2: Update all navigate calls to remove `pins` from URL**

There are 3 navigate calls in the `handleSuccess` callback. In each one, replace the search spreading to write to sessionStorage instead of URL params:

**First navigate** (replaceSessionId path, around lines ~70-100):
Replace:
```typescript
void navigate({
    to: '/sessions',
    search: (prev: any) => {
        const newSearch = { ...prev }
        delete newSearch.modal
        delete newSearch.modalSessionId
        delete newSearch.modalPath
        delete newSearch.modalMachineId
        delete newSearch.modalReplaceSessionId
        delete newSearch.modalReturnTo
        return { ...newSearch, pins: newPins.join(','), modalNewSessionId: sessionId }
    },
    replace: true
})
```

With:
```typescript
sessionStorage.setItem('mc-pinned-ids', JSON.stringify(newPins))
void navigate({
    to: '/sessions',
    search: (prev: any) => {
        const newSearch = { ...prev }
        delete newSearch.modal
        delete newSearch.modalSessionId
        delete newSearch.modalPath
        delete newSearch.modalMachineId
        delete newSearch.modalReplaceSessionId
        delete newSearch.modalReturnTo
        return { ...newSearch, modalNewSessionId: sessionId }
    },
    replace: true
})
```

**Second navigate** (auto-append path, around lines ~105-125):
Replace:
```typescript
void navigate({
    to: '/sessions',
    search: (prev: any) => {
        const newSearch = { ...prev }
        delete newSearch.modal
        delete newSearch.modalSessionId
        delete newSearch.modalPath
        delete newSearch.modalMachineId
        delete newSearch.modalReplaceSessionId
        delete newSearch.modalReturnTo
        return { ...newSearch, pins: newPins.join(','), modalNewSessionId: sessionId }
    },
    replace: true
})
```

With:
```typescript
sessionStorage.setItem('mc-pinned-ids', JSON.stringify(newPins))
void navigate({
    to: '/sessions',
    search: (prev: any) => {
        const newSearch = { ...prev }
        delete newSearch.modal
        delete newSearch.modalSessionId
        delete newSearch.modalPath
        delete newSearch.modalMachineId
        delete newSearch.modalReplaceSessionId
        delete newSearch.modalReturnTo
        return { ...newSearch, modalNewSessionId: sessionId }
    },
    replace: true
})
```

**Third navigate** (replace-pin modal path, around lines ~135-145) — keep as-is (no `pins` in URL needed, just opens modal):
The replace-pin modal path doesn't set `pins` param, so it's fine. No change needed for that block.

- [ ] **Step 3: Verify no remaining `localStorage` or `pins` URL references**

Run: `grep -n "localStorage\|\?pins\|\.pins" web/src/components/modals/NewSessionModal.tsx`

Expected: No results (except possibly comments).

---

### Task 8: Update ReplacePinModal to use sessionStorage

**Files:**
- Modify: `web/src/components/modals/ReplacePinModal.tsx`

- [ ] **Step 1: Replace localStorage reads with sessionStorage reads**

At lines ~43-50, replace:
```typescript
// Read pins fresh — localStorage is source of truth
let currentPins: string[] = []
try {
    const saved = localStorage.getItem('mc-pinned-ids')
    if (saved) currentPins = JSON.parse(saved)
} catch { /* ignore */ }
// Fallback to URL
if (currentPins.length === 0 && typeof (search as any).pins === 'string' && (search as any).pins) {
    currentPins = (search as any).pins.split(',')
}
```

With:
```typescript
// Read pins from sessionStorage (per-tab)
let currentPins: string[] = []
try {
    const saved = sessionStorage.getItem('mc-pinned-ids')
    if (saved) currentPins = JSON.parse(saved)
} catch { /* ignore */ }
```

- [ ] **Step 2: Update `handleReplace` to write to sessionStorage instead of URL**

At lines ~54-70, replace:
```typescript
const handleReplace = useCallback((pinIdToReplace: string) => {
    if (!newSessionId) {
        props.onClose()
        return
    }
    const newPins = currentPins.map(id => id === pinIdToReplace ? newSessionId : id)
    void navigate({
        to: '/sessions',
        search: (prev: any) => {
            const newSearch = { ...prev }
            delete newSearch.modal
            delete newSearch.modalSessionId
            return { ...newSearch, pins: newPins.join(','), modalNewSessionId: newSessionId }
        },
        replace: true
    })
}, [currentPins, navigate, newSessionId, props])
```

With:
```typescript
const handleReplace = useCallback((pinIdToReplace: string) => {
    if (!newSessionId) {
        props.onClose()
        return
    }
    const newPins = currentPins.map(id => id === pinIdToReplace ? newSessionId : id)
    sessionStorage.setItem('mc-pinned-ids', JSON.stringify(newPins))
    void navigate({
        to: '/sessions',
        search: (prev: any) => {
            const newSearch = { ...prev }
            delete newSearch.modal
            delete newSearch.modalSessionId
            return { ...newSearch, modalNewSessionId: newSessionId }
        },
        replace: true
    })
}, [currentPins, navigate, newSessionId, props])
```

- [ ] **Step 3: Update `handleSkip` to remove pins param**

At lines ~72-83, replace:
```typescript
const handleSkip = useCallback(() => {
    void navigate({
        to: '/sessions',
        search: (prev: any) => {
            const newSearch = { ...prev }
            delete newSearch.modal
            delete newSearch.modalSessionId
            return { ...newSearch, modalNewSessionId: newSessionId }
        },
        replace: true
    })
}, [navigate, newSessionId])
```

The `handleSkip` doesn't set `pins` param, so it's already fine. No change needed.

- [ ] **Step 4: Verify no remaining localStorage or pins URL references**

Run: `grep -n "localStorage\|\.pins\|pins:" web/src/components/modals/ReplacePinModal.tsx`

Expected: No results.

---

### Task 9: Add CSS styles for context menu, bottom sheet, and double-click

**Files:**
- Modify: `web/src/components/Dashboard/dashboard.css`

- [ ] **Step 1: Add unified context menu styles**

Append to `web/src/components/Dashboard/dashboard.css`:

```css
/* ─── Session Context Menu ──────────────────────────────────────────────────── */

.db__context-menu {
    background: var(--app-bg);
    border: 1px solid var(--app-border);
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    min-width: 200px;
    max-width: 280px;
    padding: 4px 0;
    overflow: hidden;
}

.db__context-menu-header {
    padding: 10px 14px 8px;
    font-size: 12px;
    font-weight: 600;
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    border-bottom: 1px solid var(--app-border);
    margin-bottom: 4px;
}

.db__context-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    text-align: left;
    padding: 9px 14px;
    background: transparent;
    border: none;
    color: var(--app-fg);
    cursor: pointer;
    font-size: 13px;
    font-family: inherit;
    transition: background 0.1s;
}

.db__context-menu-item:hover {
    background: var(--app-hover);
}

.db__context-menu-item svg {
    flex-shrink: 0;
    opacity: 0.7;
}

.db__context-menu-item--danger {
    color: #ef4444;
}

.db__context-menu-item--danger:hover {
    background: rgba(239, 68, 68, 0.08);
}

.db__context-menu-item--danger svg {
    color: #ef4444;
}

.db__context-menu-item--cancel {
    justify-content: center;
    font-weight: 600;
    border-top: 1px solid var(--app-border);
    margin-top: 4px;
    padding-top: 12px;
    padding-bottom: 12px;
}

.db__context-menu-divider {
    height: 1px;
    background: var(--app-border);
    margin: 4px 0;
}

/* ─── Bottom Sheet (mobile) ────────────────────────────────────────────────── */

.db__bottom-sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 9998;
    display: flex;
    align-items: flex-end;
    animation: dbFadeIn 0.15s ease;
}

.db__bottom-sheet {
    width: 100%;
    max-height: 70vh;
    background: var(--app-bg);
    border-radius: 16px 16px 0 0;
    padding: 8px 0 calc(env(safe-area-inset-bottom) + 8px);
    display: flex;
    flex-direction: column;
    animation: dbSlideUp 0.2s ease;
    overflow-y: auto;
}

@keyframes dbFadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}

@keyframes dbSlideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
}

/* Double-click hint cursor for session cards */
.db-card {
    cursor: context-menu; /* right-click for menu */
}
```

- [ ] **Step 2: Update pin button styles to not interfere with context menu**

The existing `.db-card__pin-btn` styles should remain mostly unchanged. Add this to differentiate:

```css
/* Pin button now triggers context menu on click */
.db-card__pin-btn {
    cursor: pointer;
}

.db-card__pin-btn:hover:not(:disabled) {
    opacity: 1;
}
```

---

### Task 10: TypeScript typecheck and test

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript typecheck**

Run: `cd /home/huynq/notebooks/hapi && bun typecheck`

Expected: No new type errors. Fix any that appear.

- [ ] **Step 2: Verify the build works**

Run: `cd /home/huynq/notebooks/hapi/web && bun run build 2>&1 | tail -20`

Expected: Build succeeds with no errors.

---

### Task 11: Commit

- [ ] **Step 1: Commit all changes**

```bash
git add -A
git commit -m "feat: session context menu + per-tab pins (sessionStorage)

- Replace localStorage+URL pin sync with sessionStorage (per-tab isolation)
- Add unified SessionContextMenu with Pin/Unpin, Archive, Delete, Open in new tab, Copy ID
- Add right-click context menu on session cards (desktop floating menu, mobile bottom sheet)
- Add double-click to toggle pin on session cards
- Remove pins query param from router search schema
- Update NewSessionModal and ReplacePinModal to use sessionStorage
- Add i18n keys for new context menu actions"
```

## Self-Review Patch

### Gap found: sessionStorage sync from modal writes

When NewSessionModal or ReplacePinModal writes to `sessionStorage` then navigates to `/sessions`, the Dashboard component (already mounted) does not re-read sessionStorage since `useState` initializer only runs on mount.

**Fix:** Add a sync effect in Task 2 Step 4 that re-reads sessionStorage whenever `modalNewSessionId` changes (indicating a modal just completed its flow):

- [ ] **Step 4b: Add sessionStorage re-sync effect when modals complete**

After the existing sync effect (after Step 4 in Task 2), add:

```typescript
// Re-sync from sessionStorage when modals (NewSessionModal, ReplacePinModal) write pins then navigate back
// sessionStorage is the source of truth; modals write to it before navigating
useEffect(() => {
    if (!modalNewSessionId) return
    try {
        const saved = sessionStorage.getItem(PINS_KEY)
        if (saved) {
            const savedIds = (JSON.parse(saved) as string[]).slice(0, MAX_PINS)
            const current = pinnedIds.join(',')
            if (savedIds.join(',') !== current) {
                setPinnedIds(savedIds)
                // Auto-focus handled by the existing modalNewSessionId effect below
            }
        }
    } catch { /* ignore */ }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [modalNewSessionId])
```

This ensures that after any modal flow that writes sessionStorage and navigates with `modalNewSessionId`, the Dashboard picks up the fresh pins state.

