import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { EditorTab } from '@/hooks/useEditorState'
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
    EditorChatPanel: (props: { pendingDraftText?: string }) => (
        <div data-testid="mobile-chat-panel">draft: {props.pendingDraftText ?? ''}</div>
    )
}))

vi.mock('./EditorTerminal', () => ({
    EditorTerminal: (props: { mobileMode?: boolean; isCollapsed: boolean; onOpenTerminal: () => void }) => (
        <div data-testid="mobile-terminal">
            mobile terminal: {props.mobileMode ? 'yes' : 'no'} collapsed: {props.isCollapsed ? 'yes' : 'no'}
            <button type="button" onClick={props.onOpenTerminal}>Open terminal</button>
        </div>
    )
}))

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
        fireEvent.click(screen.getByText('Open terminal'))

        expect(props.onOpenTerminal).toHaveBeenCalledTimes(1)
        expect(screen.getByTestId('mobile-terminal')).toBeInTheDocument()
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
})
