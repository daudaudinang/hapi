# Mobile Editor Responsive Design

Date: 2026-05-02
Status: Approved design direction; pending implementation plan
Variant: A — HAPI native toolbar

## Goal

Make Editor Mode usable on mobile without shrinking the desktop three-pane IDE into a narrow viewport.

Mobile uses a focus-mode layout. One workspace surface is visible at a time:

- Files
- Editor
- Chat
- Terminal

Desktop/tablet-wide layout keeps the current resizable panes.

## Visual direction

Use Variant A from the reviewed wireframes.

The mobile UI must match the existing Agent Mode visual language:

- Use existing theme variables: `--app-bg`, `--app-fg`, `--app-hint`, `--app-border`, `--app-subtle-bg`, `--app-secondary-bg`.
- Prefer current Tailwind scale used across Agent Mode and Editor Mode:
  - text: mostly `text-xs` for controls, `text-sm` for primary labels where Agent Mode does so.
  - padding: `px-2`, `px-3`, `py-1`, `py-1.5`, `py-2` patterns.
  - radius: `rounded-md` for buttons/controls, `rounded-lg` for sheets/modals.
- Avoid custom flashy mobile styling. No floating glass panels, oversized shadows, or unrelated accent colors.
- Keep tap targets usable, but visually compact and consistent with the current app.

## Responsive rule

Use mobile focus layout under the chosen mobile breakpoint, recommended `< 768px`.

At and above the breakpoint:

- keep current `EditorLayout` desktop structure.
- keep file tree pane, editor pane, terminal pane, sessions/chat pane.
- keep resize handles and persisted pane sizes.

Under the breakpoint:

- hide desktop sidebars and resize handles.
- disable terminal collapse bar.
- show mobile header + bottom workspace navigation.
- show exactly one active view.

## Shared state

Reuse existing editor state and handlers as much as possible:

- `useEditorState`
- active file tabs
- active terminal tabs
- active session
- project/machine selection
- pending chat draft
- selection-to-chat expansion
- terminal output-to-chat flow

Add mobile-only state:

```ts
type MobileEditorView = 'files' | 'editor' | 'chat' | 'terminal'
```

View transition rules:

- Opening a file switches to `editor`.
- Creating/opening a terminal switches to `terminal`.
- Creating/selecting a session may switch to `chat` when invoked from Chat; otherwise preserve current view unless the action requires chat.
- Adding file/selection/output to chat shows a compact confirmation with an `Open chat` action; do not force-switch by default.

## Global mobile header

Every mobile screen has the same global header pattern:

- left: `← Agents`
- center: current context title and short subtitle
- right: primary contextual action, then overflow when needed

`← Agents` routes back to Agent Mode (`/sessions`). It is not a local back button.

Examples:

- Files: title `HAPI Editor`, subtitle machine + project path, right actions `+` and overflow.
- Editor: title active file name, subtitle relative folder + dirty state/file type, right action `Save` when dirty, overflow.
- Chat: title `Chat`, subtitle model/mode or active session status, right action new session, overflow.
- Terminal: title `Terminal`, subtitle active terminal/cwd/status, right action new terminal, overflow.

Overflow may duplicate `Back to Agent Mode` for discoverability, but `← Agents` remains the primary escape.

## Bottom workspace navigation

Mobile bottom nav has four items:

- Files
- Editor
- Chat
- Term

Rules:

- It navigates inside Editor Mode only.
- It remains visible on all four main screens.
- It uses compact Agent Mode-like styling: subtle border top, small labels, current item emphasized without heavy custom styling.
- Future badges may show dirty files, pending approvals, or running terminal state, but this is not required for the first implementation.

## Files screen

Purpose: browse project files and invoke file actions.

Content:

- compact search input.
- optional segmented filter: Files / Changed / Sessions. If too much for first pass, keep Files only and defer filters.
- file tree using existing `EditorFileTree` behavior where possible.

Actions:

