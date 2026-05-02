import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClient } from './client'

describe('ApiClient editor file mutations', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('posts editor write-file requests', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ success: true, path: '/repo/a.ts', size: 7 })
        } as Response)
        const api = new ApiClient('token')

        await expect(api.writeEditorFile('machine-1', '/repo/a.ts', 'updated')).resolves.toEqual({
            success: true,
            path: '/repo/a.ts',
            size: 7
        })

        expect(fetchMock).toHaveBeenCalledWith('/api/editor/file/write', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ machineId: 'machine-1', path: '/repo/a.ts', content: 'updated' })
        }))
    })

    it('posts editor create-file requests', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ success: true, path: '/repo/new.ts', size: 0 })
        } as Response)
        const api = new ApiClient('token')

        await expect(api.createEditorFile('machine-1', '/repo/new.ts', '')).resolves.toEqual({
            success: true,
            path: '/repo/new.ts',
            size: 0
        })

        expect(fetchMock).toHaveBeenCalledWith('/api/editor/file/create', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ machineId: 'machine-1', path: '/repo/new.ts', content: '' })
        }))
    })

    it('posts editor delete-file requests', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ success: true, path: '/repo/old.ts' })
        } as Response)
        const api = new ApiClient('token')

        await expect(api.deleteEditorFile('machine-1', '/repo/old.ts')).resolves.toEqual({
            success: true,
            path: '/repo/old.ts'
        })

        expect(fetchMock).toHaveBeenCalledWith('/api/editor/file/delete', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ machineId: 'machine-1', path: '/repo/old.ts' })
        }))
    })

    it('posts editor git status requests', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ success: true, state: 'notRepository', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0 })
        } as Response)
        const api = new ApiClient('token')

        const response = await api.getEditorGitStatusV2('machine-1', '/repo', '/repo')

        expect(response.state).toBe('notRepository')
        expect(fetchMock).toHaveBeenCalledWith('/api/editor/git-status-v2', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ machineId: 'machine-1', path: '/repo', repoRoot: '/repo' })
        }))
    })

    it('posts editor git mutation requests', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => ({ success: true, stdout: '', stderr: '', exitCode: 0 })
        } as Response)
        const api = new ApiClient('token')

        await api.stageEditorGitFile('machine-1', '/repo', 'src/App.tsx', '/repo')
        await api.commitEditorGit('machine-1', '/repo', 'message', '/repo')

        expect(fetchMock).toHaveBeenCalledWith('/api/editor/git-stage-file', expect.objectContaining({ method: 'POST' }))
        expect(fetchMock).toHaveBeenCalledWith('/api/editor/git-commit', expect.objectContaining({ method: 'POST' }))
    })
})
