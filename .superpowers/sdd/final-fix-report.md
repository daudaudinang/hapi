# Final Review Fix Report

## Status

Implemented all findings from `final-fix-brief.md` with presentation-only web changes.

Implementation commit: `70841067dc450bc5e7e359981dee7052c104eb94` (`fix(web): harden activity duration grouping`)

## TDD evidence

### RED — translated computed accessibility contract

Command:

```bash
cd web && bun run test src/components/ToolCard/ToolRunGroup.test.tsx src/components/assistant-ui/reasoning.test.tsx -t "exposes the translated"
```

Output (exit 1):

```text
$ vitest run src/components/ToolCard/ToolRunGroup.test.tsx src/components/assistant-ui/reasoning.test.tsx -t "exposes the translated"

 RUN  v4.0.16 /home/huynq/notebooks/hapi/.worktrees/design-reasoning-tool-activity-group/web

 ❯ src/components/assistant-ui/reasoning.test.tsx (10 tests | 3 failed | 7 skipped) 109ms
     × exposes the translated per-activity duration in en 90ms
     × exposes the translated per-activity duration in vi-VN 10ms
     × exposes the translated per-activity duration in zh-CN 7ms
 ❯ src/components/ToolCard/ToolRunGroup.test.tsx (13 tests | 3 failed | 10 skipped) 144ms
     × exposes the translated group total as the English toggle description 96ms
     × exposes the translated group total as the Vietnamese toggle description 35ms
     × exposes the translated group total as the Chinese toggle description 12ms

Failed Tests 6

Expected element to have accessible description:
  Total duration: 4.0s
Received:

Expected element to have accessible description:
  Tổng thời gian: 4.0s
Received:

Expected element to have accessible description:
  总用时：4.0s
Received:

Expected element to have accessible description:
  Activity duration: 4.6s
Received:

Expected element to have accessible description:
  Thời gian hoạt động: 4.6s
Received:

Expected element to have accessible description:
  活动用时：4.6s
Received:

 Test Files  2 failed (2)
      Tests  6 failed | 17 skipped (23)
error: script "test" exited with code 1
```

### RED — contradictory last boundary

Command:

```bash
cd web && bun run test src/components/ToolCard/toolRunModel.test.ts -t "rejects a last boundary"
```

Output (exit 1):

```text
$ vitest run src/components/ToolCard/toolRunModel.test.ts -t "rejects a last boundary"

 RUN  v4.0.16 /home/huynq/notebooks/hapi/.worktrees/design-reasoning-tool-activity-group/web

 ❯ src/components/ToolCard/toolRunModel.test.ts (60 tests | 1 failed | 59 skipped) 9ms
     × rejects a last boundary whose completion predates its own start 7ms

 FAIL  src/components/ToolCard/toolRunModel.test.ts > activity timing > rejects a last boundary whose completion predates its own start
AssertionError: expected 3000 to be null

- Expected:
null

+ Received:
3000

 Test Files  1 failed (1)
      Tests  1 failed | 59 skipped (60)
error: script "test" exited with code 1
```

### RED — immediate clock refresh on reactivation

The first run exposed a test selector problem (the child was correctly hidden inside the closed group), so the test was corrected to open the existing group. The valid RED run then failed on the intended missing elapsed-duration behavior.

Command:

```bash
cd web && bun run test src/components/ToolCard/ToolRunGroup.test.tsx -t "refreshes the shared clock"
```

Output (exit 1):

```text
$ vitest run src/components/ToolCard/ToolRunGroup.test.tsx -t "refreshes the shared clock"

 RUN  v4.0.16 /home/huynq/notebooks/hapi/.worktrees/design-reasoning-tool-activity-group/web

 ❯ src/components/ToolCard/ToolRunGroup.test.tsx (13 tests | 1 failed | 12 skipped) 128ms
     × refreshes the shared clock immediately when a completed group becomes active 126ms

 FAIL  src/components/ToolCard/ToolRunGroup.test.tsx > ToolRunGroup > refreshes the shared clock immediately when a completed group becomes active
Error: expect(element).toHaveAccessibleDescription()

Expected element to have accessible description:
  tool.group.activityDuration:{"duration":"4.0s"}
Received:

 Test Files  1 failed (1)
      Tests  1 failed | 12 skipped (13)
error: script "test" exited with code 1
```

### GREEN — focused behaviors

Accessibility command:

```bash
cd web && bun run test src/components/ToolCard/ToolRunGroup.test.tsx src/components/assistant-ui/reasoning.test.tsx -t "exposes the translated"
```

Output (exit 0):

