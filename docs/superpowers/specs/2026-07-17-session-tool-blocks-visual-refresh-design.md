# Session Tool Blocks Visual Refresh Design

**Date:** 2026-07-17  
**Status:** Approved from the interactive Agent Mode prototype (version 4)  
**Risk level:** Medium — presentation-only change over a shared renderer used by every agent provider

## 1. Goal

Refresh the special blocks inside a session conversation so routine activity stays quiet while reasoning, permissions, plans, and diffs are easy to scan and reopen. Match the approved Agent Mode prototype in both light and dark themes without changing application behavior.

## 2. Chosen approach

Keep the existing message normalization, tool registry, permission mutations, dialog behavior, and nested task flow. Add a thin presentation layer inside the existing session-message components:

- generic tools use a compact neutral surface;
- reasoning uses a compact bordered disclosure;
- pending permissions use an amber attention surface with a neutral-blue primary approval action;
- planning tools use a violet artifact surface with progress summary;
- diff/edit tools use a green artifact surface with change summary;
- the existing detail dialog remains the full-content destination.

This is preferred over:

1. **A new parallel renderer:** closer isolation, but duplicates tool routing and risks behavior drift.
2. **A whole-session redesign:** visually broad, but violates the approved constraint to change only related components.

## 3. Scope

### In scope

- `web/src/components/assistant-ui/reasoning.tsx`
- `web/src/components/ToolCard/ToolCard.tsx`
- `web/src/components/ToolCard/knownTools.tsx`
- `web/src/components/ToolCard/PermissionFooter.tsx`
- planning checklist/view files under `web/src/components/ToolCard/`
- Codex diff compact/full views under `web/src/components/ToolCard/views/`
- narrowly-scoped theme tokens in `web/src/index.css`
- focused component and pure presentation tests

### Out of scope

- session list, dashboard pins, header, composer, context panel, and routing;
- message schemas, normalization, storage, SSE, API, RPC, and permission contracts;
- approval/deny semantics, available permission options, haptics, loading guards, and error handling;
- Mermaid parsing, rendering, pan/zoom/fullscreen, and markdown behavior;
- generic `Card`, `Button`, or `Dialog` primitives used outside tool messages;
- backend, CLI, hub, shared types, and database code.

## 4. Component behavior

### Reasoning

- Preserve collapsed-by-default and auto-open-while-streaming behavior.
- Replace the bare text toggle with the prototype's compact bordered surface.
- Preserve markdown rendering, reduced-motion behavior, keyboard activation, and current streaming indicator.

### Routine tool activity

- Keep one `ToolCard` per existing tool block; do not regroup or reorder timeline data.
- Render neutral tools with lower visual weight than review artifacts.
- Preserve title, subtitle, state, elapsed time, dialog trigger, child-task summary, and trace access.

### Permission attention state

- Pending permission overrides the tool's normal visual tone.
- Use amber border/background/icon treatment to signal attention, not success.
- The immediate approve action uses a dedicated blue background and explicit white foreground in both themes.
- Deny remains a neutral outlined action with destructive text treatment; additional session/edit approval options remain present.
- On narrow screens, actions wrap/stack without horizontal overflow and keep at least 36px control height.

### Plan artifact

- `update_plan`, `TodoWrite`, `ExitPlanMode`, and `exit_plan_mode` use the planning tone.
- Inline `update_plan` shows completed/total count, percentage, progress bar, and a short step preview.
- Dialog view shows the complete checklist.
- Existing parsing and status normalization remain unchanged.

### Diff artifact

- `CodexDiff`, `CodexPatch`, `Edit`, `MultiEdit`, `Write`, and `NotebookEdit` use the diff tone.
- Inline `CodexDiff` shows additions, removals, and a bounded file summary rather than a large code body.
- Dialog view retains the full existing diff rendering.
- Empty or malformed diff input falls back safely to the existing generic display path.

## 5. Data flow

```text
Existing normalized ToolCallBlock
→ existing getToolPresentation registry
→ new visual tone/detail metadata
→ ToolCard shell chooses neutral / plan / diff / permission appearance
→ existing view registry renders compact or dialog content
→ existing PermissionFooter invokes the same API callbacks
```

No data is added to or removed from messages, tool calls, permissions, or API requests.

## 6. Theme and accessibility rules

- Use existing `--app-*` tokens for surfaces, foregrounds, hints, and borders.
- Add only permission-primary tokens that need stable contrast independent of Telegram theme inheritance.
- Explicit approval foreground must meet WCAG AA contrast (at least 4.5:1) against its background in light and dark themes.
- Preserve visible focus rings, semantic buttons, dialog semantics, `aria-busy`, disabled states, and keyboard operation.
- Do not encode state by color alone: retain icons, labels, counts, and status text.

## 7. Verification

Automated checks:

- visual-tone mapping for neutral, planning, diff, and permission states;
- ToolCard shell rendering and dialog trigger preservation;
- permission action visibility, loading/disabled states, and unchanged API payloads;
- explicit primary-action theme tokens and contrast;
- plan progress math and inline/full checklist behavior;
- unified-diff summary for one file, multiple files, empty input, and header lines;
- reasoning collapse, streaming auto-open, and keyboard-accessible toggle;
- web typecheck and production build.

Manual browser checks:

- light/dark themes;
- desktop and narrow mobile widths;
- generic tool, reasoning, permission, plan, diff, nested Task, error, and running states;
- long paths, long subtitles, large diffs, and extra permission options.

## 8. Main risks and controls

1. **Shared ToolCard blast radius:** every provider uses it. Control with tone defaults, focused fixtures across Claude/Codex-style tools, and no registry contract removal.
2. **Permission regression:** visually changing a security-sensitive control can hide or miswire choices. Control with callback/payload tests and unchanged mutation functions.
3. **Diff performance/accuracy:** large or multi-file diffs can be expensive or miscount headers. Control with a single memoized linear scan and bounded inline rows.
4. **Theme contrast:** Telegram/browser theme inheritance can produce unreadable text. Control with explicit foreground tokens and contrast tests.

## 9. Rollback

The change is frontend-only and data-neutral. Reverting the focused visual commits restores the current renderer; no migration, cache invalidation, or data repair is required.
