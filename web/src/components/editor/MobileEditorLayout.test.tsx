import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { EditorTab } from '@/hooks/useEditorState'
import type { SessionSummary } from '@/types/api'
import { MobileEditorLayout } from './MobileEditorLayout'

vi.mock('./EditorFileTree', () => ({
    EditorFileTree: (props: {
        onOpenFile: (path: string) => void
        onContextMenu: (path: string, x: number, y: number, items: Array<{ path: string; type: 'file' | 'directory' }>) => void
    }) => (
        <div data-testid="mobile-file-tree">
            <button type="button" onClick={() => props.onOpenFile('/repo/src/App.tsx')}>Open App</button>
            <button type="button" onClick={() => props.onContextMenu('/repo/src/App.tsx', 10, 20, [{ path: '/repo/src/App.tsx', type: 'file' }])}>File actions</button>
        </div>
    )
}))

vi.mock('./EditorTabs', () => ({
    EditorTabs: (props: {
        mobileMode?: boolean
        tabs: EditorTab[]
        onNewFile: () => void
        onAddSelectionToChat?: (filePath: string, startLine: number, endLine: number, content: string) => void
    }) => (
        <div data-testid="mobile-editor-tabs">
            mobile tabs: {props.mobileMode ? 'yes' : 'no'} {props.tabs.map((tab) => tab.label).join(',')}
            <input aria-label="Mock editor buffer" defaultValue="" />
            <button type="button" onClick={props.onNewFile}>New file from tabs</button>
            <button type="button" onClick={() => props.onAddSelectionToChat?.('/repo/src/App.tsx', 1, 2, 'const app = true')}>Add selection</button>
        </div>
    )
}))

vi.mock('./EditorChatPanel', () => ({
    EditorChatPanel: (props: { pendingDraftText?: string; sessionId?: string | null }) => (
        <div data-testid="mobile-chat-panel">session: {props.sessionId ?? ''} draft: {props.pendingDraftText ?? ''}</div>
    )
}))

vi.mock('./EditorTerminal', () => ({
    EditorTerminal: (props: { mobileMode?: boolean; isCollapsed: boolean; onOpenTerminal: () => void; activeTabId?: string | null }) => (
        <div data-testid="mobile-terminal">
            mobile terminal: {props.mobileMode ? 'yes' : 'no'} collapsed: {props.isCollapsed ? 'yes' : 'no'} active: {props.activeTabId ?? ''}
            {!props.mobileMode ? <button type="button" onClick={props.onOpenTerminal}>Open terminal</button> : null}
        </div>
    )
}))

function makeSession(id: string, overrides: Partial<SessionSummary> = {}): SessionSummary {
    return {
        id,
        active: true,
        thinking: false,
        activeAt: Date.now(),
        updatedAt: Date.now(),
        metadata: { path: '/repo', machineId: 'machine-1', name: id },
        todoProgress: null,
        pendingRequestsCount: 0,
        model: null,
        effort: null,
        ...overrides,
    }
}

