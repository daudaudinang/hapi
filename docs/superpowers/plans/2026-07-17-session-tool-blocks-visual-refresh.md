# Session Tool Blocks Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the special blocks inside a HAPI session conversation to match the approved Agent Mode prototype while preserving all message, tool, diff, and permission behavior.

**Architecture:** Keep the existing `ToolCallBlock → getToolPresentation → ToolCard → view/footer` pipeline. Add theme-aware presentation tones and focused compact views inside the current renderer; do not add a parallel message system or change application data flow.

**Tech Stack:** React 19, TypeScript strict, Tailwind CSS 4, Radix Dialog, assistant-ui, Vitest, Testing Library, Bun workspaces.

**Design source:** `docs/superpowers/specs/2026-07-17-session-tool-blocks-visual-refresh-design.md` and the approved Agent Mode prototype version 4.

## Global Constraints

- Presentation-only: no changes to shared schemas, normalized messages, SSE, REST, RPC, database, permission payloads, or mutation sequencing.
- Touch only the session reasoning/tool-block renderer, its focused views/tests, and narrowly-scoped theme tokens.
- Preserve every existing permission option, callback, loading guard, disabled state, haptic, error message, and `onDone` call.
- Preserve ToolCard dialogs, Task child nesting, trace access, streaming state, elapsed time, and provider-specific tool support.
- Light and dark themes use the same component structure.
- The primary permission action uses a neutral blue background with explicit white foreground and at least 4.5:1 contrast.
- No new runtime dependency.
- TDD for every behavioral/presentation contract; 4-space indentation; TypeScript remains strict.

---

## Scope map

| File/area | Role | Planned change | Risk |
|---|---|---|---|
| `web/src/index.css` | App theme tokens | Add tool-surface and permission-primary tokens only | Yellow: global stylesheet, but new tokens are isolated |
| `web/src/components/ToolCard/knownTools.tsx` | Tool presentation registry | Add stable visual tone metadata | Yellow: used by all providers |
| `web/src/components/ToolCard/surface.ts` | New pure presentation policy | Map tool/permission state to neutral, plan, diff, permission | Green: no side effects |
| `web/src/components/ToolCard/ToolCard.tsx` | Shared tool shell/dialog | Apply tone-specific hierarchy without changing body/dialog flow | Yellow: shared renderer |
| `web/src/components/ToolCard/PermissionFooter.tsx` | Permission actions | Match attention-card/button treatment; preserve callbacks | Red: security-sensitive interaction |
| `web/src/components/assistant-ui/reasoning.tsx` | Reasoning disclosure | Restyle existing disclosure only | Green |
| `web/src/components/ToolCard/checklist.tsx` | Plan/todo parsing and rows | Add pure progress helper and compact status rows | Green |
| `web/src/components/ToolCard/views/UpdatePlanView.tsx` | Plan artifact body | Add progress summary and bounded inline preview | Green |
| `web/src/components/ToolCard/views/_all.tsx` | Tool view registry | Use the same plan view in the dialog | Green |
| `web/src/components/ToolCard/views/CodexDiffView.tsx` | Diff artifact body | Add memoized multi-file summary inline; keep full dialog | Yellow: large/malformed diffs |
| Focused `*.test.tsx`/`*.test.ts` files | Regression coverage | Lock tone, callbacks, contrast, progress, diff parsing, disclosure | Green |

**Explicitly untouched:** `SessionList`, dashboard/pins, `SessionHeader`, `SessionChat`, composer, routes, Mermaid renderer, `DiffView`, generic UI `Card/Button/Dialog`, hub, CLI, and shared packages.

---

### Task 1: Define isolated tool-surface policy and theme tokens

**Files:**
- Create: `web/src/components/ToolCard/surface.ts`
- Create: `web/src/components/ToolCard/surface.test.ts`
- Create: `web/src/components/ToolCard/permissionTheme.test.ts`
- Modify: `web/src/components/ToolCard/knownTools.tsx`
- Modify: `web/src/index.css`

**Interfaces:**
- Produces: `ToolSurfaceTone = 'neutral' | 'plan' | 'diff' | 'permission'`
- Produces: `getBaseToolSurfaceTone(toolName: string): Exclude<ToolSurfaceTone, 'permission'>`
- Produces: `resolveToolSurfaceTone(baseTone, permissionStatus): ToolSurfaceTone`
- Extends: `ToolPresentation` with `tone: Exclude<ToolSurfaceTone, 'permission'>`

- [ ] **Step 0: Record the exact implementation baseline for the final scope audit**

```bash
git rev-parse HEAD > /tmp/hapi-session-tool-blocks-visual-refresh.base
test -s /tmp/hapi-session-tool-blocks-visual-refresh.base
```

Expected: the file contains the branch HEAD before production-code edits.

- [ ] **Step 1: Write failing policy tests**

