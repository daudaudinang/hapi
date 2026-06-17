# Codex Goal Header Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Codex goal updates out of the chat timeline/status bar and expose the current goal through a header-only 🎯 icon plus modal controls.

**Architecture:** Keep Codex goal as session UI state derived from `codex_goal` events, not as a visible chat event. `SessionChat` already computes `reduced.latestGoal`; pass that goal to `SessionHeader`, render a goal button only when a goal exists, and let the modal send native slash commands (`/goal ...`, `/goal pause`, `/goal resume`, `/goal clear`) through the existing `onSend` path. This avoids new hub APIs and keeps Codex app-server behavior unchanged.

**Tech Stack:** TypeScript strict, React, Radix dialog primitives via `web/src/components/ui/dialog.tsx`, Vitest + Testing Library, Bun workspaces.

---

## Risk coverage

1. **No chat spam:** `codex-goal` events must keep updating `latestGoal` but must not produce `agent-event` timeline blocks.
2. **No status-bar chip:** remove the composer/status-bar goal chip so goal is only accessible from the header icon.
3. **Icon visibility:** show 🎯 only when `latestGoal !== null`; hide after `/goal clear` or `/clear` emits `codex_goal cleared`.
4. **Update controls use native Codex:** modal controls send slash commands through `props.onSend`, so CLI still handles `/goal` specially and does not create normal user turns.
5. **No accidental empty goal:** Update form must require non-empty objective before sending `/goal <objective>`.
6. **Inactive/non-Codex safety:** modal actions are disabled when the session is not Codex or when sending is unavailable; viewing remains allowed.
7. **Mobile/header width:** icon-only in header; no long chip in header/status bar.
8. **Progress freshness limitation:** v1 continues deriving goal from loaded normalized messages, matching current implementation. Persisting latest goal in session metadata remains out of scope.

---

## File structure / ownership

| File | Responsibility |
|---|---|
| `web/src/chat/reducerTimeline.ts` | Skip `codex-goal` events from visible timeline blocks while preserving reducer-level state derivation. |
| `web/src/chat/reducerGoal.test.ts` | Add regression tests proving `latestGoal` updates but no timeline block is rendered. |
| `web/src/components/AssistantChat/StatusBar.tsx` | Remove goal chip rendering and helper functions. |
| `web/src/components/AssistantChat/HappyComposer.tsx` | Remove `codexGoal` prop plumbing to `StatusBar`. |
| `web/src/components/SessionChat.tsx` | Pass `reduced.latestGoal` and goal command sender into `SessionHeader`; stop passing goal to composer. |
| `web/src/components/SessionGoalControl.tsx` | New focused header button + modal component for viewing/updating/pausing/resuming/unsetting Codex goal. |
| `web/src/components/SessionGoalControl.test.tsx` | Unit tests for icon visibility, modal content, command sending, and disabled states. |
| `web/src/components/SessionHeader.tsx` | Render `SessionGoalControl` in normal and compact headers when a goal exists. |
| `web/src/components/SessionHeader.test.tsx` | Integration-ish header tests for goal icon visibility and command plumbing. |
| `web/src/components/AssistantChat/StatusBar.test.tsx` | Delete or repurpose; goal chip tests should move to `SessionGoalControl.test.tsx`. |

---

## Task 1: Keep goal as state, not timeline/status content

**Files:**
- Modify: `web/src/chat/reducerTimeline.ts`
- Modify: `web/src/chat/reducerGoal.test.ts`
- Modify: `web/src/components/AssistantChat/StatusBar.tsx`
- Modify: `web/src/components/AssistantChat/HappyComposer.tsx`
- Modify: `web/src/components/SessionChat.tsx`
- Delete or rewrite: `web/src/components/AssistantChat/StatusBar.test.tsx`

- [ ] **Step 1: Add failing reducer test for hidden timeline event**

Append to `web/src/chat/reducerGoal.test.ts`:

