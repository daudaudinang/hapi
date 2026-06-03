import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamChatRightPanel } from './TeamChatRightPanel'

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

it('lets the user add an existing session from a grouped status tree', () => {
    const onAddSession = vi.fn()
    render(<TeamChatRightPanel
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 1 }]}
        availableSessions={[
            { id: 's1', active: true, thinking: false, activeAt: 1, updatedAt: 1, metadata: { path: '/repo/hapi', machineId: 'machine-a', name: 'Backend' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null },
            { id: 's2', active: true, thinking: true, activeAt: 2, updatedAt: 4, metadata: { path: '/repo/hapi', machineId: 'machine-a', name: 'Frontend polish' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null },
            { id: 's3', active: false, thinking: false, activeAt: 3, updatedAt: 3, metadata: { path: '/repo/hapi', machineId: 'machine-a', name: 'Old review' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null },
            { id: 's4', active: true, thinking: false, activeAt: 4, updatedAt: 2, metadata: { path: '/repo/hub', machineId: 'machine-a', name: 'Hub API' }, todoProgress: null, pendingRequestsCount: 1, model: null, effort: null }
        ]}
        onAddSession={onAddSession}
    />)

    fireEvent.click(screen.getByRole('button', { name: /Add member/i }))

    const tree = screen.getByRole('tree', { name: /Available sessions/i })
    expect(within(tree).getByRole('treeitem', { name: /hapi/i })).toBeInTheDocument()
    expect(within(tree).getByRole('treeitem', { name: /hub/i })).toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: /Frontend polish.*Working/i })).toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: /Hub API.*Needs input/i })).toBeInTheDocument()
    expect(within(tree).getByRole('button', { name: /Old review.*Idle/i })).toBeInTheDocument()

    fireEvent.click(within(tree).getByRole('button', { name: /Frontend polish.*Working/i }))
    fireEvent.click(screen.getByRole('button', { name: /Add to Team/i }))

    expect(onAddSession).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }))
})
