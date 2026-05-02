# Hapi Editor Git Source Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add machine/project-scoped Git Source Control to Hapi Editor with repository discovery, status/diff, file-level stage/unstage, commit, pull, and push.

**Architecture:** Put Git repository discovery and command execution in CLI machine RPC, expose it through hub Editor routes, then consume it from web via a Hapi-styled Source Control panel in the existing Editor left pane. Reuse Agent mode Git parsing concepts and UI patterns, but keep Editor Git independent from session-scoped routes so it works without an active agent session.

**Tech Stack:** TypeScript strict, Bun workspaces, Hono, Socket.IO RPC, React 19, TanStack Query, Vitest, Node `execFile`.

---

## File map

- Create `cli/src/modules/editorGitRpc.ts`: focused Git discovery, `-z` porcelain parsing, numstat parsing, safe command execution, and `registerEditorGitRpcHandlers`.
- Modify `cli/src/modules/editorRpc.ts`: remove the current simple `editor-git-status` handler and delegate Git handlers to `editorGitRpc.ts`.
- Modify `cli/src/modules/editorRpc.test.ts`: keep existing file tests; add coverage for repository discovery, status parsing, stage/unstage, commit, and safety cases.
- Modify `hub/src/sync/rpcGateway.ts`: add Editor Git response/request types and forwarding methods.
- Modify `hub/src/sync/rpcGateway.editor.test.ts`: cover new machine RPC method forwarding.
- Modify `hub/src/sync/syncEngine.ts`: expose new Editor Git methods to routes.
- Modify `hub/src/web/routes/editor.ts`: add POST routes for Editor Git operations and body validation.
- Modify `web/src/types/api.ts`: add Editor Git response/file/repository types.
- Modify `web/src/api/client.ts`: add Editor Git API methods.
- Modify `web/src/lib/query-keys.ts`: add Editor Git query keys.
- Create `web/src/hooks/queries/useEditorGitStatus.ts`: TanStack Query hook for Editor Git status.
- Create `web/src/hooks/queries/useEditorGitDiff.ts`: TanStack Query hook for Editor file diffs.
- Create `web/src/components/editor/EditorGitPanel.tsx`: Hapi-styled Source Control panel.
- Create `web/src/components/editor/EditorGitPanel.test.tsx`: interaction tests for empty state, status groups, stage/unstage, commit.
- Modify `web/src/components/editor/EditorLayout.tsx`: add desktop `Files | Git` left-pane switcher and wire Git file opening.
- Modify `web/src/components/editor/MobileEditorLayout.tsx`: add mobile `Git` view in bottom nav.
- Modify existing Editor layout tests to account for the new Git surface.

## Task 1: CLI Editor Git module and tests

**Files:**
- Create: `cli/src/modules/editorGitRpc.ts`
- Modify: `cli/src/modules/editorRpc.ts`
- Modify: `cli/src/modules/editorRpc.test.ts`

- [ ] **Step 1: Add failing tests for repository discovery and status**

Append these tests inside `describe('editor RPC handlers', () => { ... })` in `cli/src/modules/editorRpc.test.ts`:

```ts
async function runGit(args: string[], cwd: string): Promise<void> {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    await promisify(execFile)('git', args, { cwd })
}

async function initRepo(path: string): Promise<void> {
    await runGit(['init'], path)
    await runGit(['config', 'user.email', 'hapi@example.com'], path)
    await runGit(['config', 'user.name', 'Hapi Test'], path)
}

it('reports notRepository for a folder without git metadata', async () => {
    const parsed = await request(rpc, 'editor-git-status-v2', { path: rootDir }) as {
        success: boolean
        state?: string
        repositories?: unknown[]
    }

    expect(parsed).toMatchObject({ success: true, state: 'notRepository', repositories: [] })
})

it('discovers a repository from a nested project path and reports changed files', async () => {
    await initRepo(rootDir)
    await writeFile(join(rootDir, 'README.md'), '# changed')
    await writeFile(join(rootDir, 'space name.txt'), 'hello')

    const parsed = await request(rpc, 'editor-git-status-v2', { path: join(rootDir, 'src') }) as {
        success: boolean
        state?: string
        activeRepository?: { root: string; branch: string | null }
        unstagedFiles?: Array<{ fullPath: string; status: string }>
    }

    expect(parsed.success).toBe(true)
    expect(parsed.state).toBe('ready')
    expect(parsed.activeRepository?.root).toBe(rootDir)
    expect(parsed.unstagedFiles).toEqual(expect.arrayContaining([
        expect.objectContaining({ fullPath: 'README.md', status: 'modified' }),
        expect.objectContaining({ fullPath: 'space name.txt', status: 'untracked' })
    ]))
})

it('rejects repository roots outside the editor root', async () => {
    const outside = resolve(rootDir, '..')
    await initRepo(outside)

    const parsed = await request(rpc, 'editor-git-status-v2', { path: rootDir }) as {
        success: boolean
        state?: string
        error?: string
    }

    expect(parsed).toMatchObject({ success: false, state: 'repoOutsideRoot' })
    expect(parsed.error).toContain('outside editor root')
})
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
cd cli && bun test src/modules/editorRpc.test.ts
```

Expected: FAIL because `editor-git-status-v2` is not registered.

- [ ] **Step 3: Create `cli/src/modules/editorGitRpc.ts` with focused Git helpers**

Create the file with these exported types and functions:

```ts
import type { RpcHandlerManager } from '@/api/rpc/RpcHandlerManager'
import { execFile, type ExecFileOptions } from 'node:child_process'
import { readdir, realpath, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const DEFAULT_TIMEOUT = 10_000
const REPOSITORY_SCAN_DEPTH = 3

type EditorGitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
type RepositoryState = 'ready' | 'notRepository' | 'repoOutsideRoot' | 'detached' | 'initial'

type CommandResponse = {
    success: boolean
    stdout?: string
    stderr?: string
    exitCode?: number
    error?: string
}

type EditorGitRepository = {
    root: string
    name: string
    branch: string | null
    state: RepositoryState
    gitDir?: string
}

type EditorGitFile = {
    fileName: string
    filePath: string
    fullPath: string
    status: EditorGitFileStatus
    isStaged: boolean
    linesAdded: number
    linesRemoved: number
    oldPath?: string
}

type EditorGitStatusResponse = {
    success: boolean
    state: RepositoryState
    repositories: EditorGitRepository[]
    activeRepository?: EditorGitRepository
    branch?: string | null
    upstream?: string
    ahead?: number
    behind?: number
    stagedFiles: EditorGitFile[]
    unstagedFiles: EditorGitFile[]
    totalStaged: number
    totalUnstaged: number
    error?: string
}

type EditorGitPathRequest = { path?: string; repoRoot?: string }
type EditorGitFileRequest = EditorGitPathRequest & { filePath?: string; staged?: boolean }
type EditorGitCommitRequest = EditorGitPathRequest & { message?: string }

const execGit = execFileAsync as (file: string, args: string[], options: ExecFileOptions) => Promise<{ stdout: string | Buffer; stderr: string | Buffer }>

function rpcError<T extends object = object>(error: string, extra?: T): { success: false; error: string } & T {
    return { success: false, error, ...(extra ?? {} as T) }
}

function isWithinRoot(absolutePath: string, root: string): boolean {
    const rel = relative(root, absolutePath)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function normalizeRoot(rootDir: string): Promise<string> {
    const resolvedRoot = resolve(rootDir)
    try {
        return await realpath(resolvedRoot)
    } catch {
        return resolvedRoot
    }
}

async function resolveInsideRoot(rawPath: string | undefined, rootDir: string): Promise<{ path: string; root: string; error?: string }> {
    const root = await normalizeRoot(rootDir)
    const target = resolve(root, rawPath && rawPath.trim() ? rawPath : root)
    let resolvedTarget = target
    try {
        resolvedTarget = await realpath(target)
    } catch {
        resolvedTarget = target
    }
    if (!isWithinRoot(resolvedTarget, root)) {
        return { path: resolvedTarget, root, error: 'Path outside editor root' }
    }
    return { path: resolvedTarget, root }
}

async function runGit(args: string[], cwd: string, timeout = DEFAULT_TIMEOUT): Promise<CommandResponse> {
    try {
        const { stdout, stderr } = await execGit('git', args, { cwd, timeout, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
        return { success: true, stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 }
    } catch (error) {
        const execError = error as NodeJS.ErrnoException & { stdout?: string | Buffer; stderr?: string | Buffer; code?: number | string; killed?: boolean }
        return rpcError(execError.killed ? 'Command timed out' : execError.message || 'Git command failed', {
            stdout: execError.stdout ? execError.stdout.toString() : '',
            stderr: execError.stderr ? execError.stderr.toString() : execError.message || 'Git command failed',
            exitCode: typeof execError.code === 'number' ? execError.code : execError.killed ? -1 : 1
        })
    }
}

async function resolveRepository(projectPath: string, editorRoot: string, requestedRepoRoot?: string): Promise<{
    state: RepositoryState
    repoRoot?: string
    gitDir?: string
    root: string
    error?: string
}> {
    const root = await normalizeRoot(editorRoot)
    if (requestedRepoRoot?.trim()) {
        const requested = resolve(root, requestedRepoRoot.trim())
        let realRequested = requested
        try { realRequested = await realpath(requested) } catch { realRequested = requested }
        if (!isWithinRoot(realRequested, root)) {
            return { state: 'repoOutsideRoot', root, error: 'Repository root outside editor root' }
        }
        return { state: 'ready', repoRoot: realRequested, root }
    }

    const topLevel = await runGit(['rev-parse', '--show-toplevel'], projectPath, 5_000)
    if (!topLevel.success) {
        return { state: 'notRepository', root }
    }
    const gitDir = await runGit(['rev-parse', '--git-dir'], projectPath, 5_000)
    const repoRoot = topLevel.stdout?.trim()
    if (!repoRoot) {
        return { state: 'notRepository', root }
    }
    let realRepoRoot = repoRoot
    try { realRepoRoot = await realpath(repoRoot) } catch { realRepoRoot = repoRoot }
    if (!isWithinRoot(realRepoRoot, root)) {
        return { state: 'repoOutsideRoot', repoRoot: realRepoRoot, gitDir: gitDir.stdout?.trim(), root, error: 'Repository root outside editor root' }
    }
    return { state: 'ready', repoRoot: realRepoRoot, gitDir: gitDir.stdout?.trim(), root }
}

function splitNul(output: string): string[] {
    return output.split('\0').filter((entry) => entry.length > 0)
}

function statusFromChar(value: string): EditorGitFileStatus {
    if (value === 'A') return 'added'
    if (value === 'D') return 'deleted'
    if (value === 'R' || value === 'C') return 'renamed'
    if (value === 'U') return 'conflicted'
    return 'modified'
}

function splitFilePath(fullPath: string): { fileName: string; filePath: string } {
    const parts = fullPath.split('/')
    const fileName = parts.pop() || fullPath
    return { fileName, filePath: parts.join('/') }
}

function parseNumstat(output: string): Map<string, { added: number; removed: number }> {
    const result = new Map<string, { added: number; removed: number }>()
    for (const line of output.split('\n')) {
        if (!line.trim()) continue
        const [addedRaw, removedRaw, file] = line.split('\t')
        if (!file) continue
        result.set(file, {
            added: addedRaw === '-' ? 0 : Number.parseInt(addedRaw, 10),
            removed: removedRaw === '-' ? 0 : Number.parseInt(removedRaw, 10)
        })
    }
    return result
}

function parseStatusPorcelainZ(output: string, unstagedStats: Map<string, { added: number; removed: number }>, stagedStats: Map<string, { added: number; removed: number }>): Pick<EditorGitStatusResponse, 'branch' | 'upstream' | 'ahead' | 'behind' | 'stagedFiles' | 'unstagedFiles'> {
    const entries = splitNul(output)
    const stagedFiles: EditorGitFile[] = []
    const unstagedFiles: EditorGitFile[] = []
    let branch: string | null | undefined
    let upstream: string | undefined
    let ahead: number | undefined
    let behind: number | undefined

    for (let index = 0; index < entries.length; index += 1) {
        const entry = entries[index]
        if (entry.startsWith('# branch.head ')) {
            const value = entry.slice('# branch.head '.length)
            branch = value === '(detached)' || value === '(initial)' ? null : value
            continue
        }
        if (entry.startsWith('# branch.upstream ')) {
            upstream = entry.slice('# branch.upstream '.length)
            continue
        }
        if (entry.startsWith('# branch.ab ')) {
            const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(entry)
            if (match) {
                ahead = Number.parseInt(match[1], 10)
                behind = Number.parseInt(match[2], 10)
            }
            continue
        }
        if (entry.startsWith('? ')) {
            const fullPath = entry.slice(2)
            const split = splitFilePath(fullPath)
            unstagedFiles.push({ ...split, fullPath, status: 'untracked', isStaged: false, linesAdded: 0, linesRemoved: 0 })
            continue
        }
        if (entry.startsWith('1 ')) {
            const parts = entry.split(' ')
            const xy = parts[1] ?? '  '
            const fullPath = parts.slice(8).join(' ')
            if (!fullPath) continue
            const split = splitFilePath(fullPath)
            if (xy[0] && xy[0] !== '.' && xy[0] !== ' ') {
                const stats = stagedStats.get(fullPath) ?? { added: 0, removed: 0 }
                stagedFiles.push({ ...split, fullPath, status: statusFromChar(xy[0]), isStaged: true, linesAdded: stats.added, linesRemoved: stats.removed })
            }
            if (xy[1] && xy[1] !== '.' && xy[1] !== ' ') {
                const stats = unstagedStats.get(fullPath) ?? { added: 0, removed: 0 }
                unstagedFiles.push({ ...split, fullPath, status: statusFromChar(xy[1]), isStaged: false, linesAdded: stats.added, linesRemoved: stats.removed })
            }
            continue
        }
        if (entry.startsWith('2 ')) {
            const nextPath = entries[index + 1]
            const parts = entry.split(' ')
            const xy = parts[1] ?? '  '
            const fullPath = parts.slice(9).join(' ')
            const oldPath = nextPath && !nextPath.startsWith('# ') ? nextPath : undefined
            if (oldPath) index += 1
            if (!fullPath) continue
            const split = splitFilePath(fullPath)
            const stats = stagedStats.get(fullPath) ?? unstagedStats.get(fullPath) ?? { added: 0, removed: 0 }
            const file = { ...split, fullPath, oldPath, status: 'renamed' as const, linesAdded: stats.added, linesRemoved: stats.removed }
            if (xy[0] && xy[0] !== '.' && xy[0] !== ' ') stagedFiles.push({ ...file, isStaged: true })
            if (xy[1] && xy[1] !== '.' && xy[1] !== ' ') unstagedFiles.push({ ...file, isStaged: false })
        }
    }
    return { branch, upstream, ahead, behind, stagedFiles, unstagedFiles }
}

async function getRepositorySummary(repoRoot: string, state: RepositoryState, gitDir?: string): Promise<EditorGitRepository> {
    const branchResult = await runGit(['branch', '--show-current'], repoRoot, 5_000)
    const branch = branchResult.success && branchResult.stdout?.trim() ? branchResult.stdout.trim() : null
    return { root: repoRoot, name: basename(repoRoot) || repoRoot, branch, state, gitDir }
}

async function scanNestedRepositories(projectPath: string, editorRoot: string, primaryRoot?: string): Promise<EditorGitRepository[]> {
    const root = await normalizeRoot(editorRoot)
    const found = new Map<string, EditorGitRepository>()
    if (primaryRoot) {
        found.set(primaryRoot, await getRepositorySummary(primaryRoot, 'ready'))
    }
    async function scan(dir: string, depth: number): Promise<void> {
        if (depth > REPOSITORY_SCAN_DEPTH || !isWithinRoot(dir, root)) return
        let entries: Awaited<ReturnType<typeof readdir>>
        try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
        const hasGit = entries.some((entry) => entry.name === '.git')
        if (hasGit) {
            const resolved = await resolveRepository(dir, editorRoot)
            if (resolved.repoRoot && !found.has(resolved.repoRoot)) {
                found.set(resolved.repoRoot, await getRepositorySummary(resolved.repoRoot, resolved.state, resolved.gitDir))
            }
        }
        const skip = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.cache'])
        await Promise.all(entries.map(async (entry) => {
            if (!entry.isDirectory() || skip.has(entry.name)) return
            await scan(join(dir, entry.name), depth + 1)
        }))
    }
    await scan(projectPath, 0)
    return [...found.values()].sort((a, b) => a.root.localeCompare(b.root))
}

async function getStatus(path: string, editorRoot: string, requestedRepoRoot?: string): Promise<EditorGitStatusResponse> {
    const resolved = await resolveRepository(path, editorRoot, requestedRepoRoot)
    if (resolved.state === 'notRepository') {
        return { success: true, state: 'notRepository', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0 }
    }
    if (!resolved.repoRoot || resolved.state === 'repoOutsideRoot') {
        return { success: false, state: 'repoOutsideRoot', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0, error: resolved.error ?? 'Repository root outside editor root' }
    }

    const [statusResult, unstagedNumstat, stagedNumstat] = await Promise.all([
        runGit(['status', '--porcelain=v2', '-z', '--branch', '--untracked-files=all'], resolved.repoRoot),
        runGit(['diff', '--numstat'], resolved.repoRoot),
        runGit(['diff', '--cached', '--numstat'], resolved.repoRoot)
    ])
    if (!statusResult.success) {
        return { success: false, state: 'ready', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0, error: statusResult.error ?? statusResult.stderr ?? 'Git status failed' }
    }
    const parsed = parseStatusPorcelainZ(statusResult.stdout ?? '', parseNumstat(unstagedNumstat.stdout ?? ''), parseNumstat(stagedNumstat.stdout ?? ''))
    const state: RepositoryState = parsed.branch === null ? 'detached' : 'ready'
    const activeRepository = await getRepositorySummary(resolved.repoRoot, state, resolved.gitDir)
    const repositories = await scanNestedRepositories(path, editorRoot, resolved.repoRoot)
    return {
        success: true,
        state,
        repositories: repositories.length ? repositories : [activeRepository],
        activeRepository,
        branch: parsed.branch,
        upstream: parsed.upstream,
        ahead: parsed.ahead,
        behind: parsed.behind,
        stagedFiles: parsed.stagedFiles,
        unstagedFiles: parsed.unstagedFiles,
        totalStaged: parsed.stagedFiles.length,
        totalUnstaged: parsed.unstagedFiles.length
    }
}

async function resolveCommandRepo(data: EditorGitPathRequest, editorRoot: string): Promise<{ repoRoot?: string; error?: string; state?: RepositoryState }> {
    const resolvedPath = await resolveInsideRoot(data.path, editorRoot)
    if (resolvedPath.error) return { error: resolvedPath.error }
    const repo = await resolveRepository(resolvedPath.path, editorRoot, data.repoRoot)
    if (!repo.repoRoot) return { error: repo.error ?? 'No Git repository found', state: repo.state }
    return { repoRoot: repo.repoRoot, state: repo.state }
}

function validateRelativeGitPath(filePath: string | undefined): string | null {
    if (!filePath?.trim()) return null
    const value = filePath.trim()
    if (isAbsolute(value) || value.split(/[\\/]+/).includes('..')) return null
    return value
}

export function registerEditorGitRpcHandlers(rpcHandlerManager: RpcHandlerManager, editorRoot: string): void {
    rpcHandlerManager.registerHandler<EditorGitPathRequest>('editor-git-status-v2', async (data) => {
        const resolvedPath = await resolveInsideRoot(data?.path, editorRoot)
        if (resolvedPath.error) return rpcError(resolvedPath.error)
        return await getStatus(resolvedPath.path, editorRoot, data?.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitFileRequest>('editor-git-diff-file', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        const filePath = validateRelativeGitPath(data?.filePath)
        if (!filePath) return rpcError('Invalid file path')
        const args = data?.staged ? ['diff', '--cached', '--no-ext-diff', '--', filePath] : ['diff', '--no-ext-diff', '--', filePath]
        return await runGit(args, repo.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitFileRequest>('editor-git-stage-file', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        const filePath = validateRelativeGitPath(data?.filePath)
        if (!filePath) return rpcError('Invalid file path')
        return await runGit(['add', '--', filePath], repo.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitFileRequest>('editor-git-unstage-file', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        const filePath = validateRelativeGitPath(data?.filePath)
        if (!filePath) return rpcError('Invalid file path')
        return await runGit(['restore', '--staged', '--', filePath], repo.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitPathRequest>('editor-git-stage-all', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        return await runGit(['add', '-A'], repo.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitPathRequest>('editor-git-unstage-all', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        return await runGit(['reset', 'HEAD', '--'], repo.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitCommitRequest>('editor-git-commit', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        const message = data?.message?.trim()
        if (!message) return rpcError('Commit message is required')
        return await runGit(['commit', '-m', message], repo.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitPathRequest>('editor-git-pull', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        return await runGit(['pull', '--ff-only'], repo.repoRoot)
    })

    rpcHandlerManager.registerHandler<EditorGitPathRequest>('editor-git-push', async (data) => {
        const repo = await resolveCommandRepo(data ?? {}, editorRoot)
        if (!repo.repoRoot) return rpcError(repo.error ?? 'No Git repository found', { state: repo.state })
        return await runGit(['push'], repo.repoRoot)
    })
}
```