function baseProps() {
    const fileTabs: EditorTab[] = [{ id: 'file-1', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx' }]
    const terminalTabs: EditorTab[] = [{ id: 'term-1', type: 'terminal', label: 'Terminal: bash', shell: 'bash' }]
    return {
        api: {} as ApiClient,
        machineId: 'machine-1',
        projectPath: '/repo',
        fileTabs,
        terminalTabs,
        activeFileTab: fileTabs[0],
        activeTerminalTab: terminalTabs[0],
        activeSessionId: 'session-1',
        projectSessions: [makeSession('session-1'), makeSession('session-2'), makeSession('archived-session', { active: false })],
        pendingDraftText: undefined as string | undefined,
        newFileTargetPath: null as string | null,
        newSessionError: null as string | null,
        onBackToAgents: vi.fn(),
        onBrowseProject: vi.fn(),
        onOpenFile: vi.fn(),
        onShowContextMenu: vi.fn(),
        onCreateFile: vi.fn(async () => ({ success: true as const })),
        onCancelNewFile: vi.fn(),
        onNewFileFromTabs: vi.fn(),
        onDirtyChange: vi.fn(),
        onAddSelectionToChat: vi.fn(),
        onSelectFileTab: vi.fn(),
        onCloseTab: vi.fn(),
        onOpenNewSessionModal: vi.fn(),
        onSelectSession: vi.fn(),
        onArchiveSession: vi.fn(async () => undefined),
        onDeleteSession: vi.fn(async () => undefined),
        onSessionResolved: vi.fn(),
        onExpandDraft: (text: string) => text,
        onDraftConsumed: vi.fn(),
        onOpenTerminal: vi.fn(),
        onSelectTerminalTab: vi.fn(),
        onCloseTerminalTab: vi.fn(),
        onAddTerminalToChat: vi.fn(),
        onRegisterTerminalClose: vi.fn(),
    }
}

describe('MobileEditorLayout', () => {
    afterEach(() => cleanup())

    it('renders the Files view by default and navigates back to agent mode', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        expect(screen.getByTestId('mobile-file-tree')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Back to Agent Mode' }))

        expect(props.onBackToAgents).toHaveBeenCalledTimes(1)
    })

    it('switches views from the bottom navigation', () => {
        render(<MobileEditorLayout {...baseProps()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
        expect(screen.getByTestId('mobile-editor-tabs')).toHaveTextContent('mobile tabs: yes')

        fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
        expect(screen.getByTestId('mobile-chat-panel')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
        expect(screen.getByTestId('mobile-terminal')).toHaveTextContent('mobile terminal: yes collapsed: no')
    })

    it('opens a file and switches to the Editor view', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByText('Open App'))

        expect(props.onOpenFile).toHaveBeenCalledWith('/repo/src/App.tsx')
        expect(screen.getByTestId('mobile-editor-tabs')).toBeInTheDocument()
    })

    it('preserves the editor buffer when switching away and back from the bottom navigation', () => {
        render(<MobileEditorLayout {...baseProps()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
        fireEvent.change(screen.getByLabelText('Mock editor buffer'), { target: { value: 'unsaved draft' } })

        fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
        expect(screen.getByTestId('mobile-chat-panel')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
        expect(screen.getByLabelText('Mock editor buffer')).toHaveValue('unsaved draft')
    })

    it('opens terminal and switches to the Terminal view', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))

        expect(props.onOpenTerminal).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('mobile-terminal')).toBeInTheDocument()
    })

    it('creates a new file from an Editor mobile bottom sheet instead of the hidden file tree inline flow', async () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
        fireEvent.click(screen.getByRole('button', { name: 'New file' }))

        expect(screen.getByRole('dialog', { name: 'New file' })).toBeInTheDocument()
        expect(screen.getByText('/repo/src')).toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('File name'), { target: { value: 'New.ts' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create' }))

        await waitFor(() => {
            expect(props.onCreateFile).toHaveBeenCalledWith('/repo/src', 'New.ts')
        })
        expect(props.onNewFileFromTabs).not.toHaveBeenCalled()
        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'New file' })).not.toBeInTheDocument()
        })
    })

    it('wraps add selection to chat with a compact notice and open chat action', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Editor' }))
        fireEvent.click(screen.getByText('Add selection'))

        expect(props.onAddSelectionToChat).toHaveBeenCalledWith('/repo/src/App.tsx', 1, 2, 'const app = true')
        expect(screen.getByText('Selection added to chat draft')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Open chat' }))
        expect(screen.getByTestId('mobile-chat-panel')).toBeInTheDocument()
    })

    it('highlights the active bottom navigation tab with purple text', () => {
        render(<MobileEditorLayout {...baseProps()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Chat' }))

        expect(screen.getByRole('button', { name: 'Chat' })).toHaveClass('text-[#818cf8]')
    })

    it('shows session tabs in Chat and switches the selected session', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
        fireEvent.click(screen.getByRole('button', { name: 'Select session session-2' }))

        expect(props.onSelectSession).toHaveBeenCalledWith('session-2')
    })

    it('archives chat sessions through a custom confirmation modal', async () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
        fireEvent.click(screen.getByRole('button', { name: 'Session actions session-1' }))
        fireEvent.click(screen.getByRole('button', { name: 'Archive session' }))

        expect(screen.getByText('Archive session?')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Archive' }))

        expect(props.onArchiveSession).toHaveBeenCalledWith('session-1')
    })

    it('deletes archived chat sessions through a custom confirmation modal', async () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Chat' }))
        fireEvent.click(screen.getByRole('button', { name: 'Session actions archived-session' }))
        fireEvent.click(screen.getByRole('button', { name: 'Delete session' }))

        expect(screen.getByText('Delete archived session?')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

        expect(props.onDeleteSession).toHaveBeenCalledWith('archived-session')
    })

    it('uses session tabs in Terminal to choose the terminal scope before opening a terminal', () => {
        const props = baseProps()
        render(<MobileEditorLayout {...props} />)

        fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Use session session-2 for terminal' }))
        fireEvent.click(screen.getByRole('button', { name: 'Open terminal' }))

        expect(props.onOpenTerminal).toHaveBeenCalledWith('session-2')
    })

    it('keeps the Terminal header plus as the only open terminal action in mobile', () => {
        render(<MobileEditorLayout {...baseProps()} />)

        fireEvent.click(screen.getByRole('button', { name: 'Terminal' }))

        expect(screen.queryByRole('button', { name: 'New chat session' })).not.toBeInTheDocument()
        expect(screen.getAllByRole('button', { name: 'Open terminal' })).toHaveLength(1)
    })

})
