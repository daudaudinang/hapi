import { describe, expect, it } from 'bun:test'
import { parseTeamMentions } from './teamMentions'

it('matches display names with spaces', () => {
    const participants = [
        { id: 'p1', sessionId: 's1', displayName: 'Backend API' },
        { id: 'p2', sessionId: 's2', displayName: 'Team Chat UI' }
    ]
    expect(parseTeamMentions('@Backend API confirm with @Team Chat UI', participants)).toEqual([
        { participantId: 'p1', sessionId: 's1', displayName: 'Backend API' },
        { participantId: 'p2', sessionId: 's2', displayName: 'Team Chat UI' }
    ])
})

it('uses longest match, boundaries, dedupe, and text order', () => {
    const participants = [
        { id: 'short', sessionId: 's1', displayName: 'Backend' },
        { id: 'long', sessionId: 's2', displayName: 'Backend API' },
        { id: 'tests', sessionId: 's3', displayName: 'Tests' },
        { id: 'user', sessionId: null, displayName: 'Human' }
    ]

    expect(parseTeamMentions('@Backend API, then @Tests. @Backend API2 no match. @Human ignored.', participants)).toEqual([
        { participantId: 'long', sessionId: 's2', displayName: 'Backend API' },
        { participantId: 'tests', sessionId: 's3', displayName: 'Tests' }
    ])
})