- [ ] **Step 4: Delegate Git handlers from `editorRpc.ts`**

In `cli/src/modules/editorRpc.ts`, add:

```ts
import { registerEditorGitRpcHandlers } from './editorGitRpc'
```

Inside `registerEditorRpcHandlers`, near the top before file handlers:

```ts
    registerEditorGitRpcHandlers(rpcHandlerManager, editorRoot)
```

Remove the existing `rpcHandlerManager.registerHandler<EditorGitStatusRequest, EditorCommandResponse>('editor-git-status', ...)` block after later hub code no longer uses it. Keep it temporarily if compatibility is needed during this task; final cleanup happens in Task 3.

- [ ] **Step 5: Add failing tests for mutations**

Append:

```ts
it('stages, unstages, and commits files inside the active repository', async () => {
    await initRepo(rootDir)
    await writeFile(join(rootDir, 'tracked.txt'), 'one')
    await runGit(['add', 'tracked.txt'], rootDir)
    await runGit(['commit', '-m', 'initial'], rootDir)
    await writeFile(join(rootDir, 'tracked.txt'), 'two')

    await expect(request(rpc, 'editor-git-stage-file', { path: rootDir, filePath: 'tracked.txt' })).resolves.toMatchObject({ success: true })
    let status = await request(rpc, 'editor-git-status-v2', { path: rootDir }) as { stagedFiles?: Array<{ fullPath: string }> }
    expect(status.stagedFiles).toEqual(expect.arrayContaining([expect.objectContaining({ fullPath: 'tracked.txt' })]))

    await expect(request(rpc, 'editor-git-unstage-file', { path: rootDir, filePath: 'tracked.txt' })).resolves.toMatchObject({ success: true })
    status = await request(rpc, 'editor-git-status-v2', { path: rootDir }) as { stagedFiles?: Array<{ fullPath: string }> }
    expect(status.stagedFiles).toEqual([])

    await expect(request(rpc, 'editor-git-stage-all', { path: rootDir })).resolves.toMatchObject({ success: true })
    await expect(request(rpc, 'editor-git-commit', { path: rootDir, message: 'update tracked' })).resolves.toMatchObject({ success: true })
    const log = await request(rpc, 'editor-git-status-v2', { path: rootDir }) as { totalStaged?: number; totalUnstaged?: number }
    expect(log.totalStaged).toBe(0)
    expect(log.totalUnstaged).toBe(0)
})

it('requires a commit message and rejects unsafe git file paths', async () => {
    await initRepo(rootDir)
    await expect(request(rpc, 'editor-git-commit', { path: rootDir, message: '   ' })).resolves.toMatchObject({
        success: false,
        error: 'Commit message is required'
    })
    await expect(request(rpc, 'editor-git-stage-file', { path: rootDir, filePath: '../outside.txt' })).resolves.toMatchObject({
        success: false,
        error: 'Invalid file path'
    })
})
```