- tap file: open file and switch to Editor.
- long press or row overflow: open bottom sheet with:
  - Open file
  - Add file to chat
  - Copy path
  - Copy relative path
  - New file when applicable
  - Delete from disk

Deletion requires confirmation. Use existing delete confirmation semantics.

Terminology:

- “Close tab” means remove from open editor tabs.
- “Delete file” means delete from disk.
- Do not call delete/close both “close file”.

## Editor screen

Purpose: read/edit one active file with open file tabs.

Content:

- horizontal file tab strip.
- active file content using CodeMirror.
- empty state when no file is open.

Controls:

- active tab has a close control.
- inactive tabs may omit close buttons on narrow screens to avoid cramped touch targets.
- tab long press or overflow opens tab actions.
- dirty active file shows `Save` in header.
- keyboard save shortcut remains supported.

Close dirty tab behavior:

- show bottom sheet or modal with:
  - Save then close
  - Discard changes
  - Cancel

Selection behavior:

- selecting code shows `Add to chat` action.
- after adding selection, show compact confirmation with `Open chat` action.
- preserve selection expansion behavior already present in Editor Mode.

## Chat screen

Purpose: keep the existing Agent Mode chat experience inside mobile Editor Mode.

Content:

- reuse `SessionChat` compact mode.
- hide the normal SessionChat header because mobile Editor header owns top-level context.
- show active context chips when files/selections were added.
- provide session switcher as a compact strip or bottom sheet, not a persistent sidebar.

Actions:

- new session from header action.
- select session via strip/sheet.
- send message with existing composer behavior.
- draft text appended from file/selection/terminal actions.

## Terminal screen

Purpose: full-screen terminal access on mobile.

Content:

- horizontal terminal tab strip.
- active xterm view full height.
- empty state if no terminal is open.

Controls:

- header `+` opens a new terminal.
- active terminal tab has a close control.
- idle terminal may close directly.
- running terminal close shows confirmation:
  - Stop process and close
  - Add output to chat first
  - Cancel
- `Add output` action remains available for terminal-to-chat flow.

No collapsed terminal bar on mobile.

## Component structure

Recommended structure:

```txt
EditorLayout
├─ DesktopEditorLayout    // current three-pane layout extracted or kept as desktop branch
└─ MobileEditorLayout     // mobile focus-mode layout
```

Alternative acceptable structure: keep one `EditorLayout` but split internal render blocks into desktop/mobile components. Avoid duplicating business logic.

Preferred boundaries:

- shared orchestration stays in `EditorLayout` or a small shared controller hook.
- desktop/mobile components receive state and handlers as props.
- mobile-specific view state stays near `MobileEditorLayout`.

## Error and edge states

Cover these states on mobile:

- API unavailable.
- no machine selected.
- no project selected.
- no file open.
- file load error.
- save error.
- no active session.
- no terminal open.
- terminal connection error if existing terminal component exposes it.

Use existing app tone: small text, subtle panels, red text/border for errors.

## Testing

Add necessary tests only.

Recommended tests:

- mobile branch renders under mocked narrow viewport.
- desktop branch still renders current panes above breakpoint.
- opening a file on mobile switches to Editor view.
- bottom nav switches between Files / Editor / Chat / Terminal.
- `← Agents` navigates to `/sessions`.
- dirty close flow offers save/discard/cancel.
- closing running terminal uses confirmation path if detectable.

Do not add broad visual snapshot tests unless already established.

## Non-goals

- No full mobile IDE parity beyond existing Editor Mode capabilities.
- No new backend APIs for first pass.
- No custom design system rewrite.
- No desktop layout redesign.
- No advanced mobile gestures required for first pass beyond optional long press/context menu.

## Open implementation decisions

These should be resolved during implementation planning:

1. Exact breakpoint utility/hook: CSS media query vs `useMediaQuery` style hook.
2. Whether `EditorFileTree` needs mobile props or a small mobile wrapper.
3. Whether terminal running/idle state can be detected reliably before close confirmation.
4. Whether Files filter tabs ship in first pass or defer.
