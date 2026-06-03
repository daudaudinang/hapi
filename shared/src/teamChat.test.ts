import { describe, expect, it } from 'bun:test'
import {
    MarkTeamMentionNoActionInputSchema,
    ReportToTeamInputSchema,
    SyncEventSchema,
    TeamChatMessageSchema,
    TeamChatSchema,
    TeamMentionRequestSchema,
    TeamParticipantSchema
} from './schemas'

describe('Team Chat schemas', () => {
    it('parses Team mention request with processing lifecycle fields', () => {
        const parsed = TeamMentionRequestSchema.parse({
            id: 'req-1',
            teamChatId: 'team-1',
            sourceMessageId: 'msg-1',
            targetSessionId: 'session-1',
            status: 'processing',
            contextSnapshot: {
                originalText: '@Backend confirm fields',
                sharedContext: { goal: 'Build Team Chat', decisions: ['No orchestrator'], openQuestions: [] },
                attachedFiles: []
            },
            hopDepth: 1,
            createdAt: 100,
            deliveredAt: 110,
            seenAt: 120,
            processingStartedAt: 130
        })

        expect(parsed.status).toBe('processing')
        expect(parsed.contextSnapshot.sharedContext.decisions).toEqual(['No orchestrator'])
    })

    it('parses Team Chat participant and message defaults', () => {
        const chat = TeamChatSchema.parse({
            id: 'team-1',
            namespace: 'default',
            name: 'Team Chat',
            createdAt: 100,
            updatedAt: 100
        })
        const participant = TeamParticipantSchema.parse({
            id: 'participant-1',
            teamChatId: chat.id,
            type: 'session',
            sessionId: 'session-1',
            displayName: 'Backend',
            color: '#8b5cf6',
            joinedAt: 100
        })
        const message = TeamChatMessageSchema.parse({
            id: 'msg-1',
            teamChatId: chat.id,
            seq: 1,
            authorParticipantId: participant.id,
            text: '@Backend confirm fields',
            createdAt: 110
        })

        expect(participant.role).toBe('general')
        expect(message.mentions).toEqual([])
        expect(message.files).toEqual([])
    })

    it('parses team-message-created sync event', () => {
        const parsed = SyncEventSchema.parse({
            type: 'team-message-created',
            namespace: 'default',
            teamChatId: 'team-1',
            messageId: 'msg-1'
        })

        expect(parsed.type).toBe('team-message-created')
    })

    it('parses mark-team-mention-no-action tool input', () => {
        const parsed = MarkTeamMentionNoActionInputSchema.parse({
            requestId: 'req-1'
        })

        expect(parsed).toEqual({ requestId: 'req-1' })
    })

    it('parses report-to-team tool input with safe defaults', () => {
        const parsed = ReportToTeamInputSchema.parse({
            teamChatId: 'team-1',
            type: 'done',
            summary: 'Implemented shared Team Chat schemas'
        })

        expect(parsed.mentions).toEqual([])
        expect(parsed.files).toEqual([])
    })
})