```ts
import type { AgentEvent } from '@/chat/types'

it('updates latestGoal without rendering codex goal as a timeline block', () => {
    const goal = {
        threadId: 'thread-1',
        objective: 'ship goal modal',
        status: 'active' as const,
        tokenBudget: null,
        tokensUsed: 12000,
        timeUsedSeconds: 90,
        createdAt: 1776272400,
        updatedAt: 1776272490
    }

    const reduced = reduceChatBlocks([{
        id: 'goal-1',
        localId: null,
        createdAt: 1776272490,
        role: 'event',
        content: { type: 'codex-goal', action: 'updated', goal } satisfies AgentEvent,
        isSidechain: false
    }], null)

    expect(reduced.latestGoal).toEqual(goal)
    expect(reduced.blocks).toEqual([])
})
```

- [ ] **Step 2: Run reducer test and verify it fails**

```bash
cd web && bun run test -- src/chat/reducerGoal.test.ts
```

Expected: FAIL because `reduced.blocks` contains an `agent-event` for `codex-goal`.

- [ ] **Step 3: Hide `codex-goal` in timeline reducer**

In `web/src/chat/reducerTimeline.ts`, update the `msg.role === 'event'` branch:

```ts
        if (msg.role === 'event') {
            if (msg.content.type === 'ready') {
                hasReadyEvent = true
                continue
            }
            if (msg.content.type === 'token-count' || msg.content.type === 'codex-goal') {
                continue
            }
            blocks.push({
                kind: 'agent-event',
                id: msg.id,
                createdAt: msg.createdAt,
                event: msg.content,
                meta: msg.meta
            })
            continue
        }
```

- [ ] **Step 4: Remove goal chip from `StatusBar`**

In `web/src/components/AssistantChat/StatusBar.tsx`:

Remove:

```ts
import type { CodexGoalState } from '@/chat/types'
```

Remove helper functions:

```ts
function formatGoalElapsed(seconds: number): string { ... }
function formatGoalLabel(goal: CodexGoalState): string { ... }
function getGoalColor(status: CodexGoalState['status']): string { ... }
```

Remove prop:

```ts
codexGoal?: CodexGoalState | null
```

Remove render block:

```tsx
{props.codexGoal ? (
    <span ...>
        {formatGoalLabel(props.codexGoal)}
    </span>
) : null}
```

- [ ] **Step 5: Remove goal prop plumbing from composer**

In `web/src/components/AssistantChat/HappyComposer.tsx`, remove:

```ts
import type { CodexGoalState } from '@/chat/types'
```

Remove prop:

```ts
codexGoal?: CodexGoalState | null
```

Remove destructured variable:

```ts
codexGoal,
```

Remove `StatusBar` prop:

```tsx
codexGoal={codexGoal}
```

In `web/src/components/SessionChat.tsx`, remove `HappyComposer` prop:

```tsx
codexGoal={reduced.latestGoal}
```

- [ ] **Step 6: Move status-bar tests out of the way**

Delete `web/src/components/AssistantChat/StatusBar.test.tsx` if it only contains goal chip tests. Goal display is covered in Task 2 by `SessionGoalControl.test.tsx`.

```bash
git rm web/src/components/AssistantChat/StatusBar.test.tsx
```

- [ ] **Step 7: Run focused tests**

```bash
cd web && bun run test -- src/chat/reducerGoal.test.ts src/chat/reducerTimeline.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/chat/reducerTimeline.ts web/src/chat/reducerGoal.test.ts web/src/components/AssistantChat/StatusBar.tsx web/src/components/AssistantChat/HappyComposer.tsx web/src/components/SessionChat.tsx
git add -u web/src/components/AssistantChat/StatusBar.test.tsx
git commit -m "fix: keep Codex goals out of chat timeline"
```

---

## Task 2: Build `SessionGoalControl` header icon and modal

**Files:**
- Create: `web/src/components/SessionGoalControl.tsx`
- Create: `web/src/components/SessionGoalControl.test.tsx`

- [ ] **Step 1: Write failing tests for goal control behavior**

