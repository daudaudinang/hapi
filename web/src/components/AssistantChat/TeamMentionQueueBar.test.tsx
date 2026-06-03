import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamMentionQueueBar } from './TeamMentionQueueBar'

const baseRequest = {
    teamChatId: 'team-1',
    sourceMessageId: 'msg-1',
    targetSessionId: 'session-1',
    createdAt: 1
}

describe('TeamMentionQueueBar', () => {
    it('renders a compact queue for multiple active Team mentions', () => {
        const onReviewFirst = vi.fn()
        render(<TeamMentionQueueBar
            requests={[
                { ...baseRequest, id: 'req-1', status: 'delivered' },
                { ...baseRequest, id: 'req-2', status: 'seen', createdAt: 2 },
                { ...baseRequest, id: 'req-3', status: 'no_action', createdAt: 3 }
            ]}
            onReviewFirst={onReviewFirst}
            onOpenTeamChat={vi.fn()}
        />)

        expect(screen.getByLabelText('Pending Team mentions')).toBeInTheDocument()
        expect(screen.getByText('2 Team mentions waiting')).toBeInTheDocument()
        expect(screen.getByText('1 seen')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: /Review first/i }))
        expect(onReviewFirst).toHaveBeenCalledWith('req-1')
    })
})
