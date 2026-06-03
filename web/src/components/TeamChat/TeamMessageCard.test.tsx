import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamMessageCard } from './TeamMessageCard'

it('renders reply preview and report type', () => {
    render(<TeamMessageCard
        message={{
            id: 'm1',
            teamChatId: 't1',
            seq: 1,
            authorParticipantId: 'p1',
            text: 'Confirmed fields',
            reportType: 'reply',
            replyToMessageId: 'm0',
            replyPreview: { authorName: 'UI', excerpt: 'confirm fields?' },
            mentions: [],
            files: [],
            createdAt: 1
        }}
        author={{ id: 'p1', teamChatId: 't1', type: 'session', sessionId: 's1', displayName: 'Backend', role: 'backend', color: '#60a5fa', joinedAt: 1 }}
        onReplyPreviewClick={vi.fn()}
    />)

    expect(screen.getByText('Backend')).toBeInTheDocument()
    expect(screen.getByText(/Replied to UI/)).toBeInTheDocument()
    expect(screen.getByText('Confirmed fields')).toBeInTheDocument()
})
