import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TerminalPage from './terminal'

const sharedTabsMock = vi.fn()
const legacyCloseMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
    useParams: () => ({ sessionId: 'session-1' })
}))

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({ api: null, token: 'test-token', baseUrl: 'http://localhost:3000' })
}))

vi.mock('@/hooks/useAppGoBack', () => ({
    useAppGoBack: () => vi.fn()
}))

vi.mock('@/hooks/queries/useSession', () => ({
    useSession: () => ({
        session: { id: 'session-1', active: true, metadata: { path: '/tmp/project' } }
    })
}))

vi.mock('@/hooks/useTerminalSocket', () => ({
    useTerminalSocket: () => ({ close: legacyCloseMock })
}))

vi.mock('@/components/Terminal/SessionTerminalTabs', () => ({
    SessionTerminalTabs: (props: unknown) => {
        sharedTabsMock(props)
        return <div data-testid="session-terminal-tabs" />
    }
}))

describe('TerminalPage session terminal tabs', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('renders shared session terminal tabs with session state', () => {
        render(<TerminalPage />)

        expect(screen.getByTestId('session-terminal-tabs')).toBeInTheDocument()
        expect(sharedTabsMock).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: 'session-1',
            title: 'Terminal',
            subtitle: '/tmp/project',
            active: true,
            terminalSupported: true
        }))
    })

    it('unmounts through shared tabs without legacy close', () => {
        const rendered = render(<TerminalPage />)

        rendered.unmount()

        expect(legacyCloseMock).not.toHaveBeenCalled()
    })
})
