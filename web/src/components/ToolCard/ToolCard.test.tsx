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
    CodeBlock: ({ code, collapseLongContent }: { code: string; collapseLongContent?: boolean }) => (
        <pre data-collapse-long-content={String(collapseLongContent === true)}>{code}</pre>
    )
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

const fourFilePatchPayload = {
    changes: ['a.ts', 'b.ts', 'c.ts', 'd.ts'].map((path) => ({
        path: `/workspace/src/${path}`,
        kind: { type: 'update', move_path: null },
        diff: '@@ -1 +1 @@\n-old\n+new'
    }))
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

function toolCardElement(block: ToolCallBlock, displayMode: 'card' | 'group-row' = 'card') {
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
        locale?: 'en' | 'vi-VN' | 'zh-CN'
        displayMode?: 'card' | 'group-row'
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

    it('opens affected files and result from an Apply changes card', () => {
        renderTool(makeToolBlock(
            'CodexPatch',
            arrayPatchPayload,
            undefined,
            { result: { success: true } }
        ))

        fireEvent.click(screen.getByRole('button', { name: /apply changes/i }))

        const dialog = screen.getByRole('dialog')
        expect(dialog).toHaveTextContent('plan.md')
        expect(dialog).toHaveTextContent('Result')
    })

    it('uses the selected locale for card title, dialog, and result copy', () => {
        renderTool(
            makeToolBlock('CodexPatch', arrayPatchPayload, undefined, {
                result: { success: true }
            }),
            { locale: 'vi-VN' }
        )

        fireEvent.click(screen.getByRole('button', { name: /Áp dụng thay đổi/i }))

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

    it('keeps no-output rows compact but preserves details dialog', () => {
        const block = makeToolBlock('Read', { file_path: '/tmp/example.ts' })
        const { container } = renderTool(block, { displayMode: 'group-row' })

        expect(screen.queryByRole('button', { name: /show output/i })).not.toBeInTheDocument()
        expect(container.querySelector('[data-tool-display="group-row"]')).toHaveAttribute('data-tool-block-id', block.id)
        fireEvent.click(screen.getByRole('button', { name: /example\.ts/i }))
        expect(screen.getByRole('dialog')).toHaveTextContent('/tmp/example.ts')
    })

    it('opens terminal output at full width with a 300px cap without internal truncation', () => {
        const { container } = renderTool(makeToolBlock('Bash', { command: 'printf ready' }, undefined, {
            result: { stdout: 'ready\n', stderr: '', exitCode: 0 }
        }), { displayMode: 'group-row' })

        fireEvent.click(screen.getByRole('button', { name: /show output/i }))
        const output = container.querySelector('[data-tool-inline-output]')
        expect(output).toHaveClass('w-full', 'max-h-[300px]', 'overflow-auto')
        expect(output?.querySelector('pre')).toHaveAttribute('data-collapse-long-content', 'false')
    })

    it('shows at most three Apply Changes files inline and every file in its dialog without an empty accordion', () => {
        renderTool(makeToolBlock('CodexPatch', fourFilePatchPayload), { displayMode: 'group-row' })

        expect(screen.getByText('a.ts')).toBeInTheDocument()
        expect(screen.getByText('b.ts')).toBeInTheDocument()
        expect(screen.getByText('c.ts')).toBeInTheDocument()
        expect(screen.queryByText('d.ts')).not.toBeInTheDocument()
        expect(screen.getByText('+1 more files')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /show output/i })).toBeNull()

        fireEvent.click(screen.getByRole('button', { name: /apply changes/i }))
        expect(screen.getByRole('dialog')).toHaveTextContent('d.ts')
    })

    it('expands valid Diff input and keeps malformed Diff dialog-only', () => {
        const valid = renderTool(
            makeToolBlock('CodexDiff', { unified_diff: oneFileDiff }),
            { displayMode: 'group-row' }
        )
        const outputButton = screen.getByRole('button', { name: /show output/i })
        expect(outputButton).toHaveAttribute('aria-expanded', 'false')
        expect(outputButton).toHaveAttribute('aria-controls')
        expect(valid.container.querySelector('button button')).toBeNull()
        fireEvent.click(outputButton)
        expect(screen.getByRole('region', { name: /diff output/i })).toHaveTextContent('old')
        valid.unmount()

        const malformed = renderTool(
            makeToolBlock('CodexDiff', { unified_diff: 'not a diff' }),
            { displayMode: 'group-row' }
        )
        expect(screen.queryByRole('button', { name: /show output/i })).toBeNull()
        expect(malformed.container.querySelector('button button')).toBeNull()
        fireEvent.click(screen.getByRole('button', { name: /diff/i }))
        expect(screen.getByRole('dialog')).toHaveTextContent('not a diff')
    })

    it('lets the group output region scroll long Diff lines without clipping or wrapping', () => {
        const longLine = 'x'.repeat(400)
        const longLineDiff = [
            'diff --git a/a.ts b/a.ts',
            '--- a/a.ts',
            '+++ b/a.ts',
            '@@ -1 +1 @@',
            '-old',
            `+${longLine}`
        ].join('\n')
        const { container } = renderTool(
            makeToolBlock('CodexDiff', { unified_diff: longLineDiff }),
            { displayMode: 'group-row' }
        )

        fireEvent.click(screen.getByRole('button', { name: /show output/i }))

        const output = container.querySelector('[data-tool-inline-output]')
        const line = screen.getByText(`+ ${longLine}`)
        const diffRoot = line.closest('.rounded-md')
        expect(output).toHaveClass('overflow-auto')
        expect(diffRoot).toHaveClass('overflow-visible')
        expect(diffRoot).not.toHaveClass('overflow-hidden')
        expect(line).toHaveClass('whitespace-pre')
        expect(line).not.toHaveClass('whitespace-pre-wrap')
    })

    it('adds lossless block ids without changing the standalone card surface', () => {
        const block = makeToolBlock('Read')
        const { container } = renderTool(block)

        expect(container.querySelector('[data-tool-surface="neutral"]')).toHaveAttribute('data-tool-block-id', block.id)
        expect(container.querySelector('[data-tool-display="group-row"]')).toBeNull()
    })

    it('defines every new shell label in all supported locales', () => {
        const dictionaries: Array<Record<string, string>> = [en, viVN, zhCN]
        const keys = [
            'tool.details',
            'tool.openPlan',
            'tool.reviewDiff',
            'tool.permissionRequired',
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
            'tool.detail.background',
            'tool.group.showOutput',
            'tool.group.hideOutput',
            'tool.group.outputRegion'
        ]

        for (const dictionary of dictionaries) {
            for (const key of keys) {
                expect(dictionary[key]).toEqual(expect.any(String))
                expect(dictionary[key].trim().length).toBeGreaterThan(0)
            }
        }
    })
})