Create `web/src/components/SessionGoalControl.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionGoalControl } from './SessionGoalControl'
import type { CodexGoalState } from '@/chat/types'

const goal: CodexGoalState = {
    threadId: 'thread-1',
    objective: 'ship goal modal',
    status: 'active',
    tokenBudget: 200000,
    tokensUsed: 12000,
    timeUsedSeconds: 90,
    createdAt: 1776272400,
    updatedAt: 1776272490
}

describe('SessionGoalControl', () => {
    it('renders nothing when there is no goal', () => {
        render(<SessionGoalControl goal={null} onGoalCommand={vi.fn()} />)

        expect(screen.queryByRole('button', { name: /codex goal/i })).not.toBeInTheDocument()
    })

    it('opens a modal showing goal details and progress', () => {
        render(<SessionGoalControl goal={goal} onGoalCommand={vi.fn()} />)

        fireEvent.click(screen.getByRole('button', { name: /codex goal/i }))

        expect(screen.getByRole('dialog')).toBeInTheDocument()
        expect(screen.getByText('ship goal modal')).toBeInTheDocument()
        expect(screen.getByText('active · 12k/200k tokens · 1m 30s')).toBeInTheDocument()
    })

    it('sends update, pause, and unset commands', () => {
        const onGoalCommand = vi.fn()
        render(<SessionGoalControl goal={goal} onGoalCommand={onGoalCommand} />)

        fireEvent.click(screen.getByRole('button', { name: /codex goal/i }))
        fireEvent.change(screen.getByLabelText('Goal objective'), { target: { value: 'new objective' } })
        fireEvent.click(screen.getByRole('button', { name: 'Update goal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Pause goal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Unset goal' }))

        expect(onGoalCommand).toHaveBeenCalledWith('/goal new objective')
        expect(onGoalCommand).toHaveBeenCalledWith('/goal pause')
        expect(onGoalCommand).toHaveBeenCalledWith('/goal clear')
    })

    it('sends resume for paused goals', () => {
        const onGoalCommand = vi.fn()
        render(<SessionGoalControl goal={{ ...goal, status: 'paused' }} onGoalCommand={onGoalCommand} />)

        fireEvent.click(screen.getByRole('button', { name: /codex goal/i }))
        fireEvent.click(screen.getByRole('button', { name: 'Resume goal' }))

        expect(onGoalCommand).toHaveBeenCalledWith('/goal resume')
    })

    it('does not send an empty update objective', () => {
        const onGoalCommand = vi.fn()
        render(<SessionGoalControl goal={goal} onGoalCommand={onGoalCommand} />)

        fireEvent.click(screen.getByRole('button', { name: /codex goal/i }))
        fireEvent.change(screen.getByLabelText('Goal objective'), { target: { value: '   ' } })
        fireEvent.click(screen.getByRole('button', { name: 'Update goal' }))

        expect(onGoalCommand).not.toHaveBeenCalled()
        expect(screen.getByText('Goal objective cannot be empty.')).toBeInTheDocument()
    })
})
```

- [ ] **Step 2: Run tests and verify they fail**

```bash
cd web && bun run test -- src/components/SessionGoalControl.test.tsx
```

Expected: FAIL because `SessionGoalControl` does not exist.

- [ ] **Step 3: Implement `SessionGoalControl`**

Create `web/src/components/SessionGoalControl.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CodexGoalState } from '@/chat/types'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'

function formatCount(value: number): string {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    if (value >= 1_000) return `${Math.round(value / 1_000)}k`
    return String(value)
}

function formatElapsed(seconds: number): string {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`
}

function formatGoalProgress(goal: CodexGoalState): string {
    const tokenText = goal.tokenBudget !== null
        ? `${formatCount(goal.tokensUsed)}/${formatCount(goal.tokenBudget)} tokens`
        : `${formatCount(goal.tokensUsed)} tokens`
    return `${goal.status} · ${tokenText} · ${formatElapsed(goal.timeUsedSeconds)}`
}

function getStatusTone(status: CodexGoalState['status']): string {
    if (status === 'active') return 'text-blue-600'
    if (status === 'complete') return 'text-[#34C759]'
    if (status === 'blocked' || status === 'usageLimited' || status === 'budgetLimited') return 'text-amber-600'
    return 'text-[var(--app-hint)]'
}

