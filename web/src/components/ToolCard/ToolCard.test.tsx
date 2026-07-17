import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { ToolCallBlock, ToolPermission } from '@/chat/types'
import { I18nProvider } from '@/lib/i18n-context'
import en from '@/lib/locales/en'
import viVN from '@/lib/locales/vi-VN'
import zhCN from '@/lib/locales/zh-CN'
import { getToolPresentation } from './knownTools'
import { ToolCard } from './ToolCard'

vi.mock('@/components/ToolCard/PermissionFooter', () => ({
    PermissionFooter: () => null
}))
vi.mock('@/components/ToolCard/AskUserQuestionFooter', () => ({
    AskUserQuestionFooter: () => null
}))
vi.mock('@/components/ToolCard/RequestUserInputFooter', () => ({
    RequestUserInputFooter: () => null
}))
vi.mock('@/components/CodeBlock', () => ({
    CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>
}))

const oneFileDiff = [
    'diff --git a/a.ts b/a.ts',
    '--- a/a.ts',
    '+++ b/a.ts',
    '@@ -1 +1 @@',
    '-old',
    '+new'
].join('\n')

const pendingPermission = {
    id: 'permission-1',
    status: 'pending'
} satisfies ToolPermission

const api = {} as ApiClient

function makeToolBlock(
    name: string,
    input: unknown = {},
    permission?: ToolPermission
): ToolCallBlock {
    return {
        kind: 'tool-call',
        id: `block-${name}`,
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: `tool-${name}`,
            name,
            input,
            state: 'completed',
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
            result: null,
            permission
        }
    }
}

function toolCardElement(block: ToolCallBlock) {
    return (
        <I18nProvider>
            <ToolCard
                api={api}
                sessionId="session-1"
                metadata={null}
                disabled={false}
                onDone={vi.fn()}
                block={block}
            />
        </I18nProvider>
    )
}

function renderTool(block: ToolCallBlock) {
    localStorage.setItem('hapi-lang', 'en')
    return render(toolCardElement(block))
}

describe('ToolCard presentation hierarchy', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    afterEach(() => {
        cleanup()
    })

    it.each([
        ['Read', 'neutral'],
        ['mcp__server__tool', 'neutral'],
        ['update_plan', 'plan'],
        ['TodoWrite', 'plan'],
        ['ExitPlanMode', 'plan'],
        ['exit_plan_mode', 'plan'],
        ['CodexDiff', 'diff'],
        ['CodexPatch', 'diff'],
        ['Edit', 'diff'],
        ['MultiEdit', 'diff'],
        ['Write', 'diff'],
        ['NotebookEdit', 'diff']
    ] as const)('maps %s to %s', (toolName, expectedTone) => {
        const presentation = getToolPresentation({
            toolName,
            input: {},
            result: null,
            childrenCount: 0,
            description: null,
            metadata: null
        })

        expect(presentation.tone).toBe(expectedTone)
    })

    it('lets pending approval override the underlying diff tone', () => {
        const { container } = renderTool(makeToolBlock('Write', {}, pendingPermission))

        expect(container.querySelector('[data-tool-surface="permission"]')).not.toBeNull()
    })

    it.each(['AskUserQuestion', 'request_user_input'])(
        'does not mislabel pending %s as a security permission',
        (name) => {
            const { container } = renderTool(makeToolBlock(name, { questions: [] }, pendingPermission))

            expect(container.querySelector('[data-tool-surface="neutral"]')).not.toBeNull()
            expect(screen.queryByText('Permission required')).not.toBeInTheDocument()
        }
    )

    it('keeps routine tools compact but visibly interactive', () => {
        const { container } = renderTool(makeToolBlock('Read'))
        const card = container.querySelector('[data-tool-surface="neutral"]')

        expect(card).toHaveClass('bg-transparent')
        expect(screen.getByRole('button', { name: /read/i })).toHaveClass(
            'hover:bg-[var(--app-subtle-bg)]'
        )
    })

    it('shows explicit artifact actions', () => {
        const { rerender } = renderTool(makeToolBlock('update_plan', {
            plan: [{ step: 'Ship', status: 'pending' }]
        }))

        expect(screen.getByText('Open plan')).toBeInTheDocument()
        rerender(toolCardElement(makeToolBlock('CodexDiff', { unified_diff: oneFileDiff })))
        expect(screen.getByText('Review diff')).toBeInTheDocument()
    })

    it('uses a permission heading and lock icon for pending approval', () => {
        renderTool(makeToolBlock('Write', {}, pendingPermission))

        const heading = screen.getByText('Permission required')
        expect(heading.parentElement?.parentElement?.querySelector('svg')).not.toBeNull()
    })

    it('preserves the existing dialog trigger', () => {
        renderTool(makeToolBlock('Read'))

        const trigger = screen.getByRole('button', { name: /read/i })
        expect(trigger).toHaveAttribute('aria-haspopup', 'dialog')
        expect(trigger).toHaveAttribute('aria-controls')
    })

    it('defines every new shell label in all supported locales', () => {
        const dictionaries: Array<Record<string, string>> = [en, viVN, zhCN]
        const keys = [
            'tool.details',
            'tool.openPlan',
            'tool.reviewDiff',
            'tool.permissionRequired'
        ]

        for (const dictionary of dictionaries) {
            for (const key of keys) {
                expect(dictionary[key]).toEqual(expect.any(String))
                expect(dictionary[key].trim().length).toBeGreaterThan(0)
            }
        }
    })
})