Create `surface.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getBaseToolSurfaceTone, resolveToolSurfaceTone } from './surface'

describe('tool surface policy', () => {
    it.each(['update_plan', 'TodoWrite', 'ExitPlanMode', 'exit_plan_mode'])(
        'maps %s to the plan artifact tone',
        (toolName) => expect(getBaseToolSurfaceTone(toolName)).toBe('plan')
    )

    it.each(['CodexDiff', 'CodexPatch', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'])(
        'maps %s to the diff artifact tone',
        (toolName) => expect(getBaseToolSurfaceTone(toolName)).toBe('diff')
    )

    it('keeps routine and unknown tools neutral', () => {
        expect(getBaseToolSurfaceTone('Read')).toBe('neutral')
        expect(getBaseToolSurfaceTone('mcp__server__tool')).toBe('neutral')
    })

    it('lets pending permission override the base artifact tone', () => {
        expect(resolveToolSurfaceTone('diff', 'pending')).toBe('permission')
        expect(resolveToolSurfaceTone('diff', 'approved')).toBe('diff')
        expect(resolveToolSurfaceTone('plan', undefined)).toBe('plan')
    })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
cd web && bun run test src/components/ToolCard/surface.test.ts
```

Expected: FAIL because `surface.ts` does not exist.

- [ ] **Step 3: Implement the pure mapping**

Create `surface.ts`:

```ts
import type { ToolPermission } from '@/chat/types'

export type ToolSurfaceTone = 'neutral' | 'plan' | 'diff' | 'permission'
export type BaseToolSurfaceTone = Exclude<ToolSurfaceTone, 'permission'>

const PLAN_TOOLS = new Set(['update_plan', 'TodoWrite', 'ExitPlanMode', 'exit_plan_mode'])
const DIFF_TOOLS = new Set(['CodexDiff', 'CodexPatch', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

export function getBaseToolSurfaceTone(toolName: string): BaseToolSurfaceTone {
    if (PLAN_TOOLS.has(toolName)) return 'plan'
    if (DIFF_TOOLS.has(toolName)) return 'diff'
    return 'neutral'
}

export function resolveToolSurfaceTone(
    baseTone: BaseToolSurfaceTone,
    permissionStatus: ToolPermission['status'] | undefined
): ToolSurfaceTone {
    return permissionStatus === 'pending' ? 'permission' : baseTone
}
```

In `knownTools.tsx`, import `BaseToolSurfaceTone` and `getBaseToolSurfaceTone`, add `tone` to `ToolPresentation`, and include it in all three return paths:

```ts
export type ToolPresentation = {
    icon: ReactNode
    title: string
    subtitle: string | null
    minimal: boolean
    tone: BaseToolSurfaceTone
}

tone: getBaseToolSurfaceTone(opts.toolName)
```

- [ ] **Step 4: Add explicit light/dark surface tokens**

Add to both `:root` and `[data-theme="dark"]` in `index.css`, with the dark values placed in the dark block rather than inherited accidentally:

```css
--app-tool-plan-accent: #7c3fc5;
--app-tool-plan-border: rgba(124, 63, 197, 0.42);
--app-tool-diff-accent: #168344;
--app-tool-diff-border: rgba(22, 131, 68, 0.38);
--app-tool-attention-bg: rgba(166, 95, 0, 0.07);
--app-tool-attention-border: rgba(166, 95, 0, 0.48);
--app-tool-attention-accent: #a65f00;
--app-primary-action-bg: #2867df;
--app-primary-action-bg-hover: #225fc8;
--app-primary-action-text: #ffffff;
```

Dark overrides:

```css
--app-tool-plan-accent: #bf5af2;
--app-tool-plan-border: rgba(191, 90, 242, 0.42);
--app-tool-diff-accent: #30d158;
--app-tool-diff-border: rgba(48, 209, 88, 0.36);
--app-tool-attention-bg: rgba(255, 214, 10, 0.06);
--app-tool-attention-border: rgba(255, 214, 10, 0.42);
--app-tool-attention-accent: #ffd60a;
--app-primary-action-bg: #2867df;
--app-primary-action-bg-hover: #225fc8;
--app-primary-action-text: #ffffff;
```

- [ ] **Step 5: Add the contrast regression test**

Create `permissionTheme.test.ts` that reads `../../index.css`, extracts `--app-primary-action-bg`, `--app-primary-action-bg-hover`, and `--app-primary-action-text` from both theme blocks, converts sRGB to relative luminance, and asserts both normal and hover ratios are `>= 4.5`.

Use this complete test body:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8')

function block(pattern: RegExp, label: string): string {
    const match = css.match(pattern)
    if (!match) throw new Error(`Missing ${label} theme block`)
    return match[1]
}

function hexToken(source: string, name: string): string {
    const match = source.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
    if (!match) throw new Error(`Missing --${name}`)
    return match[1]
}

