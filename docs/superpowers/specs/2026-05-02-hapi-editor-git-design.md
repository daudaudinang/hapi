# Hapi Editor Git Source Control Design

Date: 2026-05-02
Status: Approved for planning

## Goal

Add a VS Code-like Git Source Control workflow to Hapi Editor while keeping Hapi's existing visual language. The feature should let a user review repository changes, stage/unstage files, commit, pull, and push from the Editor without switching to the terminal.

## Non-goals for Phase 1

- Branch checkout or branch creation.
- Hunk-level or line-level staging.
- Discard/reset/stash/rebase/conflict-resolution UI.
- A full clone of VS Code visual chrome.

These remain part of the longer-term Source Control vision.

## Current codebase baseline

Existing pieces:

- Editor mode already has machine-level RPC handlers in `cli/src/modules/editorRpc.ts`.
- Editor directory listing annotates entries with basic Git status dots.
- Hub exposes Editor routes under `hub/src/web/routes/editor.ts`.
- Web API client has Editor file/directory/project methods in `web/src/api/client.ts`.
- Session-scoped file modal already has Git status parsing and staged/unstaged diff patterns via `web/src/lib/gitParsers.ts` and session Git routes.

Missing pieces:

- Dedicated Source Control panel inside Hapi Editor.
- Machine-level Git diff, stage, unstage, commit, pull, push operations.
- Branch/ahead/behind information for Editor project paths.
- Editor UI for staged and unstaged file lists.

## Product direction

Use "C as north-star" but ship in phases:

1. **Phase 1: Daily Git workflow**
   - Source Control tab inside the Editor left pane.
   - Status list with staged and unstaged groups.
   - File-level stage/unstage, stage all, unstage all.
   - Commit message box and commit button.
   - Branch display with ahead/behind counts.
   - Pull and push buttons.
   - Open a changed file/diff from the Source Control list.

2. **Phase 2: Branch workflow**
   - Branch picker.
   - Checkout existing branch.
   - Create branch.
   - Fetch and upstream setup polish.

3. **Phase 3: Advanced Git workflow**
   - Discard/reset/stash/rebase/conflict UX.
   - Hunk-level or line-level staging.
   - Richer merge conflict presentation.

## UI placement

Add a segmented tab switcher at the top of the current Editor left pane:

- `Files`
- `Git <count>`

`Files` keeps the current `EditorFileTree`. `Git` shows the Source Control panel. This avoids adding a VS Code-style activity bar in Phase 1, keeps the implementation small, and maps cleanly to mobile as top-level panes.

## Visual design rules

The Git UI must match Hapi's existing design language:

- Use existing CSS variables:
  - `--app-bg`
  - `--app-fg`
  - `--app-hint`
  - `--app-border`
  - `--app-divider`
  - `--app-subtle-bg`
  - `--app-secondary-bg`
  - `--app-button`
  - `--app-button-text`
- Use existing Git/diff palette:
  - `--app-git-staged-color`
  - `--app-git-unstaged-color`
  - `--app-git-deleted-color`
  - `--app-git-renamed-color`
  - `--app-git-untracked-color`
  - `--app-diff-added-*`
  - `--app-diff-removed-*`
- Match current Editor density: compact `text-xs`, `rounded-md`, subtle borders, quiet icon/text buttons.
- Do not hardcode VS Code colors.
- Preserve light, dark, and Telegram theme support through CSS variables.

## Desktop layout

Top header remains unchanged except it may display compact branch metadata when a Git project is active:

- branch name
- ahead count
- behind count

Left pane:

1. Segmented switcher: `Files | Git <count>`.
2. Source Control header:
   - title: `Source Control`
   - refresh action
   - overflow action placeholder for future phases
3. Branch row:
   - current branch
   - ahead/behind indicators
4. Commit area:
   - message textarea
   - commit button
   - optional validation when message is empty
5. Sync actions:
   - Pull
   - Push
6. Change groups:
   - `Staged Changes (n)` with unstage-all action
   - `Changes (n)` with stage-all action
