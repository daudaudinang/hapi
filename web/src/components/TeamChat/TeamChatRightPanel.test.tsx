import { fireEvent, render, screen } from '@testing-library/react'
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

it('lets the user add an existing session as a Team Chat member', () => {
    const onAddSession = vi.fn()
    render(<TeamChatRightPanel
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 1 }]}
        availableSessions={[
            { id: 's1', active: true, thinking: false, activeAt: 1, updatedAt: 1, metadata: { path: '/repo', name: 'Backend' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null },
            { id: 's2', active: true, thinking: false, activeAt: 1, updatedAt: 2, metadata: { path: '/repo', name: 'Frontend polish' }, todoProgress: null, pendingRequestsCount: 0, model: null, effort: null }
        ]}
        onAddSession={onAddSession}
    />)

    fireEvent.click(screen.getByRole('button', { name: /Add member/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /Session to add/i }), { target: { value: 's2' } })
    fireEvent.click(screen.getByRole('button', { name: /Add to Team/i }))

    expect(onAddSession).toHaveBeenCalledWith(expect.objectContaining({ id: 's2' }))
})
