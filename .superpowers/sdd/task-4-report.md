# Task 4 Report — Actual-runtime fidelity and release gates

## Status

- Acceptance migration: complete.
- Production changes in Task 4: none; integration evidence only.
- Commit: `test(web): verify activity grouping stream fidelity` (SHA reported in handoff).

## Actual-runtime acceptance coverage

1. Generic reasoning → `CodexReasoning` → `CodexBash` → `CodexDiff` → `CodexPatch` forms one five-activity group; completed group opened before nested reasoning disclosures are clicked.
2. Original tool block IDs, mixed-stream markers and DOM nodes remain single and ordered; text stays outside activity groups.
3. Boundary matrix: text, assistant CLI output, system event, team mention, plan, permission, error, children, question, Task, Agent, Skill, MCP, unknown, `HapiCliOutput` collision and provider `HapiReasoning` collision.
4. Streaming/lifecycle: singleton append, running → completed without auto-close, late error/permission/children split, pagination prepend and completed remount preserve IDs/content/order.
5. Older generic reasoning is completed when a newer tool owns the final running position.
6. Provider `HapiReasoning` and malformed pseudo reasoning each use the fallback path exactly once.
7. Clipboard contains assistant text only; reasoning excluded; no empty assistant message root is emitted.

## TDD / migration evidence

### RED

- Baseline focused run: **5/7 passed, 2 expected stale failures**.
  - Old test expected no group for approved reasoning/tool sequence.
  - Old test expected `Toggle tool group: 2 actions completed` instead of the approved activity wording.
- First expanded acceptance run: **23/26 passed**. Three assertion-design failures exposed renderer details (development raw JSON duplicates and standalone error output not mounted inline), not production gaps. Assertions were narrowed to stable original block IDs, exact fallback nodes and DOM order. No production file changed.

### GREEN

- Focused actual-runtime suite: **26/26 passed**, 1 file, exit 0.
- Full web suite: **791/791 passed**, 113 files, exit 0.
- Web typecheck: `tsc --noEmit`, exit 0.
- Web production build: Vite/PWA build exit 0.
- Worktree diff check: exit 0 before commit; required range diff check rerun after commit.

## Commands

```text
cd web && bun run test src/components/AssistantChat/messages/AssistantMessage.integration.test.tsx
bun run test:web
bun run typecheck:web
bun run build:web
git diff --check
git diff --check main...HEAD
git diff --name-only main...HEAD
```

## Scope

- Task 4 changed only:
  - `web/src/components/AssistantChat/messages/AssistantMessage.integration.test.tsx`
  - `.superpowers/sdd/task-4-report.md`
- Branch range contains web presentation/tests plus approved design/plan artifacts and SDD reports.
- Forbidden scope check: no `shared/`, `cli/`, `hub/`, lockfile, package manifest or dependency changes.

## Concerns

- Build still prints existing Browserslist age, KaTeX font-resolution and large-chunk warnings; build succeeds.
- Full test run includes the intentional Mermaid error-boundary stderr fixture; all tests pass.
- No manual browser/session E2E was requested or run; `RuntimeHarness` exercises the real web runtime adapter under jsdom.