- [ ] **Step 6: Run CLI tests**

Run:

```bash
cd cli && bun test src/modules/editorRpc.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add cli/src/modules/editorGitRpc.ts cli/src/modules/editorRpc.ts cli/src/modules/editorRpc.test.ts
git commit -m "feat(cli): add editor git rpc handlers"
```

## Task 2: Hub gateway, sync engine, and Editor routes

**Files:**
- Modify: `hub/src/sync/rpcGateway.ts`
- Modify: `hub/src/sync/syncEngine.ts`
- Modify: `hub/src/web/routes/editor.ts`
- Modify: `hub/src/sync/rpcGateway.editor.test.ts`

- [ ] **Step 1: Add failing gateway tests**

In `hub/src/sync/rpcGateway.editor.test.ts`, add tests matching the existing style:

```ts
it('sends editor-git-status-v2 through machine-level RPC', async () => {
    registry.request.mockResolvedValue({ success: true, state: 'notRepository', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0 })
    const result = await gateway.editorGitStatusV2('machine-1', '/repo')
    expect(result).toMatchObject({ success: true, state: 'notRepository' })
    expect(registry.request).toHaveBeenCalledWith(expect.objectContaining({
        method: 'machine-1:editor-git-status-v2',
        params: JSON.stringify({ path: '/repo', repoRoot: undefined })
    }))
})

it('sends editor git mutations through machine-level RPC', async () => {
    registry.request.mockResolvedValue({ success: true, stdout: '', stderr: '', exitCode: 0 })
    await expect(gateway.editorGitStageFile('machine-1', '/repo', 'src/App.tsx', '/repo')).resolves.toMatchObject({ success: true })
    await expect(gateway.editorGitCommit('machine-1', '/repo', 'message', '/repo')).resolves.toMatchObject({ success: true })
    expect(registry.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'machine-1:editor-git-stage-file' }))
    expect(registry.request).toHaveBeenCalledWith(expect.objectContaining({ method: 'machine-1:editor-git-commit' }))
})
```

- [ ] **Step 2: Run gateway tests and verify they fail**

```bash
cd hub && bun test src/sync/rpcGateway.editor.test.ts
```

Expected: FAIL because methods do not exist.

- [ ] **Step 3: Add types and gateway methods**

In `hub/src/sync/rpcGateway.ts`, add types:

```ts
export type RpcEditorGitRepositoryState = 'ready' | 'notRepository' | 'repoOutsideRoot' | 'detached' | 'initial'
export type RpcEditorGitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
export type RpcEditorGitRepository = { root: string; name: string; branch: string | null; state: RpcEditorGitRepositoryState; gitDir?: string }
export type RpcEditorGitFile = { fileName: string; filePath: string; fullPath: string; status: RpcEditorGitFileStatus; isStaged: boolean; linesAdded: number; linesRemoved: number; oldPath?: string }
export type RpcEditorGitStatusResponse = {
    success: boolean
    state: RpcEditorGitRepositoryState
    repositories: RpcEditorGitRepository[]
    activeRepository?: RpcEditorGitRepository
    branch?: string | null
    upstream?: string
    ahead?: number
    behind?: number
    stagedFiles: RpcEditorGitFile[]
    unstagedFiles: RpcEditorGitFile[]
    totalStaged: number
    totalUnstaged: number
    error?: string
}
```

Add class methods:

```ts
    async editorGitStatusV2(machineId: string, path: string, repoRoot?: string): Promise<RpcEditorGitStatusResponse> {
        const result = await this.machineRpc(machineId, 'editor-git-status-v2', { path, repoRoot }) as RpcEditorGitStatusResponse | unknown
        if (!result || typeof result !== 'object') {
            return { success: false, state: 'notRepository', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0, error: 'Unexpected editor-git-status-v2 result' }
        }
        return result as RpcEditorGitStatusResponse
    }

    async editorGitDiffFile(machineId: string, path: string, filePath: string, staged?: boolean, repoRoot?: string): Promise<RpcCommandResponse> {
        const result = await this.machineRpc(machineId, 'editor-git-diff-file', { path, repoRoot, filePath, staged }) as RpcCommandResponse | unknown
        if (!result || typeof result !== 'object') return { success: false, error: 'Unexpected editor-git-diff-file result' }
        return result as RpcCommandResponse
    }

    async editorGitStageFile(machineId: string, path: string, filePath: string, repoRoot?: string): Promise<RpcCommandResponse> {
        return await this.machineRpc(machineId, 'editor-git-stage-file', { path, repoRoot, filePath }) as RpcCommandResponse
    }

    async editorGitUnstageFile(machineId: string, path: string, filePath: string, repoRoot?: string): Promise<RpcCommandResponse> {
        return await this.machineRpc(machineId, 'editor-git-unstage-file', { path, repoRoot, filePath }) as RpcCommandResponse
    }

    async editorGitStageAll(machineId: string, path: string, repoRoot?: string): Promise<RpcCommandResponse> {
        return await this.machineRpc(machineId, 'editor-git-stage-all', { path, repoRoot }) as RpcCommandResponse
    }

    async editorGitUnstageAll(machineId: string, path: string, repoRoot?: string): Promise<RpcCommandResponse> {
        return await this.machineRpc(machineId, 'editor-git-unstage-all', { path, repoRoot }) as RpcCommandResponse
    }

    async editorGitCommit(machineId: string, path: string, message: string, repoRoot?: string): Promise<RpcCommandResponse> {
        return await this.machineRpc(machineId, 'editor-git-commit', { path, repoRoot, message }) as RpcCommandResponse
    }

    async editorGitPull(machineId: string, path: string, repoRoot?: string): Promise<RpcCommandResponse> {
        return await this.machineRpc(machineId, 'editor-git-pull', { path, repoRoot }) as RpcCommandResponse
    }

    async editorGitPush(machineId: string, path: string, repoRoot?: string): Promise<RpcCommandResponse> {
        return await this.machineRpc(machineId, 'editor-git-push', { path, repoRoot }) as RpcCommandResponse
    }
```