export function SessionGoalControl(props: {
    goal: CodexGoalState | null
    onGoalCommand: (command: string) => void
    disabled?: boolean
    compact?: boolean
}) {
    const { goal, onGoalCommand, disabled = false, compact = false } = props
    const [open, setOpen] = useState(false)
    const [objectiveDraft, setObjectiveDraft] = useState(goal?.objective ?? '')
    const [error, setError] = useState<string | null>(null)
    const previousUpdatedAt = useRef<number | null>(goal?.updatedAt ?? null)
    const [flash, setFlash] = useState(false)

    useEffect(() => {
        setObjectiveDraft(goal?.objective ?? '')
        setError(null)
    }, [goal?.objective, goal?.threadId])

    useEffect(() => {
        if (!goal) {
            previousUpdatedAt.current = null
            setFlash(false)
            return
        }
        if (previousUpdatedAt.current !== null && goal.updatedAt !== previousUpdatedAt.current) {
            setFlash(true)
            const timeout = window.setTimeout(() => setFlash(false), 1600)
            previousUpdatedAt.current = goal.updatedAt
            return () => window.clearTimeout(timeout)
        }
        previousUpdatedAt.current = goal.updatedAt
    }, [goal])

    const progressText = useMemo(() => goal ? formatGoalProgress(goal) : '', [goal])

    if (!goal) return null

    const sendUpdate = () => {
        const nextObjective = objectiveDraft.trim()
        if (!nextObjective) {
            setError('Goal objective cannot be empty.')
            return
        }
        setError(null)
        onGoalCommand(`/goal ${nextObjective}`)
    }

    const sendPauseOrResume = () => {
        onGoalCommand(goal.status === 'paused' ? '/goal resume' : '/goal pause')
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    type="button"
                    aria-label="Codex goal"
                    title={goal.objective}
                    className={`relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--app-hint)] transition-colors hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)] ${flash ? 'ring-2 ring-blue-400' : ''}`}
                >
                    <span aria-hidden="true">🎯</span>
                    {goal.status === 'active' ? <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-blue-500" /> : null}
                </button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Codex Goal</DialogTitle>
                    <DialogDescription>
                        This goal is native Codex state. When active, Codex may continue working toward it when idle.
                    </DialogDescription>
                </DialogHeader>

                <div className="mt-4 space-y-4">
                    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-secondary-bg)] p-3">
                        <div className={`text-xs font-medium uppercase tracking-wide ${getStatusTone(goal.status)}`}>{goal.status}</div>
                        <div className="mt-1 text-sm font-medium text-[var(--app-fg)]">{goal.objective}</div>
                        <div className="mt-2 text-xs text-[var(--app-hint)]">{progressText}</div>
                    </div>

                    <div>
                        <label htmlFor="codex-goal-objective" className="mb-1 block text-xs font-medium text-[var(--app-hint)]">
                            Goal objective
                        </label>
                        <textarea
                            id="codex-goal-objective"
                            aria-label="Goal objective"
                            value={objectiveDraft}
                            onChange={(event) => setObjectiveDraft(event.target.value)}
                            className="min-h-24 w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-bg)] px-3 py-2 text-sm text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                            disabled={disabled}
                        />
                        {error ? <div className="mt-1 text-xs text-red-600">{error}</div> : null}
                    </div>

                    {disabled ? (
                        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                            Goal controls are unavailable while this session cannot receive commands.
                        </div>
                    ) : null}

                    <div className="flex flex-wrap justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={sendPauseOrResume} disabled={disabled}>
                            {goal.status === 'paused' ? 'Resume goal' : 'Pause goal'}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => onGoalCommand('/goal clear')} disabled={disabled}>
                            Unset goal
                        </Button>
                        <Button type="button" size="sm" onClick={sendUpdate} disabled={disabled}>
                            Update goal
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
```

- [ ] **Step 4: Run component tests**

```bash
cd web && bun run test -- src/components/SessionGoalControl.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/SessionGoalControl.tsx web/src/components/SessionGoalControl.test.tsx
git commit -m "feat: add Codex goal header control"
```

---

## Task 3: Wire goal control into `SessionHeader`

**Files:**
- Modify: `web/src/components/SessionHeader.tsx`
- Modify: `web/src/components/SessionHeader.test.tsx`
- Modify: `web/src/components/SessionChat.tsx`

- [ ] **Step 1: Add failing header tests**

Append to `web/src/components/SessionHeader.test.tsx`:

```tsx
it('shows Codex goal button only when a goal exists', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { rerender } = render(
        <QueryClientProvider client={qc}>
            <SessionHeader session={makeSession()} onBack={vi.fn()} api={null} />
        </QueryClientProvider>
    )

    expect(screen.queryByRole('button', { name: /codex goal/i })).not.toBeInTheDocument()

    rerender(
        <QueryClientProvider client={qc}>
            <SessionHeader
                session={makeSession({ metadata: { flavor: 'codex' } })}
                onBack={vi.fn()}
                api={null}
                codexGoal={{
                    threadId: 'thread-1',
                    objective: 'ship modal',
                    status: 'active',
                    tokenBudget: null,
                    tokensUsed: 12000,
                    timeUsedSeconds: 90,
                    createdAt: 1776272400,
                    updatedAt: 1776272490
                }}
                onGoalCommand={vi.fn()}
            />
        </QueryClientProvider>
    )

    expect(screen.getByRole('button', { name: /codex goal/i })).toBeInTheDocument()
})