7. File rows:
   - status badge (`M`, `A`, `D`, `R`, `?`, `U`)
   - file path/name
   - line additions/deletions where available
   - row action: stage or unstage

Main editor area:

- Selecting a Git file opens a diff view or regular file tab according to available data.
- Diff rendering should reuse existing Hapi diff styles and parsing patterns where possible.

Right pane:

- Agent Chat remains unchanged.
- Git panel should not steal right-pane chat/session space in Phase 1.

## Mobile layout

Mobile should expose Git as a first-class pane alongside existing mobile Editor surfaces:

- Files
- Editor
- Git
- Chat
- Terminal as currently supported

The Git pane uses the same Source Control component in a single-column layout. Commit actions and staged/unstaged groups stack vertically.

## Repository discovery and active repository

Editor Git must not assume the opened folder itself is the repository root. Before running status, diff, or mutating Git commands, the CLI resolves the active repository explicitly:

1. Run `git -C <projectPath> rev-parse --show-toplevel` and `git -C <projectPath> rev-parse --git-dir`.
2. If a repository is found, normalize `repoRoot` and use it as the working directory for all Git operations.
3. If no repository is found, return a successful structured response with `repositories: []` and a `notRepository` state. The UI shows a calm empty state: `No Git repository found`, and disables commit, stage, pull, and push actions.
4. If `repoRoot` is outside the configured Editor root, do not operate on it. Return a structured `repoOutsideRoot` state with guidance to open the repository root or expand the workspace root.

Phase 1 should support an active repository selector, even if most projects only have one repository:

- Default active repository: the repository containing the selected project path.
- Also scan for nested repositories below the project path with a small depth limit and skip heavy folders like `node_modules`, `.git`, caches, and build outputs.
- Include repositories whose `.git` is a directory or a file, so worktrees and submodules work correctly.
- Every Editor Git API call accepts either `repoRoot` or resolves it from `path`; if `repoRoot` is supplied, it must still be validated inside the Editor root.
- File paths in status/diff/stage operations are relative to the chosen `repoRoot`, not merely the opened project path.

Repository states to expose to the UI:

- `ready`: Git repository found and usable.
- `notRepository`: no repository for the opened folder.
- `repoOutsideRoot`: Git repository exists but is outside Editor root.
- `detached`: usable repository with detached HEAD; commit allowed, push disabled or warning-gated.
- `initial`: initial repository state; commit allowed when staged files exist.

Use `git` itself for discovery; do not rely only on checking for a `.git` directory. This handles worktrees, submodules, and `.git` files.

## Reuse from Agent mode Git

Agent mode already has session-scoped Git support:

- `cli/src/modules/common/handlers/git.ts` for status, numstat, and file diff.
- `hub/src/web/routes/git.ts` for session routes.
- `web/src/lib/gitParsers.ts` for porcelain v2 and numstat parsing.
- Session file/diff UI patterns in `web/src/routes/sessions/files.tsx`, `web/src/routes/sessions/file.tsx`, and related modal components.

Editor Git should reuse the useful parts but not directly call session routes:

- Reuse or extract common CLI Git helpers for `execFile`, timeout handling, path validation, status, numstat, and file diff.
- Reuse/adapt `gitParsers.ts` concepts and types for status grouping, branch, ahead/behind, and line stats.
- Reuse UI primitives/patterns for `StatusBadge`, line changes, and diff display.
- Keep Editor Git machine/project-scoped because it must work without an active agent session.

## Backend/API design

Add Editor Git operations as machine-level RPC because Editor operates on machine/project paths, not only active agent sessions.

New CLI RPC handlers should live near existing Editor handlers, likely `cli/src/modules/editorRpc.ts` initially. If the file grows too large, extract Git-specific helpers to `cli/src/modules/editorGitRpc.ts`.

Proposed machine RPC methods:

- `editor-git-status-v2`
  - input: `{ path: string; repoRoot?: string }`
  - output: structured repository state, repository list, active repository, branch, ahead/behind, staged files, unstaged files.
