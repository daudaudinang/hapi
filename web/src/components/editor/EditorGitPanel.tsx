// TODO: Inline diff viewer — useEditorGitDiff hook and /api/editor/git-diff-file endpoint are ready; add click-to-expand diff in FileRow
import { useCallback, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { EditorGitFile, EditorGitRepository } from '@/types/api'
import { useEditorGitStatus } from '@/hooks/queries/useEditorGitStatus'
import { queryKeys } from '@/lib/query-keys'

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

function FileRow(props: {
    file: EditorGitFile
    actionLabel: 'Stage' | 'Unstage'
    onAction: () => void
    onOpenFile: () => void
}) {
    return (
        <div className="group flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-[var(--app-subtle-bg)]">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={props.onOpenFile}>
                <span className="w-4 shrink-0 text-center font-semibold" style={{ color: statusColor(props.file.status) }}>{statusLabel(props.file.status)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--app-fg)]">{props.file.fullPath}</span>
                <LineChanges added={props.file.linesAdded} removed={props.file.linesRemoved} />
            </button>
            <button
                type="button"
                aria-label={`${props.actionLabel} ${props.file.fullPath}`}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--app-hint)] hover:bg-[var(--app-secondary-bg)] hover:text-[var(--app-fg)]"
                onClick={props.onAction}
            >
                {props.actionLabel === 'Stage' ? '+' : '−'}
            </button>
        </div>
    )
}

function RepositorySelect(props: {
    repositories: EditorGitRepository[]
    repoRoot: string | null
    onChange: (repoRoot: string) => void
}) {
    if (props.repositories.length <= 1) return null
    return (
        <select
            aria-label="Git repository"
            value={props.repoRoot ?? props.repositories[0]?.root ?? ''}
            onChange={(event) => props.onChange(event.target.value)}
            className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1 text-xs text-[var(--app-fg)]"
        >
            {props.repositories.map((repo) => <option key={repo.root} value={repo.root}>{repo.name}</option>)}
        </select>
    )
}

export function EditorGitPanel(props: {
    api: ApiClient | null
    machineId: string | null
    projectPath: string | null
    onOpenFile: (path: string) => void
}) {
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
        await queryClient.invalidateQueries({ queryKey: queryKeys.editorGitStatusBase(props.machineId, props.projectPath) })
        await queryClient.invalidateQueries({ queryKey: queryKeys.editorDirectoryBase(props.machineId) })
    }, [props.machineId, props.projectPath, queryClient])

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
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[var(--app-hint)]">
                <div className="font-semibold text-[var(--app-fg)]">No Git repository found</div>
                <div>Open a folder inside a Git repository to use Source Control.</div>
            </div>
        )
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
                <textarea
                    aria-label="Commit message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Commit message"
                    className="mt-2 h-16 w-full resize-none rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-1.5 text-xs text-[var(--app-fg)] outline-none focus:border-[var(--app-link)]"
                />
                <button
                    type="button"
                    aria-label="Commit staged changes"
                    className="mt-2 w-full rounded-md bg-[var(--app-button)] px-3 py-1.5 text-xs font-semibold text-[var(--app-button-text)] disabled:opacity-50"
                    disabled={!status || !props.api}
                    onClick={() => {
                        if (!message.trim()) {
                            setActionError('Enter a commit message')
                            return
                        }
                        void runAction(async () => props.api!.commitEditorGit(props.machineId!, props.projectPath!, message.trim(), activeRepoRoot))
                    }}
                >
                    Commit
                </button>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs hover:bg-[var(--app-subtle-bg)]" disabled={!props.api} onClick={() => { void runAction(async () => props.api!.pullEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Pull</button>
                    <button type="button" className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs hover:bg-[var(--app-subtle-bg)]" disabled={!props.api} onClick={() => { void runAction(async () => props.api!.pushEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Push</button>
                </div>
                {actionError ? <div className="mt-2 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-500">{actionError}</div> : null}
            </div>
            <div className="min-h-0 flex-1 overflow-auto py-1">
                <div className="flex items-center gap-2 border-b border-[var(--app-divider)] px-2 py-1.5 text-xs font-semibold">
                    <span>Staged Changes</span>
                    <span className="text-[var(--app-hint)]">{status?.totalStaged ?? 0}</span>
                    <span className="flex-1" />
                    <button type="button" className="text-[10px] text-[var(--app-hint)]" disabled={!props.api} onClick={() => { void runAction(async () => props.api!.unstageAllEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Unstage all</button>
                </div>
                {(status?.stagedFiles ?? []).map((file) => (
                    <FileRow
                        key={`staged-${file.fullPath}`}
                        file={file}
                        actionLabel="Unstage"
                        onOpenFile={() => props.onOpenFile(file.fullPath)}
                        onAction={() => { void runAction(async () => props.api!.unstageEditorGitFile(props.machineId!, props.projectPath!, file.fullPath, activeRepoRoot)) }}
                    />
                ))}
                <div className="flex items-center gap-2 border-y border-[var(--app-divider)] px-2 py-1.5 text-xs font-semibold">
                    <span>Changes</span>
                    <span className="text-[var(--app-hint)]">{status?.totalUnstaged ?? 0}</span>
                    <span className="flex-1" />
                    <button type="button" className="text-[10px] text-[var(--app-hint)]" disabled={!props.api} onClick={() => { void runAction(async () => props.api!.stageAllEditorGit(props.machineId!, props.projectPath!, activeRepoRoot)) }}>Stage all</button>
                </div>
                {(status?.unstagedFiles ?? []).map((file) => (
                    <FileRow
                        key={`unstaged-${file.fullPath}`}
                        file={file}
                        actionLabel="Stage"
                        onOpenFile={() => props.onOpenFile(file.fullPath)}
                        onAction={() => { void runAction(async () => props.api!.stageEditorGitFile(props.machineId!, props.projectPath!, file.fullPath, activeRepoRoot)) }}
                    />
                ))}
                {totalChanges === 0 ? <div className="p-3 text-xs text-[var(--app-hint)]">No changes</div> : null}
            </div>
        </div>
    )
}