it('sends goal commands from the header modal', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onGoalCommand = vi.fn()

    render(
        <QueryClientProvider client={qc}>
            <SessionHeader
                session={makeSession({ metadata: { flavor: 'codex' } })}
                onBack={vi.fn()}
                api={null}
                codexGoal={{
                    threadId: 'thread-1',
                    objective: 'ship modal',
                    status: 'active',
                    tokenBudget: null,
                    tokensUsed: 12000,
                    timeUsedSeconds: 90,
                    createdAt: 1776272400,
                    updatedAt: 1776272490
                }}
                onGoalCommand={onGoalCommand}
            />
        </QueryClientProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: /codex goal/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Unset goal' }))

    expect(onGoalCommand).toHaveBeenCalledWith('/goal clear')
})
```

- [ ] **Step 2: Run header tests and verify they fail**

```bash
cd web && bun run test -- src/components/SessionHeader.test.tsx
```

Expected: FAIL because `SessionHeader` has no `codexGoal` or `onGoalCommand` props.

- [ ] **Step 3: Add props and import in `SessionHeader.tsx`**

At top:

```ts
import type { CodexGoalState } from '@/chat/types'
import { SessionGoalControl } from '@/components/SessionGoalControl'
```

Extend props:

```ts
    codexGoal?: CodexGoalState | null
    onGoalCommand?: (command: string) => void
```

Add helper near derived state:

```ts
    const canControlGoal = agentFlavor === 'codex' && typeof props.onGoalCommand === 'function'
```

- [ ] **Step 4: Render in compact header actions**

Inside `.db-pinned__compact-actions`, before editor/files actions:

```tsx
                            {props.codexGoal ? (
                                <SessionGoalControl
                                    goal={props.codexGoal}
                                    onGoalCommand={props.onGoalCommand ?? (() => {})}
                                    disabled={!canControlGoal}
                                    compact
                                />
                            ) : null}
```

- [ ] **Step 5: Render in normal header actions**

In normal header, after editor button and before Team button:

```tsx
                    {props.codexGoal ? (
                        <SessionGoalControl
                            goal={props.codexGoal}
                            onGoalCommand={props.onGoalCommand ?? (() => {})}
                            disabled={!canControlGoal}
                        />
                    ) : null}
```

- [ ] **Step 6: Pass goal state and command sender from `SessionChat`**

In `web/src/components/SessionChat.tsx`, add:

```ts
    const handleGoalCommand = useCallback((command: string) => {
        handleSend(command)
    }, [handleSend])
```

Pass to header:

```tsx
                    codexGoal={agentFlavor === 'codex' ? reduced.latestGoal : null}
                    onGoalCommand={handleGoalCommand}