- [ ] **Step 4: Add sync engine pass-through methods**

In `hub/src/sync/syncEngine.ts`, add methods beside existing Editor methods:

```ts
    async getEditorGitStatusV2(machineId: string, path: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitStatusV2(machineId, path, repoRoot)
    }

    async getEditorGitDiffFile(machineId: string, path: string, filePath: string, staged?: boolean, repoRoot?: string) {
        return await this.rpcGateway.editorGitDiffFile(machineId, path, filePath, staged, repoRoot)
    }

    async stageEditorGitFile(machineId: string, path: string, filePath: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitStageFile(machineId, path, filePath, repoRoot)
    }

    async unstageEditorGitFile(machineId: string, path: string, filePath: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitUnstageFile(machineId, path, filePath, repoRoot)
    }

    async stageAllEditorGit(machineId: string, path: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitStageAll(machineId, path, repoRoot)
    }

    async unstageAllEditorGit(machineId: string, path: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitUnstageAll(machineId, path, repoRoot)
    }

    async commitEditorGit(machineId: string, path: string, message: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitCommit(machineId, path, message, repoRoot)
    }

    async pullEditorGit(machineId: string, path: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitPull(machineId, path, repoRoot)
    }

    async pushEditorGit(machineId: string, path: string, repoRoot?: string) {
        return await this.rpcGateway.editorGitPush(machineId, path, repoRoot)
    }
```

- [ ] **Step 5: Add route schemas and routes**

In `hub/src/web/routes/editor.ts`, add schemas:

```ts
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
```

Add routes using existing error style:

```ts
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
```

Add equivalent routes for `/editor/git-stage-file`, `/editor/git-unstage-file`, `/editor/git-stage-all`, `/editor/git-unstage-all`, `/editor/git-commit`, `/editor/git-pull`, `/editor/git-push`, each calling the matching sync engine method. Keep the existing `/editor/git-status` route until web callers are moved; remove it in Task 5 if no callers remain.

- [ ] **Step 6: Run hub tests**

```bash
cd hub && bun test src/sync/rpcGateway.editor.test.ts
cd hub && bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add hub/src/sync/rpcGateway.ts hub/src/sync/syncEngine.ts hub/src/web/routes/editor.ts hub/src/sync/rpcGateway.editor.test.ts
git commit -m "feat(hub): expose editor git routes"
```

## Task 3: Web API types, client methods, and query hooks

**Files:**
- Modify: `web/src/types/api.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/api/client.editor.test.ts`
- Modify: `web/src/lib/query-keys.ts`
- Create: `web/src/hooks/queries/useEditorGitStatus.ts`
- Create: `web/src/hooks/queries/useEditorGitDiff.ts`

- [ ] **Step 1: Add API client failing tests**

In `web/src/api/client.editor.test.ts`, add:

```ts
it('posts editor git status requests', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, state: 'notRepository', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0 }))
    const response = await client.getEditorGitStatusV2('machine-1', '/repo', '/repo')
    expect(response.state).toBe('notRepository')
    expect(fetchMock).toHaveBeenCalledWith('/api/editor/git-status-v2', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ machineId: 'machine-1', path: '/repo', repoRoot: '/repo' })
    }))
})

it('posts editor git mutation requests', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, stdout: '', stderr: '', exitCode: 0 }))
    await client.stageEditorGitFile('machine-1', '/repo', 'src/App.tsx', '/repo')
    await client.commitEditorGit('machine-1', '/repo', 'message', '/repo')
    expect(fetchMock).toHaveBeenCalledWith('/api/editor/git-stage-file', expect.objectContaining({ method: 'POST' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/editor/git-commit', expect.objectContaining({ method: 'POST' }))
})
```

- [ ] **Step 2: Run web API tests and verify failure**

```bash
cd web && bun test src/api/client.editor.test.ts
```

Expected: FAIL because methods are missing.

- [ ] **Step 3: Add Editor Git types**

In `web/src/types/api.ts`, add:

```ts
export type EditorGitRepositoryState = 'ready' | 'notRepository' | 'repoOutsideRoot' | 'detached' | 'initial'
export type EditorGitFileStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'conflicted'
export type EditorGitRepository = { root: string; name: string; branch: string | null; state: EditorGitRepositoryState; gitDir?: string }
export type EditorGitFile = {
    fileName: string
    filePath: string
    fullPath: string
    status: EditorGitFileStatus
    isStaged: boolean
    linesAdded: number
    linesRemoved: number
    oldPath?: string
}
export type EditorGitStatusV2Response = {
    success: boolean
    state: EditorGitRepositoryState
    repositories: EditorGitRepository[]
    activeRepository?: EditorGitRepository
    branch?: string | null
    upstream?: string
    ahead?: number
    behind?: number
    stagedFiles: EditorGitFile[]
    unstagedFiles: EditorGitFile[]
    totalStaged: number
    totalUnstaged: number
    error?: string
}
```

- [ ] **Step 4: Add client methods**

In `web/src/api/client.ts`, import `EditorGitStatusV2Response` and add:

```ts
    async getEditorGitStatusV2(machineId: string, projectPath: string, repoRoot?: string): Promise<EditorGitStatusV2Response> {
        return await this.request<EditorGitStatusV2Response>('/api/editor/git-status-v2', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot })
        })
    }

    async getEditorGitDiffFile(machineId: string, projectPath: string, filePath: string, staged?: boolean, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-diff-file', {
            method: 'POST',
            body: JSON.stringify({ machineId, path: projectPath, repoRoot, filePath, staged })
        })
    }

    async stageEditorGitFile(machineId: string, projectPath: string, filePath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-stage-file', { method: 'POST', body: JSON.stringify({ machineId, path: projectPath, repoRoot, filePath }) })
    }

    async unstageEditorGitFile(machineId: string, projectPath: string, filePath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-unstage-file', { method: 'POST', body: JSON.stringify({ machineId, path: projectPath, repoRoot, filePath }) })
    }

    async stageAllEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-stage-all', { method: 'POST', body: JSON.stringify({ machineId, path: projectPath, repoRoot }) })
    }

    async unstageAllEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-unstage-all', { method: 'POST', body: JSON.stringify({ machineId, path: projectPath, repoRoot }) })
    }

    async commitEditorGit(machineId: string, projectPath: string, message: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-commit', { method: 'POST', body: JSON.stringify({ machineId, path: projectPath, repoRoot, message }) })
    }

    async pullEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-pull', { method: 'POST', body: JSON.stringify({ machineId, path: projectPath, repoRoot }) })
    }

    async pushEditorGit(machineId: string, projectPath: string, repoRoot?: string): Promise<GitCommandResponse> {
        return await this.request<GitCommandResponse>('/api/editor/git-push', { method: 'POST', body: JSON.stringify({ machineId, path: projectPath, repoRoot }) })
    }
```

- [ ] **Step 5: Add query keys and hooks**

In `web/src/lib/query-keys.ts`, add:

```ts
    editorGitStatus: (machineId: string, projectPath: string, repoRoot?: string) => ['editor', 'git-status', machineId, projectPath, repoRoot ?? 'auto'] as const,
    editorGitDiff: (machineId: string, projectPath: string, filePath: string, staged?: boolean, repoRoot?: string) => ['editor', 'git-diff', machineId, projectPath, repoRoot ?? 'auto', filePath, staged ? 'staged' : 'unstaged'] as const,
```

