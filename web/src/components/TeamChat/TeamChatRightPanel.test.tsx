import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