function luminance(hex: string): number {
    const channels = hex.slice(1).match(/../g)!.map((part) => {
        const value = Number.parseInt(part, 16) / 255
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground: string, background: string): number {
    const lighter = Math.max(luminance(foreground), luminance(background))
    const darker = Math.min(luminance(foreground), luminance(background))
    return (lighter + 0.05) / (darker + 0.05)
}

function actionTokens(source: string) {
    return {
        text: hexToken(source, 'app-primary-action-text'),
        background: hexToken(source, 'app-primary-action-bg'),
        hover: hexToken(source, 'app-primary-action-bg-hover')
    }
}

describe('permission primary action theme', () => {
    it('keeps normal and hover foreground contrast at WCAG AA in both themes', () => {
        const lightTokens = actionTokens(block(/:root\s*{([\s\S]*?)\n}/, 'light'))
        const darkTokens = actionTokens(block(/\[data-theme="dark"\]\s*{([\s\S]*?)\n}/, 'dark'))

        for (const theme of [lightTokens, darkTokens]) {
            expect(contrast(theme.text, theme.background)).toBeGreaterThanOrEqual(4.5)
            expect(contrast(theme.text, theme.hover)).toBeGreaterThanOrEqual(4.5)
        }
    })
})
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
cd web
bun run test src/components/ToolCard/surface.test.ts src/components/ToolCard/permissionTheme.test.ts src/components/ToolCard/checklist.test.tsx
bun run typecheck
```

Expected: all tests PASS; TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add web/src/index.css web/src/components/ToolCard/surface.ts web/src/components/ToolCard/surface.test.ts web/src/components/ToolCard/permissionTheme.test.ts web/src/components/ToolCard/knownTools.tsx
git commit -m "feat(web): add tool artifact presentation tones"
```

---

### Task 2: Apply the approved hierarchy to the shared ToolCard shell

**Files:**
- Create: `web/src/components/ToolCard/ToolCard.test.tsx`
- Modify: `web/src/components/ToolCard/ToolCard.tsx`

**Interfaces:**
- Consumes: `ToolPresentation.tone`
- Consumes: `resolveToolSurfaceTone(baseTone, permissionStatus)`
- Produces: `data-tool-surface="neutral|plan|diff|permission"` for test and inspection
- Preserves: the existing `ToolCardProps` interface and dialog/body/footer tree

- [ ] **Step 1: Write failing shell tests**

Create a `makeToolBlock(name, permission?)` fixture and render `ToolCard` with `api={{} as ApiClient}`, `metadata={null}`, `disabled={false}`, and `onDone={vi.fn()}`. Mock `PermissionFooter` to a static element so this test covers only the shell.

Use these exact helpers:

```tsx
const pendingPermission: ToolPermission = { id: 'permission-1', status: 'pending' }

function makeToolBlock(name: string, permission?: ToolPermission): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `tool-${name}`,
        localId: null,
        createdAt: 1,
        tool: {
            id: `tool-${name}`,
            name,
            state: permission ? 'pending' : 'completed',
            input: name === 'update_plan' ? { plan: [{ step: 'Ship', status: 'pending' }] } : {},
            createdAt: 1,
            startedAt: 1,
            completedAt: permission ? null : 2,
            description: null,
            result: null,
            permission
        },
        children: []
    }
}

function toolCardElement(name: string, permission?: ToolPermission) {
    return (
        <ToolCard
            api={{} as ApiClient}
            sessionId="session-1"
            metadata={null}
            disabled={false}
            onDone={vi.fn()}
            block={makeToolBlock(name, permission)}
        />
    )
}

function renderTool(name: string, permission?: ToolPermission) {
    return render(toolCardElement(name, permission))
}
```

Required assertions:

```tsx
it('renders routine tools as a neutral low-emphasis surface', () => {
    renderTool('Read')
    expect(screen.getByTestId('tool-card')).toHaveAttribute('data-tool-surface', 'neutral')
    expect(screen.getByTestId('tool-card')).toHaveClass('bg-transparent')
})

it('renders plan and diff tools as review artifacts', () => {
    const { rerender } = renderTool('update_plan')
    expect(screen.getByTestId('tool-card')).toHaveAttribute('data-tool-surface', 'plan')
    rerender(toolCardElement('CodexDiff'))
    expect(screen.getByTestId('tool-card')).toHaveAttribute('data-tool-surface', 'diff')
})

it('makes pending permission the highest visual priority', () => {
    renderTool('Write', pendingPermission)
    expect(screen.getByTestId('tool-card')).toHaveAttribute('data-tool-surface', 'permission')
})

it('keeps the details dialog trigger keyboard-accessible', () => {
    renderTool('Read')
    expect(screen.getByRole('button', { name: /read/i })).toBeEnabled()
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd web && bun run test src/components/ToolCard/ToolCard.test.tsx
```

Expected: FAIL because the card has no surface data/class contract.

- [ ] **Step 3: Add static class maps and resolve the effective tone**

In `ToolCard.tsx`:

```ts
import { resolveToolSurfaceTone, type ToolSurfaceTone } from '@/components/ToolCard/surface'

const SURFACE_CLASS: Record<ToolSurfaceTone, string> = {
    neutral: 'border-transparent bg-transparent shadow-none',
    plan: 'border-[var(--app-tool-plan-border)] bg-[var(--app-secondary-bg)]',
    diff: 'border-[var(--app-tool-diff-border)] bg-[var(--app-secondary-bg)]',
    permission: 'border-[var(--app-tool-attention-border)] bg-[var(--app-tool-attention-bg)]'
}

const ICON_CLASS: Record<ToolSurfaceTone, string> = {
    neutral: 'text-[var(--app-hint)] bg-transparent',
    plan: 'text-[var(--app-tool-plan-accent)] bg-[var(--app-subtle-bg)]',
    diff: 'text-[var(--app-tool-diff-accent)] bg-[var(--app-subtle-bg)]',
    permission: 'text-[var(--app-tool-attention-accent)] bg-[var(--app-subtle-bg)]'
}
```

Resolve after `permission` is known:

```ts
const surfaceTone = resolveToolSurfaceTone(presentation.tone, permission?.status)
```

Apply without moving the dialog or footer:

```tsx
<Card
    data-testid="tool-card"
    data-tool-surface={surfaceTone}
    className={cn('overflow-hidden border shadow-sm', SURFACE_CLASS[surfaceTone])}
>
```

Change only the icon wrapper to a 28px rounded badge for non-neutral surfaces. Keep the title, subtitle, elapsed timer, state icon, detail chevron, dialog, inline view, task summary, and footer in their current order.

- [ ] **Step 4: Verify focused and existing ToolCard tests**

```bash
cd web
bun run test src/components/ToolCard/ToolCard.test.tsx src/components/ToolCard/checklist.test.tsx src/components/ToolCard/trace.test.tsx src/components/ToolCard/views/_results.test.tsx
```

Expected: PASS with all existing trace/result behavior unchanged.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ToolCard/ToolCard.tsx web/src/components/ToolCard/ToolCard.test.tsx
git commit -m "feat(web): refresh session tool card hierarchy"
```

---

### Task 3: Restyle permission actions without changing permission logic

**Files:**
- Create: `web/src/components/ToolCard/PermissionFooter.test.tsx`
- Modify: `web/src/components/ToolCard/PermissionFooter.tsx`

**Interfaces:**
- Preserves all existing calls to `approvePermission` and `denyPermission`
- Preserves Claude/Codex option visibility rules
- Produces button markers `data-permission-action="allow|neutral|deny"`

- [ ] **Step 1: Write failing behavior and presentation tests**

Mock `usePlatform` with `haptic.notification = vi.fn()` and mock `useTranslation` with an English key map. Build one Claude `Write` permission and one Codex permission fixture.

Use `fireEvent`/`waitFor` from Testing Library; do not add `@testing-library/user-event`. Define fixtures as follows:

```tsx
const labels: Record<string, string> = {
    'tool.waitingForApproval': 'Waiting for approval…',
    'tool.allow': 'Allow',
    'tool.allowAll': 'Allow all edits',
    'tool.allowForSession': 'Allow for session',
    'tool.deny': 'Deny',
    'tool.yes': 'Yes',
    'tool.yesForSession': 'Yes for session',
    'tool.abortLabel': 'Abort',
    'tool.requestFailed': 'Request failed'
}

function makePendingTool(name = 'Write'): ChatToolCall {
    return {
        id: 'tool-1',
        name,
        state: 'pending',
        input: { file_path: '/repo/src/file.ts' },
        createdAt: 1,
        startedAt: 1,
        completedAt: null,
        description: null,
        permission: { id: 'permission-1', status: 'pending' }
    }
}

function renderPermission(tool = makePendingTool(), apiOverrides: Partial<ApiClient> = {}) {
    const api = {
        approvePermission: vi.fn().mockResolvedValue(undefined),
        denyPermission: vi.fn().mockResolvedValue(undefined),
        ...apiOverrides
    } as unknown as ApiClient
    render(
        <PermissionFooter
            api={api}
            sessionId="session-1"
            metadata={null}
            tool={tool}
            disabled={false}
            onDone={vi.fn()}
        />
    )
    return { api }
}

function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => { resolve = done })
    return { promise, resolve }
}
```

Required tests:

```tsx
it('renders approval as the explicit blue primary action and deny as outline', () => {
    renderPermission(makePendingTool())
    const allow = screen.getByRole('button', { name: 'Allow' })
    const deny = screen.getByRole('button', { name: 'Deny' })
    expect(allow).toHaveAttribute('data-permission-action', 'allow')
    expect(allow).toHaveClass('bg-[var(--app-primary-action-bg)]')
    expect(allow).toHaveClass('text-[var(--app-primary-action-text)]')
    expect(deny).toHaveAttribute('data-permission-action', 'deny')
    expect(deny).toHaveClass('border-[var(--app-border)]')
})

