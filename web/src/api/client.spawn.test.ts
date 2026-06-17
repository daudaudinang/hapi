import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'

describe('ApiClient spawnSession', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('posts resumeSessionId when spawning a Codex resume session', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ type: 'success', sessionId: 'session-1' })
        } as Response)
        const api = new ApiClient('token')

        await expect(api.spawnSession(
            'machine-1',
            '/repo',
            'codex',
            undefined,
            undefined,
            true,
            'simple',
            undefined,
            undefined,
            '019ed35e-db26-7770-abb3-1c7ee3c92f52'
        )).resolves.toEqual({ type: 'success', sessionId: 'session-1' })

        expect(fetchMock).toHaveBeenCalledWith('/api/machines/machine-1/spawn', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({
                directory: '/repo',
                agent: 'codex',
                yolo: true,
                sessionType: 'simple',
                resumeSessionId: '019ed35e-db26-7770-abb3-1c7ee3c92f52'
            })
        }))
    })
})