Create `web/src/hooks/queries/useEditorGitStatus.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { EditorGitStatusV2Response } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useEditorGitStatus(api: ApiClient | null, machineId: string | null, projectPath: string | null, repoRoot?: string | null) {
    const resolvedMachineId = machineId ?? 'unknown'
    const resolvedProjectPath = projectPath ?? ''
    return useQuery<{ status: EditorGitStatusV2Response | null; error: string | null }>({
        queryKey: queryKeys.editorGitStatus(resolvedMachineId, resolvedProjectPath, repoRoot ?? undefined),
        enabled: Boolean(api && machineId && projectPath),
        queryFn: async () => {
            if (!api || !machineId || !projectPath) throw new Error('Missing editor project')
            const response = await api.getEditorGitStatusV2(machineId, projectPath, repoRoot ?? undefined)
            if (!response.success) return { status: response, error: response.error ?? 'Git status unavailable' }
            return { status: response, error: null }
        },
        refetchInterval: 5_000
    })
}
```

Create `web/src/hooks/queries/useEditorGitDiff.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useEditorGitDiff(api: ApiClient | null, machineId: string | null, projectPath: string | null, filePath: string | null, staged?: boolean, repoRoot?: string | null) {
    return useQuery({
        queryKey: queryKeys.editorGitDiff(machineId ?? 'unknown', projectPath ?? '', filePath ?? '', staged, repoRoot ?? undefined),
        enabled: Boolean(api && machineId && projectPath && filePath),
        queryFn: async () => {
            if (!api || !machineId || !projectPath || !filePath) throw new Error('Missing git diff target')
            return await api.getEditorGitDiffFile(machineId, projectPath, filePath, staged, repoRoot ?? undefined)
        }
    })
}
```

- [ ] **Step 6: Run web tests**

```bash
cd web && bun test src/api/client.editor.test.ts
cd web && bun run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

```bash
git add web/src/types/api.ts web/src/api/client.ts web/src/api/client.editor.test.ts web/src/lib/query-keys.ts web/src/hooks/queries/useEditorGitStatus.ts web/src/hooks/queries/useEditorGitDiff.ts
git commit -m "feat(web): add editor git api hooks"
```

## Task 4: Source Control panel component

**Files:**
- Create: `web/src/components/editor/EditorGitPanel.tsx`
- Create: `web/src/components/editor/EditorGitPanel.test.tsx`

- [ ] **Step 1: Add failing component tests**

Create `web/src/components/editor/EditorGitPanel.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditorGitPanel } from './EditorGitPanel'
import type { ApiClient } from '@/api/client'

function renderPanel(api: Partial<ApiClient>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
        <QueryClientProvider client={client}>
            <EditorGitPanel api={api as ApiClient} machineId="machine-1" projectPath="/repo" onOpenFile={vi.fn()} />
        </QueryClientProvider>
    )
}

describe('EditorGitPanel', () => {
    it('shows no repository empty state', async () => {
        renderPanel({ getEditorGitStatusV2: vi.fn().mockResolvedValue({ success: true, state: 'notRepository', repositories: [], stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0 }) })
        expect(await screen.findByText('No Git repository found')).toBeInTheDocument()
    })

    it('renders staged and unstaged groups and stages a file', async () => {
        const api = {
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                success: true,
                state: 'ready',
                repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' }],
                activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' },
                branch: 'main',
                ahead: 1,
                behind: 0,
                stagedFiles: [{ fileName: 'Added.tsx', filePath: 'src', fullPath: 'src/Added.tsx', status: 'added', isStaged: true, linesAdded: 10, linesRemoved: 0 }],
                unstagedFiles: [{ fileName: 'App.tsx', filePath: 'src', fullPath: 'src/App.tsx', status: 'modified', isStaged: false, linesAdded: 2, linesRemoved: 1 }],
                totalStaged: 1,
                totalUnstaged: 1
            }),
            stageEditorGitFile: vi.fn().mockResolvedValue({ success: true })
        }
        renderPanel(api)
        expect(await screen.findByText('Staged Changes')).toBeInTheDocument()
        expect(screen.getByText('Changes')).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Stage src/App.tsx' }))
        await waitFor(() => expect(api.stageEditorGitFile).toHaveBeenCalledWith('machine-1', '/repo', 'src/App.tsx', '/repo'))
    })

    it('requires commit message before committing', async () => {
        const api = {
            getEditorGitStatusV2: vi.fn().mockResolvedValue({ success: true, state: 'ready', repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' }], activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' }, stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0 }),
            commitEditorGit: vi.fn()
        }
        renderPanel(api)
        fireEvent.click(await screen.findByRole('button', { name: 'Commit staged changes' }))
        expect(await screen.findByText('Enter a commit message')).toBeInTheDocument()
        expect(api.commitEditorGit).not.toHaveBeenCalled()
    })
})
```

- [ ] **Step 2: Run test and verify failure**

```bash
cd web && bun test src/components/editor/EditorGitPanel.test.tsx
```

Expected: FAIL because component does not exist.

- [ ] **Step 3: Implement `EditorGitPanel.tsx`**

Create the component with Hapi theme classes:

```tsx
import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { EditorGitFile, EditorGitRepository } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'
import { useEditorGitStatus } from '@/hooks/queries/useEditorGitStatus'

function statusLabel(status: EditorGitFile['status']): string {
    if (status === 'added') return 'A'
    if (status === 'deleted') return 'D'
    if (status === 'renamed') return 'R'
    if (status === 'untracked') return '?'
    if (status === 'conflicted') return 'U'
    return 'M'
}

function statusColor(status: EditorGitFile['status']): string {
    if (status === 'added') return 'var(--app-git-staged-color)'
    if (status === 'deleted' || status === 'conflicted') return 'var(--app-git-deleted-color)'
    if (status === 'renamed') return 'var(--app-git-renamed-color)'
    if (status === 'untracked') return 'var(--app-git-untracked-color)'
    return 'var(--app-git-unstaged-color)'
}

function LineChanges(props: { added: number; removed: number }) {
    if (!props.added && !props.removed) return null
    return (
        <span className="flex shrink-0 items-center gap-1 font-mono text-[10px]">
            {props.added ? <span className="text-[var(--app-git-staged-color)]">+{props.added}</span> : null}
            {props.removed ? <span className="text-[var(--app-git-deleted-color)]">-{props.removed}</span> : null}
        </span>
    )
}

function FileRow(props: { file: EditorGitFile; actionLabel: string; onAction: () => void; onOpenFile: () => void }) {
    return (
        <div className="group flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-[var(--app-subtle-bg)]">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={props.onOpenFile}>
                <span className="w-4 shrink-0 text-center font-semibold" style={{ color: statusColor(props.file.status) }}>{statusLabel(props.file.status)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--app-fg)]">{props.file.fullPath}</span>
                <LineChanges added={props.file.linesAdded} removed={props.file.linesRemoved} />
            </button>
            <button type="button" aria-label={`${props.actionLabel} ${props.file.fullPath}`} className="rounded px-1.5 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]" onClick={props.onAction}>
                {props.actionLabel === 'Stage' ? '+' : '−'}
            </button>
        </div>
    )
}

