import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { configureTeamSessionMember } from './team-session-member'

describe('configureTeamSessionMember', () => {
    it('renames the created session, adds it as a Team member, and sends the optional initial task', async () => {
        const api = {
            renameSession: vi.fn(async () => undefined),
            sendMessage: vi.fn(async () => ({ status: 'sent' as const, sessionId: 'session-new' }))
        } as unknown as ApiClient
        const addTeamParticipant = vi.fn(async () => undefined)

        await configureTeamSessionMember({
            api,
            sessionId: 'session-new',
            label: 'Backend API',
            alias: 'Backend API',
            color: '#60a5fa',
            initialTask: '  Review the Team Chat API.  ',
            addTeamParticipant
        })

        expect(api.renameSession).toHaveBeenCalledWith('session-new', 'Backend API')
        expect(addTeamParticipant).toHaveBeenCalledWith({
            type: 'session',
            sessionId: 'session-new',
            displayName: 'Backend API',
            role: 'general',
            color: '#60a5fa'
        })
        expect(api.sendMessage).toHaveBeenCalledWith('session-new', 'Review the Team Chat API.')
    })

    it('skips rename and initial task when optional fields are blank', async () => {
        const api = {
            renameSession: vi.fn(),
            sendMessage: vi.fn()
        } as unknown as ApiClient
        const addTeamParticipant = vi.fn(async () => undefined)

        await configureTeamSessionMember({
            api,
            sessionId: 'session-new',
            label: '  ',
            alias: 'Backend API',
            color: '#60a5fa',
            initialTask: ' ',
            addTeamParticipant
        })

        expect(api.renameSession).not.toHaveBeenCalled()
        expect(addTeamParticipant).toHaveBeenCalled()
        expect(api.sendMessage).not.toHaveBeenCalled()
    })
})