it('keeps approve and deny API payloads unchanged', async () => {
    const { api } = renderPermission(makePendingTool())
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => expect(api.approvePermission).toHaveBeenCalledTimes(1))
    expect(api.approvePermission).toHaveBeenCalledWith('session-1', 'permission-1')
})

it('keeps allow-all-edits and Codex session options visible', () => {
    const { unmount } = renderPermission(makePendingTool('Write'))
    expect(screen.getByRole('button', { name: 'Allow all edits' })).toBeInTheDocument()
    unmount()
    renderPermission(makePendingTool('CodexPermission'))
    expect(screen.getByRole('button', { name: 'Yes for session' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Abort' })).toBeInTheDocument()
})

it('disables every action while one request is pending', async () => {
    const pending = deferred<void>()
    renderPermission(makePendingTool(), { approvePermission: vi.fn(() => pending.promise) } as Partial<ApiClient>)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    await waitFor(() => {
        for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    })
    pending.resolve(undefined)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled())
})

it('shows the existing error text when the API rejects', async () => {
    renderPermission(makePendingTool(), {
        approvePermission: vi.fn().mockRejectedValue(new Error('Workspace is read-only'))
    } as Partial<ApiClient>)
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }))
    expect(await screen.findByText('Workspace is read-only')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd web && bun run test src/components/ToolCard/PermissionFooter.test.tsx
```

Expected: presentation assertions FAIL while the existing callback expectations document the behavior to preserve.

- [ ] **Step 3: Change only `PermissionRowButton` styling and layout**

Keep `approve`, `approveAllEdits`, `approveForSession`, `deny`, `codexApprove`, and `codexAbort` byte-for-byte unless a type-only adjustment is necessary.

Use:

```ts
const base = 'min-h-9 min-w-[8rem] flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]'
const tone = props.tone === 'allow'
    ? 'border border-[var(--app-primary-action-bg)] bg-[var(--app-primary-action-bg)] text-[var(--app-primary-action-text)] hover:bg-[var(--app-primary-action-bg-hover)]'
    : props.tone === 'deny'
        ? 'border border-[var(--app-border)] bg-transparent text-red-600 hover:bg-[var(--app-subtle-bg)]'
        : 'border border-[var(--app-border)] bg-[var(--app-secondary-bg)] text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]'
```

Add `data-permission-action={props.tone}` and change the action container to:

```tsx
<div className="mt-3 flex flex-wrap gap-2">
    {/* Existing conditional action branches, unchanged */}
</div>
```

Keep the summary and error above the actions. Do not add an Undo path because no such application behavior exists today.

- [ ] **Step 4: Run permission, contrast, and ToolCard tests**

```bash
cd web
bun run test src/components/ToolCard/PermissionFooter.test.tsx src/components/ToolCard/permissionTheme.test.ts src/components/ToolCard/ToolCard.test.tsx
```

Expected: PASS; API payload assertions prove the interaction logic remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ToolCard/PermissionFooter.tsx web/src/components/ToolCard/PermissionFooter.test.tsx
git commit -m "feat(web): polish session permission attention card"
```

---

### Task 4: Restyle the existing reasoning disclosure

**Files:**
- Create: `web/src/components/assistant-ui/reasoning.test.tsx`
- Modify: `web/src/components/assistant-ui/reasoning.tsx`

**Interfaces:**
- Preserves: collapsed-by-default state
- Preserves: auto-open while the last message part is streaming reasoning
- Preserves: `MarkdownTextPrimitive` content and plugins

- [ ] **Step 1: Write failing disclosure tests**

Mock `useMessage` from `@assistant-ui/react` and render `ReasoningGroup` with static child text.

Use:

```tsx
const useMessageMock = vi.fn()

vi.mock('@assistant-ui/react', () => ({
    useMessage: () => useMessageMock()
}))

function mockMessage(message: { status: { type: string }; content: Array<{ type: string; text?: string }> }) {
    useMessageMock.mockReturnValue(message)
}
```

```tsx
it('starts collapsed with the approved bordered toggle', () => {
    mockMessage({ status: { type: 'complete' }, content: [] })
    render(<ReasoningGroup><span>Reasoning body</span></ReasoningGroup>)
    const trigger = screen.getByRole('button', { name: /reasoning/i })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveClass('border-[var(--app-border)]')
})

it('opens and closes from the semantic button', async () => {
    mockMessage({ status: { type: 'complete' }, content: [] })
    render(<ReasoningGroup><span>Reasoning body</span></ReasoningGroup>)
    const trigger = screen.getByRole('button', { name: /reasoning/i })
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

it('auto-opens while reasoning is the active streaming part', async () => {
    mockMessage({ status: { type: 'running' }, content: [{ type: 'reasoning', text: '...' }] })
    render(<ReasoningGroup><span>Reasoning body</span></ReasoningGroup>)
    expect(await screen.findByRole('button', { name: /reasoning/i })).toHaveAttribute('aria-expanded', 'true')
})
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd web && bun run test src/components/assistant-ui/reasoning.test.tsx
```

Expected: bordered-toggle assertion FAIL.

- [ ] **Step 3: Apply the prototype disclosure surface**

Add `aria-expanded={isOpen}` and keep the existing click handler. Replace only structural classes:

```tsx
<div className="aui-reasoning-group my-3">
    <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
            'flex min-h-10 w-full items-center gap-2 rounded-md border border-[var(--app-border)]',
            'bg-[var(--app-bg)] px-2.5 py-2 text-left text-xs font-medium',
            'text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)] hover:text-[var(--app-fg)]',
            'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-link)]'
        )}
    >
```

Keep the current chevron, `Reasoning` label, streaming dot, animated content wrapper, and left-border body. Reduce motion only through existing global behavior; do not introduce a new animation.

- [ ] **Step 4: Verify**

```bash
cd web
bun run test src/components/assistant-ui/reasoning.test.tsx src/components/AssistantChat/messages/assistantCopyText.test.ts
bun run typecheck
```

Expected: PASS and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/assistant-ui/reasoning.tsx web/src/components/assistant-ui/reasoning.test.tsx
git commit -m "feat(web): refine session reasoning disclosure"
```

---

### Task 5: Build the compact plan artifact preview

**Files:**
- Modify: `web/src/components/ToolCard/checklist.tsx`
- Modify: `web/src/components/ToolCard/checklist.test.tsx`
- Modify: `web/src/components/ToolCard/views/UpdatePlanView.tsx`
- Modify: `web/src/components/ToolCard/views/_all.tsx`

**Interfaces:**
- Produces: `getChecklistProgress(items): { completed: number; total: number; percent: number }`
- Inline `UpdatePlanView`: progress + at most 3 rows + remainder count
- Dialog `UpdatePlanView`: full checklist

- [ ] **Step 1: Extend tests before implementation**

Add to `checklist.test.tsx`:

Define the fixture before the tests:

```ts
const fiveSteps = {
    plan: [
        { step: 'Map renderer', status: 'completed' },
        { step: 'Style tools', status: 'completed' },
        { step: 'Style permissions', status: 'completed' },
        { step: 'Verify mobile', status: 'in_progress' },
        { step: 'Run build', status: 'pending' }
    ]
}
```

```tsx
describe('getChecklistProgress', () => {
    it('calculates completed count and rounded percentage', () => {
        expect(getChecklistProgress([
            { text: 'A', status: 'completed' },
            { text: 'B', status: 'completed' },
            { text: 'C', status: 'in_progress' }
        ])).toEqual({ completed: 2, total: 3, percent: 67 })
    })

    it('returns zero progress for an empty list', () => {
        expect(getChecklistProgress([])).toEqual({ completed: 0, total: 0, percent: 0 })
    })
})

it('shows progress and only three inline steps', () => {
    render(<UpdatePlanView block={makeUpdatePlanBlock(fiveSteps)} metadata={null} surface="inline" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    expect(screen.getByText('3 / 5 steps')).toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
})

it('shows every step in the dialog surface', () => {
    render(<UpdatePlanView block={makeUpdatePlanBlock(fiveSteps)} metadata={null} surface="dialog" />)
    expect(screen.queryByText('+2 more')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('checklist-row')).toHaveLength(5)
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd web && bun run test src/components/ToolCard/checklist.test.tsx
```

Expected: FAIL because the progress helper/preview do not exist.

- [ ] **Step 3: Implement progress and the bounded preview**

In `checklist.tsx`:

```ts
export function getChecklistProgress(items: ChecklistItem[]) {
    const completed = items.filter((item) => item.status === 'completed').length
    const total = items.length
    const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
    return { completed, total, percent }
}
```

Add `data-testid="checklist-row"` to the current row without changing extraction or status normalization.

In `UpdatePlanView.tsx`:

```tsx
export function UpdatePlanView(props: ToolViewProps) {
    const steps = extractUpdatePlanChecklist(props.block.tool.input, props.block.tool.result)
    if (props.surface === 'dialog') return <ChecklistList items={steps} />

    const progress = getChecklistProgress(steps)
    const visible = steps.slice(0, 3)
    const remaining = steps.length - visible.length

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3 text-xs text-[var(--app-hint)]">
                <div
                    role="progressbar"
                    aria-label="Plan progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent}
                    className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--app-subtle-bg)]"
                >
                    <div className="h-full bg-[var(--app-tool-plan-accent)]" style={{ width: `${progress.percent}%` }} />
                </div>
                <span>{progress.completed} / {progress.total} steps</span>
            </div>
            <ChecklistList items={visible} />
            {remaining > 0 ? <div className="text-xs text-[var(--app-hint)]">+{remaining} more</div> : null}
        </div>
    )
}
```

Add `update_plan: UpdatePlanView` to `toolFullViewRegistry` so the existing ToolCard dialog shows the full checklist instead of raw JSON.

- [ ] **Step 4: Verify**

```bash
cd web
bun run test src/components/ToolCard/checklist.test.tsx src/components/ToolCard/ToolCard.test.tsx
bun run typecheck
```

Expected: PASS; no parser behavior changed.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ToolCard/checklist.tsx web/src/components/ToolCard/checklist.test.tsx web/src/components/ToolCard/views/UpdatePlanView.tsx web/src/components/ToolCard/views/_all.tsx
git commit -m "feat(web): add compact plan artifact preview"
```

---

### Task 6: Build a bounded, accurate inline diff summary

**Files:**
- Create: `web/src/components/ToolCard/views/CodexDiffView.test.tsx`
- Modify: `web/src/components/ToolCard/views/CodexDiffView.tsx`
- Modify: `web/src/components/ToolCard/knownTools.tsx`

**Interfaces:**
- Produces: `summarizeUnifiedDiff(unifiedDiff: string): { added: number; removed: number; files: Array<{ path: string; added: number; removed: number }> }`
- Inline surface: total stats + at most 3 file rows
- Dialog surface: current full `DiffView` behavior

- [ ] **Step 1: Write failing parser and rendering tests**

Use a fixture containing two `diff --git` sections, `---`/`+++` headers, context, additions, removals, and `\ No newline at end of file`.

Define fixtures and block builder explicitly:

```tsx
const twoFileDiff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,2 +1,3 @@
-oldA
+newA
+extraA
 keep
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1 +1 @@
-oldB
+newB`

const fourFileDiff = ['a', 'b', 'c', 'd'].map((name) => `diff --git a/src/${name}.ts b/src/${name}.ts
--- a/src/${name}.ts
+++ b/src/${name}.ts
@@ -1 +1 @@
-old
+new`).join('\n')

function makeDiffBlock(unifiedDiff: string): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: 'diff-1',
        localId: null,
        createdAt: 1,
        tool: {
            id: 'diff-1',
            name: 'CodexDiff',
            state: 'completed',
            input: { unified_diff: unifiedDiff },
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
            result: null
        },
        children: []
    }
}
```

```tsx
it('counts changed lines without counting diff headers', () => {
    expect(summarizeUnifiedDiff(twoFileDiff)).toEqual({
        added: 3,
        removed: 2,
        files: [
            { path: 'src/a.ts', added: 2, removed: 1 },
            { path: 'src/b.ts', added: 1, removed: 1 }
        ]
    })
})

