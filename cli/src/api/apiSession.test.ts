import { beforeEach, describe, expect, it, vi } from 'vitest'

var ioMock = vi.fn()
var axiosGetMock = vi.fn()
var axiosPostMock = vi.fn()

vi.mock('socket.io-client', () => ({
    io: (...args: unknown[]) => ioMock(...args)
}))

vi.mock('axios', () => ({
    default: {
        get: (...args: unknown[]) => axiosGetMock(...args),
        post: (...args: unknown[]) => axiosPostMock(...args)
    }
}))

vi.mock('@/api/rpc/RpcHandlerManager', () => ({
    RpcHandlerManager: class {
        onSocketConnect(): void { }
        onSocketDisconnect(): void { }
        registerHandler(): void { }
        handleRequest(): Promise<string> {
            return Promise.resolve('{}')
        }
    }
}))

vi.mock('../modules/common/registerCommonHandlers', () => ({
    registerCommonHandlers: () => { }
}))

vi.mock('@/terminal/TerminalManager', () => ({
    TerminalManager: class {
        closeAll(): void { }
    }
}))

import { ApiSessionClient, isExternalUserMessage } from './apiSession'
import { configuration } from '@/configuration'
import type { Metadata, Session } from './types'


describe('isExternalUserMessage', () => {
    const baseUserMsg = {
        type: 'user' as const,
        uuid: 'test-uuid',
        userType: 'external' as const,
        isSidechain: false,
        message: { role: 'user', content: 'hello' },
    }

    it('returns true for a real user text message', () => {
        expect(isExternalUserMessage(baseUserMsg)).toBe(true)
    })

    it('returns false when isMeta is true (skill injections)', () => {
        expect(isExternalUserMessage({ ...baseUserMsg, isMeta: true })).toBe(false)
    })

    it('returns false when isSidechain is true', () => {
        expect(isExternalUserMessage({ ...baseUserMsg, isSidechain: true })).toBe(false)
    })

    it('returns false when content is an array (tool results)', () => {
        expect(
            isExternalUserMessage({
                ...baseUserMsg,
                message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: 'y' }] },
            } as never)
        ).toBe(false)
    })

    it('returns false for assistant messages', () => {
        expect(
            isExternalUserMessage({
                type: 'assistant',
                uuid: 'test-uuid',
                message: { role: 'assistant', content: 'hi' },
            } as never)
        ).toBe(false)
    })

    // System-injected content detection
    it('returns false for <task-notification> messages', () => {
        expect(
            isExternalUserMessage({
                ...baseUserMsg,
                message: { role: 'user', content: '<task-notification>\n<task-id>abc123</task-id>\n</task-notification>' },
            })
        ).toBe(false)
    })

    it('returns false for <command-name> messages', () => {
        expect(
            isExternalUserMessage({
                ...baseUserMsg,
                message: { role: 'user', content: '<command-name>/clear</command-name>' },
            })
        ).toBe(false)
    })

    it('returns false for <local-command-caveat> messages', () => {
        expect(
            isExternalUserMessage({
                ...baseUserMsg,
                message: { role: 'user', content: '<local-command-caveat>Caveat: ...</local-command-caveat>' },
            })
        ).toBe(false)
    })

    it('returns false for <system-reminder> messages', () => {
        expect(
            isExternalUserMessage({
                ...baseUserMsg,
                message: { role: 'user', content: '<system-reminder>\nToday is 2026.\n</system-reminder>' },
            })
        ).toBe(false)
    })

    it('returns true for user text that mentions XML-like strings but is not injected', () => {
        expect(
            isExternalUserMessage({
                ...baseUserMsg,
                message: { role: 'user', content: 'How do I use the <task-notification> tag?' },
            })
        ).toBe(true)
    })

    it('returns false for <task-notification> with leading whitespace', () => {
        expect(
            isExternalUserMessage({
                ...baseUserMsg,
                message: { role: 'user', content: '  \n<task-notification>\n<task-id>x</task-id>\n</task-notification>' },
            })
        ).toBe(false)
    })
})


describe('ApiSessionClient.updateMetadata', () => {
    const now = 1_710_000_000_000

    beforeEach(() => {
        ioMock.mockReset()
        axiosGetMock.mockReset()
        axiosPostMock.mockReset()
    })

    function makeSocket() {
        return {
            on: vi.fn(),
            off: vi.fn(),
            connect: vi.fn(),
            emit: vi.fn(),
            emitWithAck: vi.fn(async () => ({ result: 'success', version: 2, metadata: { path: '/tmp/project', host: 'test-host' } })),
            volatile: { emit: vi.fn() }
        }
    }

    function makeSession(metadata: Metadata): Session {
        return {
            id: 'session-1',
            namespace: 'default',
            seq: 1,
            createdAt: now,
            updatedAt: now,
            active: true,
            activeAt: now,
            metadata,
            metadataVersion: 1,
            agentState: null,
            agentStateVersion: 0,
            thinking: false,
            thinkingAt: now,
            todos: [],
            model: null,
            modelReasoningEffort: null,
            effort: null,
            permissionMode: undefined,
            collaborationMode: undefined
        }
    }

    it('does not emit when handler returns the current metadata object', async () => {
        const fakeSocket = makeSocket()
        ioMock.mockReturnValue(fakeSocket)
        const current: Metadata = { path: '/tmp/project', host: 'test-host' }
        const client = new ApiSessionClient('cli-token', makeSession(current))

        await new Promise<void>((resolve) => {
            client.updateMetadata((metadata) => {
                expect(metadata).toBe(current)
                resolve()
                return metadata
            })
        })

        await Promise.resolve()

        expect(fakeSocket.emitWithAck).not.toHaveBeenCalled()
    })

    it('posts ReportToTeam through the CLI session-scoped route', async () => {
        const fakeSocket = makeSocket()
        ioMock.mockReturnValue(fakeSocket)
        configuration._setApiUrl('http://hub.test')
        configuration._setCliApiToken('cli-token')
        axiosPostMock.mockResolvedValue({
            data: {
                message: {
                    id: 'msg-report',
                    teamChatId: 'team/1',
                    seq: 1,
                    authorParticipantId: 'p1',
                    text: 'Implemented tests',
                    reportType: 'done',
                    replyToMessageId: null,
                    replyPreview: null,
                    mentions: [],
                    files: [],
                    createdAt: 1
                }
            }
        })
        const client = new ApiSessionClient('cli-token', makeSession({ path: '/tmp/project', host: 'test-host' }))

        const result = await client.reportToTeam({
            teamChatId: 'team/1',
            type: 'done',
            summary: 'Implemented tests'
        })

        expect(result.message.id).toBe('msg-report')
        expect(axiosPostMock).toHaveBeenCalledWith(
            'http://hub.test/cli/sessions/session-1/team-reports',
            { teamChatId: 'team/1', type: 'done', summary: 'Implemented tests' },
            expect.objectContaining({
                headers: expect.objectContaining({ Authorization: 'Bearer cli-token' }),
                timeout: 15_000
            })
        )
    })
})
