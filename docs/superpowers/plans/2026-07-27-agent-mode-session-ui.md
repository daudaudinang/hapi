# Agent Mode Session UI — Implementation Plan

**Goal:** Apply the approved compact session header and composer design to Agent Mode while preserving existing session behavior and provider-specific controls.

**Scope:** Web only. No API, persistence, protocol, or session-state changes.

## Task 1: Lock compact header behavior with tests

- [x] Update `web/src/components/SessionHeader.test.tsx`
  - Path opens the current session's Files modal.
  - Provider and task badges remain outside action controls.
  - Normal compact panels expose Unpin inside More and no standalone X.
  - Focused panels retain an X whose only action is closing focus.
  - Mobile-specific actions are marked for responsive hiding.
- [x] Update `web/src/components/SessionActionMenu.test.tsx`
  - Optional Files and Unpin actions close the menu and invoke their callbacks.
- [x] Run targeted tests and confirm they fail for the intended missing behavior.

## Task 2: Implement compact header and responsive actions

- [x] Update `web/src/components/SessionActionMenu.tsx`
  - Add optional Files and Unpin actions.
  - Keep Rename/Archive/Delete behavior unchanged.
- [x] Update `web/src/components/SessionHeader.tsx`
  - Replace the two-row compact header with a single-row layout.
  - Make the path a Files trigger.
  - Keep provider, task badge, Editor, Terminal, goal, and More.
  - Hide Focus and Team Chat on mobile through dedicated classes.
  - Move mobile Files and normal-panel Unpin into More.
  - Render standalone X only for focused-panel close semantics.
- [x] Update `web/src/components/Dashboard/dashboard.css`
  - Add compact header tokens, responsive action visibility, overflow protection, and light/dark-safe styling.
- [x] Run targeted header/menu tests.

## Task 3: Lock compact composer behavior with tests

- [x] Add `web/src/components/AssistantChat/CompactComposerControls.test.tsx`
  - Empty composer: disabled neutral send button.
  - Ready composer: purple send button and send callback.
  - Running thread: red stop button and abort callback.
  - Runtime selectors preserve nullable values and dispatch provider callbacks.
- [x] Extend `web/src/components/Dashboard/dashboard-mobile-css.test.ts`
  - Composer uses 520px two-row runtime breakpoint.
  - Focus/Team Chat/path are hidden on mobile.
  - Mobile runtime selectors form equal-width columns.
- [x] Run targeted tests and confirm they fail for the intended missing components/styles.

## Task 4: Implement compact composer and runtime controls

- [x] Add `web/src/components/AssistantChat/CompactComposerControls.tsx`
  - Attachment-only leading control.
  - Unified send/stop button with idle, ready, running states.
  - Generic Model, Reasoning/Effort, and Permission selectors from supplied options.
- [x] Update `web/src/components/AssistantChat/StatusBar.tsx`
  - Preserve existing status bar.
  - Add compact layout slot for interactive runtime controls.
- [x] Update `web/src/components/AssistantChat/HappyComposer.tsx`
  - Add `compactMode`.
  - Render approved pill composer only in compact mode.
  - Keep existing composer untouched outside compact mode.
  - Move compact runtime status below the input.
  - Preserve max five rows, attachments, autocomplete, IME, send, and abort behavior.
- [x] Update `web/src/components/SessionChat.tsx`
  - Pass compact mode into the composer.
- [x] Add shared compact composer CSS in `web/src/index.css`
  - Adaptive radius, theme tokens, thin scrollbar, responsive runtime rows, safe-area spacing.
- [x] Run targeted component/CSS tests.

## Task 5: Verify and review

- [x] Run web targeted tests.
- [x] Run `bun run --cwd web typecheck`.
- [x] Run `bun run --cwd web build`.
- [x] Run full web test suite.
- [x] Inspect desktop/mobile and light/dark with browser automation when runtime fixtures permit.
- [x] Review `git diff --check` and scoped diff; confirm no API/backend changes.
- [x] Commit only the implementation files and this plan.