```text
$ vitest run src/components/ToolCard/ToolRunGroup.test.tsx src/components/assistant-ui/reasoning.test.tsx -t "exposes the translated"

 RUN  v4.0.16 /home/huynq/notebooks/hapi/.worktrees/design-reasoning-tool-activity-group/web

 ✓ src/components/assistant-ui/reasoning.test.tsx (10 tests | 7 skipped) 121ms
 ✓ src/components/ToolCard/ToolRunGroup.test.tsx (13 tests | 10 skipped) 161ms

 Test Files  2 passed (2)
      Tests  6 passed | 17 skipped (23)
```

Boundary command:

```bash
cd web && bun run test src/components/ToolCard/toolRunModel.test.ts -t "rejects a last boundary"
```

Output (exit 0):

```text
$ vitest run src/components/ToolCard/toolRunModel.test.ts -t "rejects a last boundary"

 RUN  v4.0.16 /home/huynq/notebooks/hapi/.worktrees/design-reasoning-tool-activity-group/web

 ✓ src/components/ToolCard/toolRunModel.test.ts (60 tests | 59 skipped) 3ms

 Test Files  1 passed (1)
      Tests  1 passed | 59 skipped (60)
```

Clock command:

```bash
cd web && bun run test src/components/ToolCard/ToolRunGroup.test.tsx -t "refreshes the shared clock"
```

Output (exit 0):

```text
$ vitest run src/components/ToolCard/ToolRunGroup.test.tsx -t "refreshes the shared clock"

 RUN  v4.0.16 /home/huynq/notebooks/hapi/.worktrees/design-reasoning-tool-activity-group/web

 ✓ src/components/ToolCard/ToolRunGroup.test.tsx (13 tests | 12 skipped) 108ms

 Test Files  1 passed (1)
      Tests  1 passed | 12 skipped (13)
```

## Required final verification

Required four-file test command:

```bash
cd web && bun run test src/components/ToolCard/toolRunModel.test.ts src/components/ToolCard/ToolRunGroup.test.tsx src/components/assistant-ui/reasoning.test.tsx src/components/AssistantChat/messages/ReasoningMessagePart.test.tsx
```

Output (exit 0):

```text
$ vitest run src/components/ToolCard/toolRunModel.test.ts src/components/ToolCard/ToolRunGroup.test.tsx src/components/assistant-ui/reasoning.test.tsx src/components/AssistantChat/messages/ReasoningMessagePart.test.tsx

 RUN  v4.0.16 /home/huynq/notebooks/hapi/.worktrees/design-reasoning-tool-activity-group/web

 ✓ src/components/ToolCard/toolRunModel.test.ts (60 tests) 18ms
 ✓ src/components/assistant-ui/reasoning.test.tsx (10 tests) 208ms
 ✓ src/components/ToolCard/ToolRunGroup.test.tsx (13 tests) 224ms
 ✓ src/components/AssistantChat/messages/ReasoningMessagePart.test.tsx (4 tests) 179ms

 Test Files  4 passed (4)
      Tests  87 passed (87)
```

Typecheck command:

```bash
bun run typecheck:web
```

Output (exit 0):

```text
$ cd web && bun run typecheck
$ tsc --noEmit
```

Diff check command:

```bash
git diff --check
```

Output: none; exit 0.

## Files and behavior

| File | Change |
|---|---|
| `web/src/components/ToolCard/ToolRunGroup.tsx` | Stable `useId` duration description, visible duration hidden from duplicate naming, immediate `Date.now()` refresh on activation. |
| `web/src/components/ToolCard/ToolRunGroup.test.tsx` | Computed name/description assertions in en/vi/zh; false→true fake-clock regression. |
| `web/src/components/ToolCard/toolRunModel.ts` | Reject last completion earlier than last activity start before first/last total calculation. |
| `web/src/components/ToolCard/toolRunModel.test.ts` | Contradictory last-boundary regression. |
| `web/src/components/assistant-ui/reasoning.tsx` | Stable per-activity duration description on grouped disclosure; no nested interactive element. |
| `web/src/components/assistant-ui/reasoning.test.tsx` | Role/name/description assertions for translated duration in en/vi/zh. |

## Self-review / concerns

- Visible compact duration text and existing disclosure layout remain unchanged.
- Group total remains first-start/last-completion only; no middle min/max scan added.
- Running groups still share the existing single `ToolRunLayoutProvider` clock.
- No backend, dependency, schema, API, or locale-string changes.
- No known functional concerns. Verification is the exact required focused suite plus web typecheck and diff check; the full repository test suite was not requested or run.