- `editor-git-diff-file`
  - input: `{ path: string; repoRoot?: string; filePath: string; staged?: boolean }`
  - output: command response with unified diff.
- `editor-git-stage-file`
  - input: `{ path: string; repoRoot?: string; filePath: string }`
- `editor-git-unstage-file`
  - input: `{ path: string; repoRoot?: string; filePath: string }`
- `editor-git-stage-all`
  - input: `{ path: string; repoRoot?: string }`
- `editor-git-unstage-all`
  - input: `{ path: string; repoRoot?: string }`
- `editor-git-commit`
  - input: `{ path: string; repoRoot?: string; message: string }`
- `editor-git-pull`
  - input: `{ path: string; repoRoot?: string }`
- `editor-git-push`
  - input: `{ path: string; repoRoot?: string }`

All handlers must resolve paths inside the configured Editor root and execute Git with `execFile`, never shell interpolation.

## Hub/web API design

Expose POST routes under `/api/editor/*`:

- `/api/editor/git-status`
- `/api/editor/git-diff-file`
- `/api/editor/git-stage-file`
- `/api/editor/git-unstage-file`
- `/api/editor/git-stage-all`
- `/api/editor/git-unstage-all`
- `/api/editor/git-commit`
- `/api/editor/git-pull`
- `/api/editor/git-push`

Each request includes `machineId` and `path` (project path). File-specific routes include `filePath`. Commit includes `message`.

Add corresponding methods to:

- `hub/src/sync/rpcGateway.ts`
- `hub/src/sync/syncEngine.ts`
- `hub/src/web/routes/editor.ts`
- `web/src/api/client.ts`
- `web/src/types/api.ts`

## Data parsing

Prefer `git status --porcelain=v2 -z --branch --untracked-files=all` for structured status. The `-z` format is required so file names with spaces, Unicode, renames, and unusual characters are handled correctly. Reuse and adapt `web/src/lib/gitParsers.ts` concepts for Editor responses, but avoid duplicating complex parsing on both backend and frontend if backend can return structured data.

Use `git diff --numstat` and `git diff --cached --numstat` for line stats.

Use `git diff --no-ext-diff -- <file>` and `git diff --cached --no-ext-diff -- <file>` for file diffs.

## Safety and errors

- Empty commit message: block in UI and return validation error server-side.
- Non-Git directory: return `notRepository` and show `No Git repository found` in Git tab without a red error state.
- Repository root outside Editor root: return `repoOutsideRoot`, disable actions, and ask user to open repo root or expand workspace root.
- Missing upstream on push/pull: show Git stderr with a clear action message; no upstream setup in Phase 1.
- Merge conflicts: display conflicted files with `U`, but do not add conflict-resolution UI in Phase 1.
- Destructive actions are out of Phase 1.
- Git command timeout should return a structured error.
- After any mutating operation, invalidate/refetch Editor Git status and relevant Editor directory queries.

## Testing strategy

Backend tests:

- Editor Git RPC rejects paths outside Editor root.
- Repository discovery reports `notRepository`, `repoOutsideRoot`, worktree/submodule `.git` file cases, and nested repositories.
- Status parsing reports branch, ahead/behind, staged, unstaged, untracked, rename, Unicode paths, and paths with spaces.
- Stage/unstage file mutate repository state.
- Commit requires non-empty message and succeeds with staged changes.
- Pull/push return structured command errors when remote/upstream is absent.

Hub tests:

- RPC gateway forwards new Editor Git methods to machine RPC.
- Editor routes validate request bodies and return errors for invalid input.

Web tests:

- Source Control panel renders branch and grouped changes.
- Stage/unstage buttons call API and refetch status.
- Commit button is disabled or errors when message is empty.
- `Files | Git` switcher preserves existing file tree behavior.
- Mobile Git pane renders with same component in stacked layout.

## Open decisions locked for Phase 1

- Source Control placement: left pane tab, not activity bar.
- Staging granularity: file-level only.
- Branch checkout/create: Phase 2.
- Visual style: Hapi-native, theme-token based.