it('returns an empty bounded summary for malformed or empty input', () => {
    expect(summarizeUnifiedDiff('')).toEqual({ added: 0, removed: 0, files: [] })
})

it('renders totals and at most three file rows inline', () => {
    render(<CodexDiffCompactView block={makeDiffBlock(fourFileDiff)} metadata={null} surface="inline" />)
    expect(screen.getByText('+4')).toBeInTheDocument()
    expect(screen.getByText('−4')).toBeInTheDocument()
    expect(screen.getAllByTestId('diff-file-row')).toHaveLength(3)
    expect(screen.getByText('+1 more file')).toBeInTheDocument()
})

it('keeps the full DiffView on the dialog surface', () => {
    render(<CodexDiffFullView block={makeDiffBlock(twoFileDiff)} metadata={null} surface="dialog" />)
    expect(screen.getByTestId('diff-view')).toHaveAttribute('data-variant', 'inline')
})
```

For that final test, mock `DiffView` at the top of the file:

```tsx
vi.mock('@/components/DiffView', () => ({
    DiffView: (props: { variant?: string }) => (
        <div data-testid="diff-view" data-variant={props.variant ?? 'preview'} />
    )
}))
```

- [ ] **Step 2: Run and verify RED**

```bash
cd web && bun run test src/components/ToolCard/views/CodexDiffView.test.tsx
```

Expected: FAIL because the summary function/view do not exist.

- [ ] **Step 3: Implement a single linear scan**

Export `summarizeUnifiedDiff`. Start a file record on `diff --git ... b/<path>`; fall back to `+++ b/<path>` when no `diff --git` header exists. Count only hunk body lines after `@@`; exclude `+++`, `---`, metadata, context, and no-newline markers.

Use this implementation:

```ts
export type DiffFileSummary = { path: string; added: number; removed: number }
export type UnifiedDiffSummary = { added: number; removed: number; files: DiffFileSummary[] }

