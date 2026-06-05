import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamChatRightPanel } from './TeamChatRightPanel'

afterEach(() => {
    cleanup()
})

it('renders needs attention items from blocked reports and pending mentions', () => {
    render(<TeamChatRightPanel
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 1 }]}
        messages={[{ id: 'm1', teamChatId: 'team-1', seq: 1, authorParticipantId: 'p1', text: 'Blocked on schema', reportType: 'blocked', mentions: [], files: [], createdAt: 2 }]}
        mentionRequests={[{ id: 'r1', teamChatId: 'team-1', sourceMessageId: 'm0', targetSessionId: 's1', status: 'pending', createdAt: 1 }]}
    />)

    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('Waiting for response')).toBeInTheDocument()
})

it('lets the user add an existing session from a grouped status tree', async () => {
    const onAddSession = vi.fn()
    const onCreateSessionMember = vi.fn()
    render(<TeamChatRightPanel
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 1 }]}
        availableSessions={[
            { id: 's1', active: true, thinking: false, activeAt: 1, updatedAt: 1, metadata: { path: '/repo/hapi', machineId: 'machine-a', name: 'Backend' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null },
            { id: 's2', active: true, thinking: true, activeAt: 2, updatedAt: 4, metadata: { path: '/repo/hapi', machineId: 'machine-a', name: 'Frontend polish' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null },
            { id: 's3', active: false, thinking: false, activeAt: 3, updatedAt: 3, metadata: { path: '/repo/hapi', machineId: 'machine-a', name: 'Old review' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null },
            { id: 's4', active: true, thinking: false, activeAt: 4, updatedAt: 2, metadata: { path: '/repo/hub', machineId: 'machine-a', name: 'Hub API' }, todoProgress: null, pendingRequestsCount: 1, model: null, effort: null }
        ]}
        onAddSession={onAddSession}
        onCreateSessionMember={onCreateSessionMember}
    />)

    fireEvent.click(screen.getByRole('button', { name: /Add member/i }))

    expect(screen.getByRole('dialog', { name: /Add member/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Existing session/i })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /New session/i })).toBeInTheDocument()

    const tree = screen.getByRole('tree', { name: /Available sessions/i })
    expect(within(tree).getByRole('treeitem', { name: /hapi/i })).toBeInTheDocument()
    expect(within(tree).getByRole('treeitem', { name: /hub/i })).toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: /Frontend polish.*Working/i })).toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: /Hub API.*Needs input/i })).toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: /Old review.*Idle/i })).toBeInTheDocument()

    fireEvent.click(within(tree).getByRole('button', { name: /Frontend polish.*Working/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /Team alias/i }), { target: { value: 'UI' } })
    fireEvent.click(screen.getByRole('button', { name: /Add to Team/i }))

    expect(onAddSession).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }), 'UI')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add member/i })).not.toBeInTheDocument())
})

it('lets the user create a new session member with an alias and optional initial task', async () => {
    const onCreateSessionMember = vi.fn()
    render(<TeamChatRightPanel
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'user', displayName: 'You', role: 'general', color: '#34d399', joinedAt: 1 }]}
        machines={[
            { id: 'machine-a', active: true, metadata: { host: 'local', platform: 'linux', happyCliVersion: '1.0.0', displayName: 'Local' } }
        ]}
        defaultMachineId="machine-a"
        defaultProjectPath="/repo/hapi"
        onCreateSessionMember={onCreateSessionMember}
    />)

    fireEvent.click(screen.getByRole('button', { name: /Add member/i }))
    fireEvent.click(screen.getByRole('tab', { name: /New session/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /Team alias/i }), { target: { value: 'Backend API' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Project path/i }), { target: { value: '/repo/hapi' } })
    fireEvent.change(screen.getByRole('textbox', { name: /Initial task/i }), { target: { value: 'Review the Team Chat API.' } })
    fireEvent.click(screen.getByRole('button', { name: /Create session & add to Team/i }))

    expect(onCreateSessionMember).toHaveBeenCalledWith({
        alias: 'Backend API',
        machineId: 'machine-a',
        projectPath: '/repo/hapi',
        initialTask: 'Review the Team Chat API.'
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Add member/i })).not.toBeInTheDocument())
})

it('prevents duplicate aliases in the Team Chat picker', () => {
    const onAddSession = vi.fn()
    render(<TeamChatRightPanel
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 1 }]}
        availableSessions={[
            { id: 's2', active: true, thinking: false, activeAt: 1, updatedAt: 2, metadata: { path: '/repo/hapi', name: 'Frontend polish' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null }
        ]}
        onAddSession={onAddSession}
    />)

    fireEvent.click(screen.getByRole('button', { name: /Add member/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /Team alias/i }), { target: { value: 'backend' } })

    expect(screen.getByText('Alias already used in this Team Chat.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add to Team/i })).toBeDisabled()
})

it('shows live session status in members and opens the direct chat for a member', () => {
    const onOpenSession = vi.fn()
    render(<TeamChatRightPanel
        participants={[{ id: 'p2', teamChatId: 'team-1', type: 'session', sessionId: 's2', displayName: 'UI', role: 'frontend', color: '#a78bfa', joinedAt: 1 }]}
        availableSessions={[
            {
                id: 's2',
                active: true,
                thinking: true,
                activeAt: 2,
                updatedAt: 4,
                metadata: { path: '/repo/hapi', machineId: 'machine-a', name: 'Frontend polish' },
                todoProgress: { completed: 2, total: 5 },
                pendingRequestsCount: 0,
                model: 'gpt-5.4',
                effort: 'high'
            }
        ]}
        onOpenSession={onOpenSession}
    />)

    const memberButton = screen.getByRole('button', { name: /Open @UI direct chat.*Working/i })
    expect(memberButton).toHaveTextContent('@UI')
    expect(memberButton).toHaveTextContent('Frontend polish')
    expect(memberButton).toHaveTextContent('Working')
    expect(memberButton).toHaveTextContent('gpt-5.4')
    expect(memberButton).toHaveTextContent('2/5 todo')

    fireEvent.click(memberButton)

    expect(onOpenSession).toHaveBeenCalledWith(expect.objectContaining({ id: 'p2', sessionId: 's2', displayName: 'UI' }))
})