```

- [ ] **Step 7: Run header tests**

```bash
cd web && bun run test -- src/components/SessionHeader.test.tsx src/components/SessionGoalControl.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/SessionHeader.tsx web/src/components/SessionHeader.test.tsx web/src/components/SessionChat.tsx
git commit -m "feat: show Codex goal control in session header"
```

---

## Task 4: Polish modal behavior and remove stale visual companion files from git scope

**Files:**
- Modify: `web/src/components/SessionGoalControl.tsx`
- Modify: `web/src/components/SessionGoalControl.test.tsx`
- Verify ignored: `.superpowers/`

- [ ] **Step 1: Add flash regression test**

Append to `web/src/components/SessionGoalControl.test.tsx`:

```tsx
it('keeps the goal button icon-only and uses objective as title', () => {
    render(<SessionGoalControl goal={goal} onGoalCommand={vi.fn()} />)

    const button = screen.getByRole('button', { name: /codex goal/i })
    expect(button).toHaveAttribute('title', 'ship goal modal')
    expect(button).toHaveTextContent('🎯')
    expect(button).not.toHaveTextContent('ship goal modal')
})
```

- [ ] **Step 2: Run test**

```bash
cd web && bun run test -- src/components/SessionGoalControl.test.tsx
```

Expected: PASS if Task 2 implementation already kept button icon-only; otherwise adjust class/markup.

- [ ] **Step 3: Ensure visual companion files are not staged**

```bash
git status --short .superpowers
```

Expected: no output. If `.superpowers/` appears, add it to `.gitignore` before committing:

```bash
printf '\n# Superpowers visual brainstorm artifacts\n.superpowers/\n' >> .gitignore
git add .gitignore
git commit -m "chore: ignore superpowers brainstorm artifacts"
```

- [ ] **Step 4: Commit polish if needed**

```bash
git add web/src/components/SessionGoalControl.tsx web/src/components/SessionGoalControl.test.tsx
git commit -m "test: cover Codex goal icon behavior"
```

Skip commit if no code changes.

---

## Task 5: Verification and final review

**Files:**
- No intended source changes unless tests reveal a bug.

- [ ] **Step 1: Run focused web tests**

```bash
cd web && bun run test -- \
  src/chat/reducerGoal.test.ts \
  src/chat/reducerTimeline.test.ts \
  src/chat/normalize.test.ts \
  src/chat/presentation.test.ts \
  src/components/SessionGoalControl.test.tsx \
  src/components/SessionHeader.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck:web
```

Expected: PASS.

- [ ] **Step 3: Optional full checks**

```bash
bun run test:web
bun run typecheck
```

Expected: PASS. If `src/routes/editor.test.tsx > is registered in the router` times out only in full web suite but passes standalone, record it as existing flaky timing behavior and rerun that file standalone:

```bash
cd web && bun run test -- src/routes/editor.test.tsx
```

- [ ] **Step 4: Manual smoke test**

Start app:

```bash
bun run dev
```

Manual scenario:

```text
1. Open a Codex remote session.
2. Send /goal test header goal modal.
3. Confirm chat timeline does not show repeated “Goal active...” events.
4. Confirm 🎯 appears in header.
5. Click 🎯; modal shows objective/status/progress.
6. Update objective; confirm command sends and modal updates after notification.
7. Pause/resume; confirm status changes.
8. Unset; confirm icon disappears.
9. Send /clear after setting a goal; confirm icon disappears.
```

- [ ] **Step 5: Final review map**

Before final report, produce this map from actual diff:

| File/Khối | Vai trò | Rủi ro cần kiểm tra |
|---|---|---|
| `reducerTimeline.ts` | hides goal from chat | latestGoal still updates |
| `SessionGoalControl.tsx` | goal UI/modal | commands correct, no empty update |
| `SessionHeader.tsx` | icon placement | hidden when no goal, compact mode ok |
| `SessionChat.tsx` | command plumbing | uses existing send path |
| `StatusBar/HappyComposer` | remove old chip | no stale goal chip remains |

- [ ] **Step 6: Commit final fixes if verification required changes**

```bash
git status --short
git add <changed-files>
git commit -m "fix: polish Codex goal header modal"
```

Skip if working tree is clean.

---

## Expected final behavior

```text
No goal
→ no 🎯 icon in header
→ no goal text in chat/status bar

Goal set/updated
→ no timeline spam
→ 🎯 icon appears/briefly flashes
→ modal shows objective/status/progress

Goal paused
→ modal status says paused
→ primary control becomes Resume goal

Goal unset or /clear
→ latestGoal becomes null
→ 🎯 icon disappears
```

## Out of scope

- Persisting latest goal into session metadata for unloaded history.
- Creating a new goal from header when no goal exists.
- Adding hub REST/RPC APIs for goal management.
- Supporting `/goal edit` native editor flow.
- Manual browser visual polish beyond the simple modal.
