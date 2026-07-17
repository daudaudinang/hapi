# Task 3 Report — Activity-group UI

## Status

- Implementation: complete.
- Commit: `feat(web): render approved activity groups` (SHA reported in handoff).

## Files

- Activity wrapper/context: `ToolRunGroup.tsx`, `toolRunContext.tsx`.
- Tool/reasoning rows: `ToolCard.tsx`, `ToolMessage.tsx`, `ReasoningMessagePart.tsx`, `assistant-ui/reasoning.tsx`.
- Tests: `ToolRunGroup.test.tsx`, `ToolCard.test.tsx`, `ReasoningMessagePart.test.tsx`, `assistant-ui/reasoning.test.tsx`.
- Dictionaries: `en.ts`, `vi-VN.ts`, `zh-CN.ts`.
- Scoped cleanup: removed now-unused tool-only transitional exports from `toolRunModel.ts`.

## TDD evidence

### RED

1. Group wrapper/header/boundary: `ToolRunGroup.test.tsx` — 3 expected failures. Missing reasoning membership, activity labels and final-running generic reasoning behavior.
2. Row/reasoning/i18n: focused three-file run — 6 expected failures. Missing exact row duration, grouped reasoning layout/status and new dictionary keys.
3. CodexReasoning caller duration: `ToolRunGroup.test.tsx` — 1 expected failure. Missing shared-clock duration at the real `HappyToolMessage` caller.

### GREEN

- Required focused UI run: 4 files, **65/65 tests passed**.
- Root typecheck: shared + cli + web + hub passed; final web typecheck also passed.
- Production build: `bun run build:web` passed.
- `git diff --check`: passed.
- Full web suite: **770/772 passed**. Two stale Task 4 integration expectations remain; see concerns.

## Visual/spec mapping

| Approved requirement | Implementation/evidence |
|---|---|
| One mixed reasoning/tool group, original order, no duplicate child | `partitionActivityParts`; non-zero range/boundary and five-child order tests |
| Header: count/status left, exact total right only | Activity dictionary keys + `formatActivityDuration`; tests reject title summary, badge, dot and timestamp |
| 100% width, max 600px; completed closed; running open; no auto-close | Wrapper classes and mount/transition tests |
| Row order: title/subtitle → duration → status → output | Shared `now` context; DOM-order and exact completed/running duration tests |
| Terminal/Diff output max 300px, full width; no-output rows compact; patch summary retained | Existing focused output/patch tests retained and passing |
| Grouped reasoning full-width, borderless; generic has no duration; Codex exact duration | `ReasoningDisclosure` group-row mode and caller tests |
| Keyboard/accessibility; no nested buttons | Native buttons, `aria-expanded`, `aria-controls`, focus-visible ring, translated duration/status labels, nested-button assertions |
| Three-locale activity wording | New five semantic keys in EN/VI/ZH; dictionary coverage test |

## Concerns

- Did not edit `AssistantMessage.integration.test.tsx` per Task 3 brief. Its two old expectations assert no reasoning/tool group and old “tool/actions” wording; both intentionally conflict with the approved Task 3 behavior and belong to Task 4 migration.
- Production build still prints existing Browserslist/KaTeX/chunk-size warnings; build exits successfully.
