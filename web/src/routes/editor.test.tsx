import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import EditorPage from './editor'

const editorLayoutMock = vi.fn()
const loadPersistedEditorStateMock = vi.fn()
const api = {} as ApiClient

vi.mock('@tanstack/react-router', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@tanstack/react-router')>()
    return {
        ...actual,
        useSearch: () => ({ machine: 'machine-1', project: '/repo' })
    }
})

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({ api })
}))

vi.mock('@/lib/editor-persistence', () => ({
    loadPersistedEditorState: () => loadPersistedEditorStateMock()
}))


vi.mock('@/routes/sessions/terminal', () => ({
    default: () => <div />
}))

vi.mock('@/components/Terminal/TerminalView', () => ({
    TerminalView: () => <div />
}))

vi.mock('@/components/editor/EditorLayout', () => ({
    EditorLayout: (props: unknown) => {
        editorLayoutMock(props)
        return <div data-testid="editor-layout" />
    }
}))

describe('EditorPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    afterEach(() => {
        cleanup()
    })

    it('passes search params to EditorLayout', () => {
        render(<EditorPage />)

        expect(editorLayoutMock).toHaveBeenCalledWith({
            api,
            initialMachineId: 'machine-1',
            initialProjectPath: '/repo',
            initialState: undefined
        })
    })

    it('reuses persisted editor state when opening the same project from a session', () => {
        const persistedState = {
            machineId: 'machine-1',
            projectPath: '/repo',
            tabs: [{ id: 'term-1', type: 'terminal', label: 'Terminal: bash', machineId: 'machine-1', cwd: '/repo' }],
            activeTabId: 'term-1',
            activeSessionId: 'session-1',
            isTerminalCollapsed: false
        }
        loadPersistedEditorStateMock.mockReturnValue(persistedState)

        render(<EditorPage />)

        expect(editorLayoutMock).toHaveBeenCalledWith({
            api,
            initialMachineId: 'machine-1',
            initialProjectPath: '/repo',
            initialState: persistedState
        })
    })

    it('is registered in the router', async () => {
        const { createAppRouter } = await import('@/router')
        const router = createAppRouter() as unknown as { routesByPath: Record<string, unknown> }

        expect(router.routesByPath['/editor']).toBeTruthy()
    })
})
