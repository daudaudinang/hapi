import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

const arrayPatchPayload = {
    changes: [{
        path: '/workspace/docs/plan.md',
        kind: { type: 'update', move_path: null },
        diff: '@@ -1 +1 @@\n-old\n+new'
    }]
}

const pendingPermission = {
    id: 'permission-1',
    status: 'pending'
} satisfies ToolPermission

const api = {} as ApiClient

function makeToolBlock(
    name: string,
    input: unknown = {},
    permission?: ToolPermission,
    overrides: Partial<ToolCallBlock['tool']> = {}
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
            permission,
            ...overrides
        }
    }
}

function toolCardElement(
    block: ToolCallBlock,
    displayMode?: 'card' | 'activity-row'
) {
    return (
        <I18nProvider>
            <ToolCard
                api={api}
                sessionId="session-1"
                metadata={null}
                disabled={false}
                onDone={vi.fn()}
                block={block}
                displayMode={displayMode}
            />
        </I18nProvider>
    )
}

function renderTool(
    block: ToolCallBlock,
    options: {
        displayMode?: 'card' | 'activity-row'
        locale?: 'en' | 'vi-VN' | 'zh-CN'
    } = {}
) {
    localStorage.setItem('hapi-lang', options.locale ?? 'en')
    return render(toolCardElement(block, options.displayMode))
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
        ['CodexPatch', 'neutral'],
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

    it('localizes built-in tool titles through the selected dictionary', () => {
        const translations: Record<string, string> = {
            'tool.title.applyChanges': 'Áp dụng thay đổi',
            'tool.title.terminal': 'Dòng lệnh',
            'tool.title.reasoning': 'Lập luận',
            'tool.title.diff': 'Thay đổi',
            'tool.title.plan': 'Kế hoạch',
            'tool.title.readFile': 'Đọc tệp'
        }
        const t = (key: string) => translations[key] ?? key
        const presentationFor = (toolName: string) => getToolPresentation({
            toolName,
            input: {},
            result: null,
            childrenCount: 0,
            description: null,
            metadata: null,
            t
        }).title

        expect(presentationFor('CodexPatch')).toBe('Áp dụng thay đổi')
        expect(presentationFor('CodexBash')).toBe('Dòng lệnh')
        expect(presentationFor('CodexReasoning')).toBe('Lập luận')
        expect(presentationFor('CodexDiff')).toBe('Thay đổi')
        expect(presentationFor('update_plan')).toBe('Kế hoạch')
        expect(presentationFor('Read')).toBe('Đọc tệp')
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

    it('keeps a singleton neutral tool inside a subtle visible surface', () => {
        const { container } = renderTool(makeToolBlock('Read'))
        const card = container.querySelector('[data-tool-surface="neutral"]')

        expect(card).toHaveClass(
            'border-[var(--app-border)]',
            'bg-[var(--app-secondary-bg)]'
        )
        expect(screen.getByRole('button', { name: /read/i })).toHaveClass(
            'hover:bg-[var(--app-subtle-bg)]'
        )
    })

    it('renders activity-row mode without an individual card frame', () => {
        const { container } = renderTool(makeToolBlock('Read'), {
            displayMode: 'activity-row'
        })
        expect(container.querySelector('[data-tool-display="activity-row"]')).not.toBeNull()
        expect(screen.getByRole('button', { name: /read/i })).toHaveClass(
            'hover:bg-[var(--app-subtle-bg)]',
            'focus-visible:ring-2'
        )
        expect(screen.getByLabelText('Completed')).toBeVisible()
        expect(container.querySelector('time')).toHaveClass('hidden', 'sm:block')
    })

    it('truncates long activity detail instead of widening the row', () => {
        const command = 'x'.repeat(400)
        renderTool(makeToolBlock('CodexBash', { command }), {
            displayMode: 'activity-row'
        })

        expect(screen.getByText(command)).toHaveClass('min-w-0', 'truncate')
    })

    it('activity-row mode opens the unchanged details dialog', async () => {
        renderTool(makeToolBlock('Read', { file_path: '/tmp/example.ts' }), {
            displayMode: 'activity-row'
        })

        fireEvent.click(screen.getByRole('button', { name: /example\.ts/i }))

        expect(screen.getByRole('dialog')).toHaveTextContent('/tmp/example.ts')
    })

    it('shows explicit artifact actions', () => {
        const { rerender } = renderTool(makeToolBlock('update_plan', {
            plan: [{ step: 'Ship', status: 'pending' }]
        }))

        expect(screen.getByText('Open plan')).toBeInTheDocument()
        rerender(toolCardElement(makeToolBlock('CodexDiff', { unified_diff: oneFileDiff })))
        expect(screen.getByText('Review diff')).toBeInTheDocument()
    })

    it('treats Apply changes as neutral without Review diff or subtitle 0', () => {
        const { container } = renderTool(makeToolBlock(
            'CodexPatch',
            arrayPatchPayload,
            undefined,
            { description: '0' }
        ))

        expect(container.querySelector('[data-tool-surface="neutral"]')).not.toBeNull()
        expect(screen.queryByText('Review diff')).not.toBeInTheDocument()
        expect(screen.queryByText('0')).not.toBeInTheDocument()
        expect(screen.getByText('plan.md')).toBeInTheDocument()
    })

    it('opens affected files and result from an Apply changes row', () => {
        renderTool(makeToolBlock(
            'CodexPatch',
            arrayPatchPayload,
            undefined,
            { result: { success: true } }
        ), { displayMode: 'activity-row' })

        fireEvent.click(screen.getByRole('button', { name: /apply changes/i }))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('plan.md')
        expect(dialog).toHaveTextContent('Result')
    })

    it('uses the selected locale for activity title, time, state, dialog, and result copy', () => {
        renderTool(
            makeToolBlock('CodexPatch', arrayPatchPayload, undefined, {
                result: { success: true }
            }),
            { displayMode: 'activity-row', locale: 'vi-VN' }
        )

        const row = screen.getByRole('button', { name: /Áp dụng thay đổi/i })
        expect(row).toHaveTextContent(
            new Date(1000).toLocaleTimeString('vi-VN', {
                hour: 'numeric',
                minute: '2-digit'
            })
        )
        expect(screen.getByLabelText('Đã hoàn tất')).toBeVisible()

        fireEvent.click(row)

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Áp dụng thay đổi')
        expect(dialog).toHaveTextContent('Đầu vào')
        expect(dialog).toHaveTextContent('Kết quả')
        expect(dialog).toHaveTextContent('(không có đầu ra)')
        expect(dialog).toHaveTextContent('JSON thô')
        expect(screen.getByRole('button', { name: 'Đóng' })).toBeVisible()
    })

    it('localizes skill and agent detail/result labels without translating provider content', () => {
        const { rerender } = renderTool(
            makeToolBlock('Skill', {}, undefined, { result: null }),
            { locale: 'vi-VN' }
        )

        fireEvent.click(screen.getByRole('button', { name: /Kỹ năng/i }))
        expect(screen.getByRole('dialog')).toHaveTextContent('Kỹ năng không xác định')
        expect(screen.getByRole('dialog')).toHaveTextContent('Đã tải kỹ năng')

        fireEvent.click(screen.getByRole('button', { name: 'Đóng' }))
        rerender(toolCardElement(makeToolBlock('Agent', {
            description: 'Keep this provider text',
            subagent_type: 'reviewer',
            run_in_background: true
        }, undefined, {
            result: 'Async agent launched successfully. agentId: agent-1'
        })))

        fireEvent.click(screen.getByRole('button', { name: /Keep this provider text/i }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Keep this provider text')
        expect(dialog).toHaveTextContent('Loại: reviewer')
        expect(dialog).toHaveTextContent('Chạy nền')
        expect(dialog).toHaveTextContent('Đã khởi chạy agent')
    })

    it('localizes parsed command metadata labels', () => {
        renderTool(makeToolBlock('SomeUnknownTool', { command: 'pwd' }, undefined, {
            result: 'Exit code: 0\nWall time: 1.2 seconds\nOutput:\n/workspace'
        }), { locale: 'vi-VN' })

        fireEvent.click(screen.getByRole('button', { name: /SomeUnknownTool/i }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Mã thoát: 0')
        expect(dialog).toHaveTextContent('Thời gian chạy: 1.2 seconds')
        expect(dialog).toHaveTextContent('/workspace')
    })

    it('localizes structured Codex command metadata', () => {
        renderTool(makeToolBlock('CodexBash', { command: 'pwd' }, undefined, {
            result: {
                stdout: '/workspace\n',
                exit_code: 0,
                status: 'completed'
            }
        }), { locale: 'vi-VN' })

        fireEvent.click(screen.getByRole('button', { name: /Dòng lệnh/i }))
        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('Mã thoát: 0')
        expect(dialog).not.toHaveTextContent('exit 0')
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
            'tool.permissionRequired',
            'tool.backgroundActions',
            'tool.patchDetailsUnavailable',
            'tool.title.applyChanges',
            'tool.title.terminal',
            'tool.title.reasoning',
            'tool.title.diff',
            'tool.title.plan',
            'tool.title.readFile',
            'tool.status.pending',
            'tool.status.running',
            'tool.status.completed',
            'tool.status.error',
            'tool.result.waitingPermission',
            'tool.result.running',
            'tool.result.noOutput',
            'tool.result.done',
            'tool.result.rawJson',
            'tool.result.agentFailed',
            'tool.result.agentLaunched',
            'tool.result.skillLoaded',
            'tool.result.skillLoadFailed',
            'tool.result.skillNamedLoaded',
            'tool.result.exitCode',
            'tool.result.wallTime',
            'tool.detail.unknownSkill',
            'tool.detail.agentType',
            'tool.detail.background'
        ]

        for (const dictionary of dictionaries) {
            for (const key of keys) {
                expect(dictionary[key]).toEqual(expect.any(String))
                expect(dictionary[key].trim().length).toBeGreaterThan(0)
            }
        }
    })
})