export function summarizeUnifiedDiff(unifiedDiff: string): UnifiedDiffSummary {
    const files: DiffFileSummary[] = []
    let current: DiffFileSummary | null = null
    let inHunk = false

    const startFile = (path: string) => {
        current = { path, added: 0, removed: 0 }
        files.push(current)
        inHunk = false
    }

    for (const line of unifiedDiff.split('\n')) {
        const diffHeader = line.match(/^diff --git a\/(.+?) b\/(.+)$/)
        if (diffHeader) {
            startFile(diffHeader[2])
            continue
        }

        if (!current && line.startsWith('+++ b/')) {
            startFile(line.slice('+++ b/'.length))
            continue
        }

        if (line.startsWith('@@')) {
            inHunk = true
            continue
        }
        if (!current || !inHunk || line === '\\ No newline at end of file') continue

        if (line.startsWith('+') && !line.startsWith('+++')) current.added += 1
        if (line.startsWith('-') && !line.startsWith('---')) current.removed += 1
    }

    return {
        added: files.reduce((total, file) => total + file.added, 0),
        removed: files.reduce((total, file) => total + file.removed, 0),
        files
    }
}
```

Import `useMemo` from React and replace `CodexDiffCompactView` with:

```tsx
export function CodexDiffCompactView(props: ToolViewProps) {
    const input = props.block.tool.input
    const unifiedDiff = isObject(input) && typeof input.unified_diff === 'string'
        ? input.unified_diff
        : null
    const summary = useMemo(
        () => unifiedDiff ? summarizeUnifiedDiff(unifiedDiff) : null,
        [unifiedDiff]
    )

    if (!summary || summary.files.length === 0) return null
    const visible = summary.files.slice(0, 3)

    return (
        <div className="flex flex-col gap-1.5 font-mono text-xs">
            <div className="flex gap-2">
                <span className="text-[var(--app-tool-diff-accent)]">+{summary.added}</span>
                <span className="text-red-600">−{summary.removed}</span>
            </div>
            {visible.map((file) => (
                <div key={file.path} data-testid="diff-file-row" className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-t border-[var(--app-border)] py-1.5">
                    <span className="truncate text-[var(--app-hint)]">{file.path}</span>
                    <span className="text-[var(--app-tool-diff-accent)]">+{file.added}</span>
                    <span className="text-red-600">−{file.removed}</span>
                </div>
            ))}
            {summary.files.length > 3 ? <span className="text-[var(--app-hint)]">+{summary.files.length - 3} more file{summary.files.length - 3 === 1 ? '' : 's'}</span> : null}
        </div>
    )
}
```

If `unified_diff` is missing or summary has no files, return `null`; ToolCard remains a safe header-only card. Do not modify `DiffView.tsx`.

Because the inline view is now bounded, update `knownTools.CodexDiff.minimal` so every non-empty diff shows the summary, including large diffs:

```ts
minimal: (opts) => !getInputStringAny(opts.input, ['unified_diff'])
```

Add a registry assertion to `CodexDiffView.test.tsx` that a 2,000+ character non-empty diff returns `presentation.minimal === false`.

```ts
const presentation = getToolPresentation({
    toolName: 'CodexDiff',
    input: { unified_diff: twoFileDiff.repeat(100) },
    result: null,
    childrenCount: 0,
    description: null,
    metadata: null
})
expect(presentation.minimal).toBe(false)
```

- [ ] **Step 4: Verify parser, registry, and existing result tests**

```bash
cd web
bun run test src/components/ToolCard/views/CodexDiffView.test.tsx src/components/ToolCard/views/_results.test.tsx src/components/ToolCard/ToolCard.test.tsx
bun run typecheck
```

Expected: PASS; the full-dialog DiffView contract remains intact.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ToolCard/views/CodexDiffView.tsx web/src/components/ToolCard/views/CodexDiffView.test.tsx web/src/components/ToolCard/knownTools.tsx
git commit -m "feat(web): add compact diff artifact summary"
```

