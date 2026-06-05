import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { createTeamSessionMember } from './team-session-member'

describe('createTeamSessionMember', () => {
    it('spawns a codex session, adds it as a Team member, and sends the optional initial task', async () => {
        const api = {
            spawnSession: vi.fn(async () => ({ type: 'success' as const, sessionId: 'session-new' })),
            sendMessage: vi.fn(async () => ({ status: 'sent' as const, sessionId: 'session-new' }))
        } as unknown as ApiClient
        const addTeamParticipant = vi.fn(async () => undefined)

        const sessionId = await createTeamSessionMember({
            api,
            machineId: 'machine-a',
            projectPath: '/repo/hapi',
            alias: 'Backend API',
            color: '#60a5fa',
            initialTask: '  Review the Team Chat API.  ',
            addTeamParticipant
        })

        expect(sessionId).toBe('session-new')
        expect(api.spawnSession).toHaveBeenCalledWith('machine-a', '/repo/hapi', 'codex')
        expect(addTeamParticipant).toHaveBeenCalledWith({
            type: 'session',
            sessionId: 'session-new',
            displayName: 'Backend API',
            role: 'general',
            color: '#60a5fa'
        })
        expect(api.sendMessage).toHaveBeenCalledWith('session-new', 'Review the Team Chat API.')
    })

    it('throws the runner error and does not add a member when session spawn fails', async () => {
        const api = {
            spawnSession: vi.fn(async () => ({ type: 'error' as const, message: 'Runner unavailable' })),
            sendMessage: vi.fn()
        } as unknown as ApiClient
        const addTeamParticipant = vi.fn()

        await expect(createTeamSessionMember({
            api,
            machineId: 'machine-a',
            projectPath: '/repo/hapi',
            alias: 'Backend API',
            color: '#60a5fa',
            initialTask: 'Review',
            addTeamParticipant
        })).rejects.toThrow('Runner unavailable')

        expect(addTeamParticipant).not.toHaveBeenCalled()
        expect(api.sendMessage).not.toHaveBeenCalled()
    })
})
