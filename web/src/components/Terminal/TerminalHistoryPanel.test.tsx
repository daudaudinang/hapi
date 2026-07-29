import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TerminalHistoryPanel } from './TerminalHistoryPanel'
import type { TerminalHistoryState } from './useTerminalHistory'

vi.mock('@/lib/use-translation', () => ({
    useTranslation: () => ({
        locale: 'en',
        t: (key: string, values?: Record<string, unknown>) => ({
            'terminal.history.title': 'History',
            'terminal.history.insertOnly': 'Insert only · does not run',
            'terminal.history.count': `${values?.count ?? 0} commands`,
            'terminal.history.searchPlaceholder': 'Search history',
            'terminal.history.refresh': 'Refresh history',
            'terminal.history.close': 'Close history',
            'terminal.history.loading': 'Loading history…',
            'terminal.history.empty': 'No commands yet.',
            'terminal.history.noMatches': 'No matching commands.',
            'terminal.history.unsupported': 'This shell does not support live history.',
            'terminal.history.cliOutdated': 'Restart this session with the latest Hapi CLI.',
            'terminal.history.notReady': 'History is not ready yet.',
            'terminal.history.error': 'Could not read history.',
            'terminal.history.retry': 'Retry',
            'terminal.history.insert': `Insert ${values?.command ?? ''}`,
            'terminal.history.inserted': 'Inserted · not executed',
            'terminal.history.insertFailed': 'Could not insert command.',
        }[key] ?? key),
    }),
}))

afterEach(() => cleanup())

const readyState: TerminalHistoryState = {
    status: 'ready',
    entries: [
        { index: 3, command: 'git status' },
        { index: 2, command: 'pwd' },
        { index: 1, command: 'git log --oneline' },
    ],
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof TerminalHistoryPanel>> = {}) {
    const props: React.ComponentProps<typeof TerminalHistoryPanel> = {
        state: readyState,
        disabled: false,
        onRefresh: vi.fn(),
        onClose: vi.fn(),
        onInsert: vi.fn(() => true),
        ...overrides,
    }
    render(<TerminalHistoryPanel {...props} />)
    return props
}

describe('TerminalHistoryPanel', () => {
    it('filters commands locally without requesting another snapshot', () => {
        const props = renderPanel()

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search history' }), {
            target: { value: 'git' },
        })

        expect(screen.getByRole('button', { name: 'Insert git status' })).toBeVisible()
        expect(screen.getByRole('button', { name: 'Insert git log --oneline' })).toBeVisible()
        expect(screen.queryByRole('button', { name: 'Insert pwd' })).not.toBeInTheDocument()
        expect(props.onRefresh).not.toHaveBeenCalled()
    })

    it('inserts the exact command without Enter and closes only on success', () => {
        const props = renderPanel()

        fireEvent.click(screen.getByRole('button', { name: 'Insert git status' }))

        expect(props.onInsert).toHaveBeenCalledWith('git status')
        expect(props.onInsert).not.toHaveBeenCalledWith('git status\r')
        expect(props.onClose).toHaveBeenCalledOnce()
        expect(screen.getByRole('status')).toHaveTextContent('Inserted · not executed')
    })

    it('keeps the panel open and reports an insert failure', () => {
        const props = renderPanel({ onInsert: vi.fn(() => false) })

        fireEvent.click(screen.getByRole('button', { name: 'Insert pwd' }))

        expect(props.onClose).not.toHaveBeenCalled()
        expect(screen.getByRole('alert')).toHaveTextContent('Could not insert command.')
    })

    it.each([
        [{ status: 'idle', entries: [] }, 'Loading history…'],
        [{ status: 'loading', entries: [] }, 'Loading history…'],
        [{ status: 'ready', entries: [] }, 'No commands yet.'],
        [{ status: 'unsupported', entries: [], shell: 'zsh' }, 'This shell does not support live history.'],
        [{ status: 'error', entries: [], message: 'cli_outdated' }, 'Restart this session with the latest Hapi CLI.'],
        [{ status: 'error', entries: [], message: 'not_ready' }, 'History is not ready yet.'],
        [{ status: 'error', entries: [], message: 'read_failed' }, 'Could not read history.'],
    ] as Array<[TerminalHistoryState, string]>)('renders the %s state', (state, copy) => {
        renderPanel({ state })
        expect(screen.getByText(copy)).toBeVisible()
    })

    it('does not offer a retry that cannot upgrade an outdated session', () => {
        renderPanel({
            state: { status: 'error', entries: [], message: 'cli_outdated' }
        })

        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    })

    it('refreshes, closes, and shows a dedicated empty-search state', () => {
        const props = renderPanel()

        fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }))
        expect(props.onRefresh).toHaveBeenCalledOnce()

        fireEvent.change(screen.getByRole('searchbox', { name: 'Search history' }), {
            target: { value: 'missing' },
        })
        expect(screen.getByText('No matching commands.')).toBeVisible()

        fireEvent.click(screen.getByRole('button', { name: 'Close history' }))
        expect(props.onClose).toHaveBeenCalledOnce()
    })
})
