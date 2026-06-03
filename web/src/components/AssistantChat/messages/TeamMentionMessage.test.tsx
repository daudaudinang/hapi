import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamMentionMessage } from './TeamMentionMessage'

it('renders Team mention actions', () => {
    const onReplyToTeam = vi.fn()
    render(<TeamMentionMessage
        block={{
            kind: 'team-mention',
            id: 'msg-1',
            localId: null,
            requestId: 'req-1',
            teamChatId: 'team-1',
            sourceMessageId: 'team-msg-1',
            text: 'Please confirm API behavior',
            status: 'delivered',
            createdAt: 1
        }}
        onOpenTeamChat={vi.fn()}
        onReplyToTeam={onReplyToTeam}
        onPostUpdate={vi.fn()}
        onViewOriginal={vi.fn()}
        onNoAction={vi.fn()}
    />)

    expect(screen.getByText('Team mention')).toBeInTheDocument()
    expect(screen.getByText('Please confirm API behavior')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Reply to Team/i }))
    expect(onReplyToTeam).toHaveBeenCalled()
})
