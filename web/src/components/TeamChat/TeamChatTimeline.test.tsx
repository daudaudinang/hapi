import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamChatTimeline } from './TeamChatTimeline'

it('loads around-page when reply target is not mounted and scrolls after load', async () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const loadAround = vi.fn(async () => undefined)
    render(<TeamChatTimeline
        messages={[{
            id: 'm2',
            teamChatId: 'team-1',
            seq: 2,
            authorParticipantId: 'p1',
            text: 'reply',
            replyToMessageId: 'm1',
            replyPreview: { authorName: 'Backend', excerpt: 'original' },
            mentions: [],
            files: [],
            createdAt: 2
        }]}
        participants={[{ id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'UI', role: 'frontend', color: '#60a5fa', joinedAt: 1 }]}
        onLoadAround={loadAround}
    />)

    fireEvent.click(screen.getByText(/Replied to Backend/))

    expect(loadAround).toHaveBeenCalledWith('m1')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled())
})