function RepositorySelect(props: { repositories: EditorGitRepository[]; repoRoot: string | null; onChange: (repoRoot: string) => void }) {
    if (props.repositories.length <= 1) return null
    return (
        <select aria-label="Git repository" value={props.repoRoot ?? props.repositories[0]?.root ?? ''} onChange={(event) => props.onChange(event.target.value)} className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1 text-xs text-[var(--app-fg)]">
            {props.repositories.map((repo) => <option key={repo.root} value={repo.root}>{repo.name}</option>)}
        </select>
    )
}

export function EditorGitPanel(props: { api: ApiClient | null; machineId: string | null; projectPath: string | null; onOpenFile: (path: string) => void }) {
    const queryClient = useQueryClient()
    const [repoRoot, setRepoRoot] = useState<string | null>(null)
    const [message, setMessage] = useState('')
    const [actionError, setActionError] = useState<string | null>(null)
    const query = useEditorGitStatus(props.api, props.machineId, props.projectPath, repoRoot)
    const status = query.data?.status ?? null
    const activeRepoRoot = repoRoot ?? status?.activeRepository?.root ?? undefined

    const totalChanges = (status?.totalStaged ?? 0) + (status?.totalUnstaged ?? 0)
    const branchLabel = useMemo(() => {
        if (!status?.activeRepository) return 'No repository'
        const branch = status.branch ?? status.activeRepository.branch ?? (status.state === 'detached' ? 'detached HEAD' : 'initial')
        const ahead = status.ahead ? ` ↑${status.ahead}` : ''
        const behind = status.behind ? ` ↓${status.behind}` : ''
        return `${branch}${ahead}${behind}`
    }, [status])

    const invalidate = useCallback(async () => {
        if (!props.machineId || !props.projectPath) return
        await queryClient.invalidateQueries({ queryKey: queryKeys.editorGitStatus(props.machineId, props.projectPath, activeRepoRoot) })
        await queryClient.invalidateQueries({ queryKey: ['editor', 'directory', props.machineId] })
    }, [activeRepoRoot, props.machineId, props.projectPath, queryClient])

    const runAction = useCallback(async (fn: () => Promise<{ success: boolean; error?: string; stderr?: string }>) => {
        setActionError(null)
        const result = await fn()
        if (!result.success) {
            setActionError(result.error ?? result.stderr ?? 'Git command failed')
            return
        }
        await invalidate()
    }, [invalidate])

    if (!props.machineId || !props.projectPath) {
        return <div className="flex h-full items-center justify-center p-4 text-center text-xs text-[var(--app-hint)]">Select a machine and project to use Source Control</div>
    }
    if (query.isLoading && !status) {
        return <div className="p-3 text-xs text-[var(--app-hint)]">Loading Git status...</div>
    }
    if (status?.state === 'notRepository') {
        return <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[var(--app-hint)]"><div className="font-semibold text-[var(--app-fg)]">No Git repository found</div><div>Open a folder inside a Git repository to use Source Control.</div></div>
    }
    if (status?.state === 'repoOutsideRoot') {
        return <div className="p-3 text-xs text-red-500">{status.error ?? 'Repository root is outside editor scope. Open the repository root or expand the workspace root.'}</div>
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-[var(--app-bg)] text-[var(--app-fg)]">
            <div className="shrink-0 border-b border-[var(--app-border)] p-2">
                <div className="mb-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1 text-xs font-semibold">Source Control</div>
                    <button type="button" aria-label="Refresh Git status" className="rounded px-1.5 py-0.5 text-xs text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]" onClick={() => { void query.refetch() }}>↻</button>
                </div>
                <RepositorySelect repositories={status?.repositories ?? []} repoRoot={activeRepoRoot ?? null} onChange={setRepoRoot} />
                <div className="mt-2 truncate text-[11px] text-[var(--app-hint)]">⑂ {branchLabel}</div>
                <textarea aria-label="Commit message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Commit message" className="mt-2 h-16 w-full resize-none rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5 text-xs text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]" />
                <button type="button" aria-label="Commit staged changes" className="mt-2 w-full rounded-md bg-[var(--app-button)] px-3 py-1.5 text-xs font-semibold text-[var(--app-button-text)] disabled:opacity-50" disabled={!status || status.totalStaged === 0} onClick={() => {
                    if (!message.trim()) { setActionError('Enter a commit message'); return }
                    void runAction(async () => props.api!.commitEditorGit(props.machineId!, props.projectPath!, message.trim(), activeRepoRoot))
                }}>Commit</button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs hover:bg-[var(--app-subtle-bg)]" onClick={() => { void runAction(async () => props.api!.pullEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Pull</button>
                    <button type="button" className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs hover:bg-[var(--app-subtle-bg)]" onClick={() => { void runAction(async () => props.api!.pushEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Push</button>
                </div>
                {actionError ? <div className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500">{actionError}</div> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1">
                <div className="flex items-center gap-2 border-b border-[var(--app-divider)] px-2 py-1.5 text-xs font-semibold"><span>Staged Changes</span><span className="text-[var(--app-hint)]">{status?.totalStaged ?? 0}</span><span className="flex-1" /><button type="button" className="text-[10px] text-[var(--app-hint)]" onClick={() => { void runAction(async () => props.api!.unstageAllEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Unstage all</button></div>
                {(status?.stagedFiles ?? []).map((file) => <FileRow key={`staged-${file.fullPath}`} file={file} actionLabel="Unstage" onOpenFile={() => props.onOpenFile(file.fullPath)} onAction={() => { void runAction(async () => props.api!.unstageEditorGitFile(props.machineId!, props.projectPath!, file.fullPath, activeRepoRoot)) }} />)}
                <div className="flex items-center gap-2 border-y border-[var(--app-divider)] px-2 py-1.5 text-xs font-semibold"><span>Changes</span><span className="text-[var(--app-hint)]">{status?.totalUnstaged ?? 0}</span><span className="flex-1" /><button type="button" className="text-[10px] text-[var(--app-hint)]" onClick={() => { void runAction(async () => props.api!.stageAllEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Stage all</button></div>
                {(status?.unstagedFiles ?? []).map((file) => <FileRow key={`unstaged-${file.fullPath}`} file={file} actionLabel="Stage" onOpenFile={() => props.onOpenFile(file.fullPath)} onAction={() => { void runAction(async () => props.api!.stageEditorGitFile(props.machineId!, props.projectPath!, file.fullPath, activeRepoRoot)) }} />)}
                {totalChanges === 0 ? <div className="p-3 text-xs text-[var(--app-hint)]">No changes</div> : null}
            </div>
        </div>
    )
}
```

- [ ] **Step 4: Run component tests**

```bash
cd web && bun test src/components/editor/EditorGitPanel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```bash
git add web/src/components/editor/EditorGitPanel.tsx web/src/components/editor/EditorGitPanel.test.tsx
git commit -m "feat(web): add editor git panel"
```

## Task 5: Integrate Git panel into Editor layout

**Files:**
- Modify: `web/src/components/editor/EditorLayout.tsx`
- Modify: `web/src/components/editor/MobileEditorLayout.tsx`
- Modify: `web/src/components/editor/EditorLayout.test.tsx`
- Modify: `web/src/components/editor/MobileEditorLayout.test.tsx`

- [ ] **Step 1: Add layout tests for desktop tab switcher**

Update the `EditorFileTree` mock in `EditorLayout.test.tsx` to keep `data-testid="editor-file-tree"`. Add an `EditorGitPanel` mock:

```ts
vi.mock('./EditorGitPanel', () => ({
    EditorGitPanel: (props: { onOpenFile: (path: string) => void }) => (
        <div data-testid="editor-git-panel">
            GitPanel
            <button type="button" onClick={() => props.onOpenFile('/repo/src/GitFile.tsx')}>Open git file</button>
        </div>
    )
}))
```

Add test:

```ts
it('switches the desktop left pane between files and git', () => {
    renderEditorLayout({} as ApiClient)
    expect(screen.getByTestId('editor-file-tree')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Git source control' }))
    expect(screen.getByTestId('editor-git-panel')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open git file' }))
    expect(screen.getByTestId('editor-tabs')).toHaveTextContent('GitFile.tsx')
})
```

- [ ] **Step 2: Run layout test and verify failure**

```bash
cd web && bun test src/components/editor/EditorLayout.test.tsx
```

Expected: FAIL because switcher does not exist.

- [ ] **Step 3: Integrate desktop `Files | Git` switcher**

In `EditorLayout.tsx`, import:

```ts
import { EditorGitPanel } from './EditorGitPanel'
```

Add state:

```ts
const [leftPaneView, setLeftPaneView] = useState<'files' | 'git'>('files')
```

Replace the desktop left `<aside>` content with:

```tsx
<aside className="flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-[var(--app-border)]" style={{ width: panes.leftWidth }}>
    <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-[var(--app-border)] p-1">
        <button
            type="button"
            aria-label="Files tree"
            aria-current={leftPaneView === 'files' ? 'page' : undefined}
            className={`rounded-md px-2 py-1 text-xs font-semibold ${leftPaneView === 'files' ? 'bg-[var(--app-subtle-bg)] text-[var(--app-fg)]' : 'text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]'}`}
            onClick={() => setLeftPaneView('files')}
        >
            Files
        </button>
        <button
            type="button"
            aria-label="Git source control"
            aria-current={leftPaneView === 'git' ? 'page' : undefined}
            className={`rounded-md px-2 py-1 text-xs font-semibold ${leftPaneView === 'git' ? 'bg-[var(--app-subtle-bg)] text-[var(--app-fg)]' : 'text-[var(--app-hint)] hover:bg-[var(--app-subtle-bg)]'}`}
            onClick={() => setLeftPaneView('git')}
        >
            Git
        </button>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden">
        {leftPaneView === 'files' ? (
            <EditorFileTree
                api={props.api}
                machineId={editor.machineId}
                projectPath={editor.projectPath}
                onOpenFile={editor.openFile}
                onContextMenu={editor.showContextMenu}
                activeFilePath={activeFilePath}
                newFileTargetPath={newFileTargetPath}
                onCreateFile={handleCreateFile}
                onCancelNewFile={handleCancelNewFile}
            />
        ) : (
            <EditorGitPanel
                api={props.api}
                machineId={editor.machineId}
                projectPath={editor.projectPath}
                onOpenFile={(relativePath) => editor.openFile(editor.projectPath ? joinPath(editor.projectPath, relativePath) : relativePath)}
            />
        )}
    </div>
</aside>
```

- [ ] **Step 4: Add mobile Git view**

In `MobileEditorLayout.tsx`, import `EditorGitPanel` and change:

```ts
export type MobileEditorView = 'files' | 'editor' | 'git' | 'chat' | 'terminal'
```

In `BottomNav`, add Git item and use five columns:

```tsx
const items: Array<{ view: MobileEditorView; label: string; ariaLabel?: string; icon: string }> = [
    { view: 'files', label: 'Files', icon: '📁' },
    { view: 'editor', label: 'Editor', icon: '⌨️' },
    { view: 'git', label: 'Git', ariaLabel: 'Git source control', icon: '⑂' },
    { view: 'chat', label: 'Chat', icon: '💬' },
    { view: 'terminal', label: 'Term', ariaLabel: 'Terminal', icon: '▣' },
]
```

Change nav class to `grid-cols-5`.

In title/subtitle switches add:

```ts
case 'git':
    return 'Source Control'
```

and:

```ts
case 'git':
    return props.projectPath ?? 'Open a project'
```

In render surface switch, add:

```tsx
{view === 'git' ? (
    <EditorGitPanel
        api={props.api}
        machineId={props.machineId}
        projectPath={props.projectPath}
        onOpenFile={(relativePath) => {
            const fullPath = props.projectPath ? `${props.projectPath.replace(/\/+$/, '')}/${relativePath}` : relativePath
            props.onOpenFile(fullPath)
            handleViewChange('editor')
        }}
    />
) : null}
```

- [ ] **Step 5: Update mobile tests**

Mock `EditorGitPanel` in `MobileEditorLayout.test.tsx`:

```ts
vi.mock('./EditorGitPanel', () => ({
    EditorGitPanel: () => <div data-testid="mobile-git-panel">Git panel</div>
}))
```

Add:

```ts
it('opens the Git mobile view', () => {
    render(<MobileEditorLayout {...baseProps()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Git source control' }))
    expect(screen.getByTestId('mobile-git-panel')).toBeInTheDocument()
})
```

- [ ] **Step 6: Run layout tests**

```bash
cd web && bun test src/components/editor/EditorLayout.test.tsx src/components/editor/MobileEditorLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add web/src/components/editor/EditorLayout.tsx web/src/components/editor/MobileEditorLayout.tsx web/src/components/editor/EditorLayout.test.tsx web/src/components/editor/MobileEditorLayout.test.tsx
git commit -m "feat(web): integrate editor source control panel"
```

## Task 6: Cleanup compatibility route, polish, and full verification

**Files:**
- Modify: `cli/src/modules/editorRpc.ts`
- Modify: `hub/src/web/routes/editor.ts`
- Modify: `web/src/api/client.ts`
- Modify tests as required by cleanup.

- [ ] **Step 1: Remove old `editor-git-status` path if unused**

Run:

```bash
rg "editor-git-status|getEditorGitStatus\(" cli/src hub/src web/src
```

Expected remaining accepted references:

- `editor-git-status-v2`
- `getEditorGitStatusV2`

If old references remain in production code, replace them with v2 before deleting old handlers/routes.

- [ ] **Step 2: Remove old handler/route/client method**

Delete:

- `editor-git-status` handler in `cli/src/modules/editorRpc.ts`
- `/editor/git-status` route in `hub/src/web/routes/editor.ts`
- `getEditorGitStatus` in `web/src/api/client.ts` if no callers remain
- stale `EditorGitStatusResponse` type if replaced by `EditorGitStatusV2Response`

- [ ] **Step 3: Run targeted tests**

```bash
cd cli && bun test src/modules/editorRpc.test.ts
cd hub && bun test src/sync/rpcGateway.editor.test.ts
cd web && bun test src/api/client.editor.test.ts src/components/editor/EditorGitPanel.test.tsx src/components/editor/EditorLayout.test.tsx src/components/editor/MobileEditorLayout.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Run repo verification**

```bash
bun typecheck
bun run test
```

Expected: PASS. If a package has unrelated existing failures, capture the exact failure and verify the changed test targets pass.

- [ ] **Step 5: Manual smoke test**

Run:

```bash
bun run dev
```

In browser:

1. Open Hapi Editor.
2. Select a machine and a project that is a Git repository.
3. Click `Git` in the left pane.
4. Verify branch and changed files render.
5. Edit a file from the Files pane.
6. Return to Git pane and verify it appears under `Changes`.
7. Stage file, verify it moves to `Staged Changes`.
8. Commit with empty message, verify inline validation.
9. Commit with a real message, verify status becomes clean.
10. Open a non-Git folder, verify `No Git repository found` empty state.

- [ ] **Step 6: Commit cleanup**

```bash
git add cli/src hub/src web/src
git commit -m "chore: verify editor git source control"
```
