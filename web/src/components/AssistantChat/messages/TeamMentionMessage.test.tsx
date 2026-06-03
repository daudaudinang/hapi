import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

it('marks delivered Team mention cards seen when rendered', async () => {
    const onSeen = vi.fn()
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
        onReplyToTeam={vi.fn()}
        onPostUpdate={vi.fn()}
        onViewOriginal={vi.fn()}
        onNoAction={vi.fn()}
        onSeen={onSeen}
    />)

    await waitFor(() => expect(onSeen).toHaveBeenCalledTimes(1))
})

it('does not mark the same Team mention seen more than once on rerender', async () => {
    const onSeen = vi.fn()
    const block = {
        kind: 'team-mention' as const,
        id: 'msg-1',
        localId: null,
        requestId: 'req-1',
        teamChatId: 'team-1',
        sourceMessageId: 'team-msg-1',
        text: 'Please confirm API behavior',
        status: 'delivered' as const,
        createdAt: 1
    }
    const props = {
        block,
        onOpenTeamChat: vi.fn(),
        onReplyToTeam: vi.fn(),
        onPostUpdate: vi.fn(),
        onViewOriginal: vi.fn(),
        onNoAction: vi.fn(),
        onSeen
    }
    const { rerender } = render(<TeamMentionMessage {...props} />)

    await waitFor(() => expect(onSeen).toHaveBeenCalledTimes(1))
    rerender(<TeamMentionMessage {...props} onSeen={() => onSeen()} />)

    expect(onSeen).toHaveBeenCalledTimes(1)
})
