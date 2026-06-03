import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TeamChatMessage, TeamParticipant } from '@/types/api'
import { TeamChatTimeline } from './TeamChatTimeline'

const participants: TeamParticipant[] = [
    { id: 'p1', teamChatId: 'team-1', type: 'session', sessionId: 's1', displayName: 'UI', role: 'frontend', color: '#60a5fa', joinedAt: 1 }
]
const reply: TeamChatMessage = {
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
}
const target: TeamChatMessage = {
    id: 'm1',
    teamChatId: 'team-1',
    seq: 1,
    authorParticipantId: 'p1',
    text: 'original',
    mentions: [],
    files: [],
    createdAt: 1
}

it('loads around-page when reply target is not mounted and scrolls the loaded target', async () => {
    const scrollCalls: string[] = []
    Element.prototype.scrollIntoView = function scrollIntoViewMock() {
        scrollCalls.push(this.textContent ?? '')
    }
    const resolveLoad: { current?: () => void } = {}
    const loadAround = vi.fn(() => new Promise<void>((resolve) => { resolveLoad.current = resolve }))
    const view = render(<TeamChatTimeline messages={[reply]} participants={participants} onLoadAround={loadAround} />)

    fireEvent.click(screen.getByText(/Replied to Backend/))
    expect(loadAround).toHaveBeenCalledWith('m1')

    view.rerender(<TeamChatTimeline messages={[target, reply]} participants={participants} onLoadAround={loadAround} />)
    resolveLoad.current?.()

    await waitFor(() => expect(scrollCalls.some((text) => text.includes('original'))).toBe(true))
})
