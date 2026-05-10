# Session Context Menu & Per-Tab Pins

**Date:** 2026-05-07
**Status:** Approved
**Scope:** Web frontend (Dashboard + related components)

---

## Motivation

Two UX gaps in current session management:
1. **No per-session archive/delete**: Users can only archive/delete at project-group level, not individual sessions
2. **Pins cross-tab via localStorage**: Opening multiple browser tabs shares pin state, limiting multi-context workflows

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Pin storage | `localStorage` → `sessionStorage` | Per-tab isolation, persists on refresh, auto-clears on tab close |
| URL `?pins=` param | Remove entirely | No longer needed since pins are tab-local; avoid cross-tab leaks |
| Click behavior | Pin/Unpin → Context Menu | Discoverable, consistent across all session lists |
| Desktop shortcut | Double-click → Pin/Unpin | Power-user shortcut, separate from context menu |
| Context menu content | Pin/Unpin, Archive, Delete, Open in new tab, Copy session ID | Full set of session actions |
| Mobile menu style | Bottom sheet | Native-feel, easy touch targets, avoids viewport overflow |
| Archive confirm | Yes (confirm dialog) | Explicit user intent |
| Delete confirm | Yes (confirm dialog) | Destructive action must be confirmed |
| Active session Archive/Delete | Allowed | Backend handles stopping session before archival/deletion |
| Toast "focus session" | CustomEvent `hapi:focus-session` (existing) | Keep existing mechanism, only update handler |

---

## Architecture

### Storage migration

```
Before: localStorage 'mc-pinned-ids'  ←→  URL ?pins=  ←→  pinnedIds state
After:  sessionStorage 'mc-pinned-ids'  →  pinnedIds state (no URL sync)
```

- On mount: read `sessionStorage.getItem('mc-pinned-ids')` as initial state
- On change: `sessionStorage.setItem(...)` only
- No URL navigation for pin changes
- Remove `?pins=` from router search schema and all navigation calls

### Context Menu: Unified component

Replace `PinnedSessionContextMenu` (pinned-only, 2 actions) with a unified `SessionContextMenu` used everywhere:

```
SessionContextMenu
├── Header: session title (truncated)
├── Pin / Unpin (toggle)
├── Archive (+ confirm)
├── Delete (+ confirm)
├── Open in new tab
├── Copy session ID
└── (Cancel area on mobile bottom sheet)
```

**Rendering decisions:**
- Desktop: `onContextMenu` → floating div at `{clientX, clientY}` with viewport boundary adjustment
- Mobile: `onClick` → bottom sheet overlay
- Detect platform: `matchMedia('(pointer: coarse)')` or `matchMedia('(max-width: 768px)')`

### Double-click handler

- Added to `SessionCard` and drawer items: `onDoubleClick` → `handlePin(sessionId)`
- Does not interfere with context menu (separate event)
- Same behavior as old click-to-pin, now behind double-click

---

## Files to Modify

| File | Changes |
|------|---------|
| `web/src/components/Dashboard/index.tsx` | Core: sessionStorage, context menu, double-click, remove URL sync, remove old PinnedSessionContextMenu |
| `web/src/router.tsx` | Remove `pins` from search schema, remove navigate calls with `pins` |
| `web/src/components/ToastContainer.tsx` | Update `hapi:focus-session` handler (sessionStorage write instead of URL navigate) |
| `web/src/components/Dashboard/dashboard.css` | Add styles for: `.db__context-menu` (unified), `.db__bottom-sheet`, `.db__bottom-sheet-overlay` |
| `web/src/components/modals/NewSessionModal.tsx` | Remove localStorage read of `mc-pinned-ids` (no longer needed for replace-pin logic; or keep as read-only for max pin detection) |
| `web/src/components/modals/ReplacePinModal.tsx` | Check if still needed — may simplify since pin limit is now per-tab |

---

## Implementation Notes

### Context menu positioning (desktop)

```ts
// After menu render, adjust if overflows viewport
const rect = menuRef.current.getBoundingClientRect()
let left = clientX
let top = clientY
if (left + rect.width > window.innerWidth) left = window.innerWidth - rect.width - 8
if (top + rect.height > window.innerHeight) top = window.innerHeight - rect.height - 8
```

### Bottom sheet (mobile)

```html
<div class="db__bottom-sheet-overlay" onClick={onClose}>
  <div class="db__bottom-sheet" onClick={e => e.stopPropagation()}>
    <!-- menu items -->
  </div>
</div>
```

Animation: slide up from bottom via CSS transition (`transform: translateY(100%)` → `translateY(0)`).

### Confirm dialogs

Use `window.confirm()` for simplicity:
```ts
if (!window.confirm(t('dashboard.confirmArchive'))) return
await api.archiveSession(sessionId)
```

### Event cleanup

Context menu closes on:
- Click outside (mousedown listener)
- Scroll (scroll listener on parent container)
- Escape key
- Action selected

---

## Out of Scope

- Backend changes (existing archive/delete endpoints sufficient)
- Toast "undo" pattern
- New test files (no test requirement per project convention)
- i18n translations for new strings (added inline, can be done in follow-up)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| URL `?pins=` cross-tab leak | Removed entirely |
| Mobile viewport overflow | Bottom sheet instead of floating menu |
| User confusion from behavior change | Double-click retained as shortcut; internal tool, small user base |
| Context menu position drift on scroll | Close menu on scroll event |
| Archive/Delete race condition | Low risk; sequential API calls, TanStack Query invalidate handles consistency |