---

### Task 7: Full regression and visual verification

**Files:**
- Modify only if verification exposes a defect: files already listed in Tasks 1–6
- Do not touch unrelated session/dashboard/backend files to make checks pass

**Interfaces:**
- Validates the complete presentation-only contract

- [ ] **Step 1: Run all focused regression tests together**

```bash
cd web
bun run test \
  src/components/ToolCard/surface.test.ts \
  src/components/ToolCard/permissionTheme.test.ts \
  src/components/ToolCard/ToolCard.test.tsx \
  src/components/ToolCard/PermissionFooter.test.tsx \
  src/components/ToolCard/checklist.test.tsx \
  src/components/ToolCard/trace.test.tsx \
  src/components/ToolCard/views/CodexDiffView.test.tsx \
  src/components/ToolCard/views/_results.test.tsx \
  src/components/assistant-ui/reasoning.test.tsx \
  src/components/AssistantChat/messages/assistantCopyText.test.ts
```

Expected: all selected files PASS, zero failed tests.

- [ ] **Step 2: Run the complete web verification suite**

```bash
cd web
bun run test
bun run typecheck
bun run build
```

Expected: all web tests PASS, typecheck exits 0, Vite production build exits 0.

- [ ] **Step 3: Inspect the real session UI in both themes**

