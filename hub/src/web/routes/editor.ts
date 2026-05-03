import { Hono } from 'hono'
import { z } from 'zod'
import type { SyncEngine } from '../../sync/syncEngine'
import type { WebAppEnv } from '../middleware/auth'

const directoryBodySchema = z.object({
    machineId: z.string().min(1),
    path: z.string().default('/')
})

const fileBodySchema = z.object({
    machineId: z.string().min(1),
    path: z.string().min(1)
})

const fileMutationBodySchema = z.object({
    machineId: z.string().min(1),
    path: z.string().min(1),
    content: z.string().default('')
})

const projectsBodySchema = z.object({
    machineId: z.string().min(1)
})

const gitRepoBodySchema = z.object({
    machineId: z.string().min(1),
    path: z.string().min(1),
    repoRoot: z.string().min(1).optional()
})

const gitFileBodySchema = gitRepoBodySchema.extend({
    filePath: z.string().min(1),
    staged: z.boolean().optional()
})

const gitCommitBodySchema = gitRepoBodySchema.extend({
    message: z.string().min(1)
})

const gitBranchBodySchema = gitRepoBodySchema.extend({
    branch: z.string().min(1)
})

export function createEditorRoutes(getSyncEngine: () => SyncEngine | null): Hono<WebAppEnv> {
    const app = new Hono<WebAppEnv>()

    app.post('/editor/directory', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = directoryBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid body' }, 400)
        }

        try {
            const result = await engine.listEditorDirectory(parsed.data.machineId, parsed.data.path)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list directory'
            }, 500)
        }
    })

    app.post('/editor/file', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = fileBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid body' }, 400)
        }

        try {
            const result = await engine.readEditorFile(parsed.data.machineId, parsed.data.path)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to read file'
            }, 500)
        }
    })

    app.post('/editor/file/write', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = fileMutationBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid body' }, 400)
        }

        try {
            const result = await engine.writeEditorFile(parsed.data.machineId, parsed.data.path, parsed.data.content)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to write file'
            }, 500)
        }
    })

    app.post('/editor/file/create', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = fileMutationBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid body' }, 400)
        }

        try {
            const result = await engine.createEditorFile(parsed.data.machineId, parsed.data.path, parsed.data.content)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to create file'
            }, 500)
        }
    })

    app.post('/editor/file/delete', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = fileBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid body' }, 400)
        }

        try {
            const result = await engine.deleteEditorFile(parsed.data.machineId, parsed.data.path)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to delete file'
            }, 500)
        }
    })

    app.post('/editor/projects', async (c) => {
        const engine = getSyncEngine()
        if (!engine) {
            return c.json({ success: false, error: 'Not connected' }, 503)
        }

        const body = await c.req.json().catch(() => null)
        const parsed = projectsBodySchema.safeParse(body)
        if (!parsed.success) {
            return c.json({ success: false, error: 'Invalid body' }, 400)
        }

        try {
            const result = await engine.listEditorProjects(parsed.data.machineId)
            return c.json(result)
        } catch (error) {
            return c.json({
                success: false,
                error: error instanceof Error ? error.message : 'Failed to list projects'
            }, 500)
        }
    })

    app.post('/editor/git-status-v2', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.getEditorGitStatusV2(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-diff-file', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitFileBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.getEditorGitDiffFile(parsed.data.machineId, parsed.data.path, parsed.data.filePath, parsed.data.staged, parsed.data.repoRoot))
    })

    app.post('/editor/git-stage-file', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitFileBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.stageEditorGitFile(parsed.data.machineId, parsed.data.path, parsed.data.filePath, parsed.data.repoRoot))
    })

    app.post('/editor/git-unstage-file', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitFileBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.unstageEditorGitFile(parsed.data.machineId, parsed.data.path, parsed.data.filePath, parsed.data.repoRoot))
    })

    app.post('/editor/git-stage-all', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.stageAllEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-unstage-all', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.unstageAllEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-commit', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitCommitBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.commitEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.message, parsed.data.repoRoot))
    })

    app.post('/editor/git-pull', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.pullEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-push', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.pushEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })


    app.post('/editor/git-list-branches', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.listEditorGitBranches(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-checkout', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitBranchBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.checkoutEditorGitBranch(parsed.data.machineId, parsed.data.path, parsed.data.branch, parsed.data.repoRoot))
    })

    app.post('/editor/git-create-branch', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitBranchBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.createEditorGitBranch(parsed.data.machineId, parsed.data.path, parsed.data.branch, parsed.data.repoRoot))
    })

    app.post('/editor/git-fetch', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.fetchEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })


    app.post('/editor/git-discard-file', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitFileBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.discardEditorGitFile(parsed.data.machineId, parsed.data.path, parsed.data.filePath, parsed.data.repoRoot))
    })

    app.post('/editor/git-discard-all', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.discardAllEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-stash-list', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.listEditorGitStashes(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-stash-push', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.stashPushEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    app.post('/editor/git-stash-pop', async (c) => {
        const engine = getSyncEngine()
        if (!engine) return c.json({ success: false, error: 'Not connected' }, 503)
        const parsed = gitRepoBodySchema.safeParse(await c.req.json().catch(() => null))
        if (!parsed.success) return c.json({ success: false, error: 'Invalid body' }, 400)
        return c.json(await engine.stashPopEditorGit(parsed.data.machineId, parsed.data.path, parsed.data.repoRoot))
    })

    return app
}