Run from the repository root:

```bash
bun run dev
```

Browser matrix:

1. Desktop light: routine Read/Bash tool, Reasoning, pending Write permission, Plan, Diff.
2. Desktop dark: same blocks; verify all text/icons remain readable.
3. Narrow mobile width (360–390px): permission actions wrap with no horizontal overflow; paths truncate rather than widen the thread.
4. Running/error states: spinner, elapsed time, error icon/text, and details dialog remain visible.
5. Nested Task: pending permission remains outside collapsed historical details; trace dialog still opens.
6. Large diff and long path: inline summary stays bounded; full content opens in the dialog.

Capture before/after screenshots for light desktop, dark desktop, and one narrow viewport. Check keyboard focus on Reasoning, ToolCard detail trigger, Allow, Deny, and dialog close.

- [ ] **Step 4: Audit the actual diff for scope drift**

HAPI is not currently indexed in GitNexus, so use the repository diff as the required fallback evidence:

```bash
BASE_SHA=$(cat /tmp/hapi-session-tool-blocks-visual-refresh.base)
git status --short
git diff --name-only "$BASE_SHA"..HEAD
git diff --check "$BASE_SHA"..HEAD
git diff --stat "$BASE_SHA"..HEAD
```

Expected code paths: `web/src/index.css`, `web/src/components/ToolCard/**`, and `web/src/components/assistant-ui/reasoning*` only. Documentation commits may additionally contain the spec/plan files. Any hub/CLI/shared/session-layout change is scope drift and must be reverted or explicitly re-approved.

- [ ] **Step 5: Final review checkpoint**

Confirm each requirement against evidence:

- routine tools lower emphasis;
- reasoning disclosure matches approved hierarchy;
- permission surface is amber, approve is blue/white, deny is outline;
- every permission action and payload is unchanged;
- plan shows progress and bounded preview;
- diff shows accurate bounded summary and full dialog;
- both themes/mobile accessible;
- no application logic or unrelated component changed.

If verification required a corrective edit, rerun the narrow failing test first, then the full commands, and commit only the focused correction:

```bash
git add <only-the-corrected-files>
git commit -m "fix(web): address tool block visual regression"
```

Do not create an empty commit when no correction is needed.

---

## Completion criteria

The implementation is complete only when:

1. Every Task 1–6 RED test was observed failing for the intended reason before implementation.
2. Focused tests, full web tests, typecheck, and build pass from fresh commands.
3. Browser evidence covers light, dark, desktop, and narrow mobile states.
4. Diff inspection proves no backend/data-flow/session-layout scope drift.
5. Permission callback and payload tests prove this is a display-only change.
