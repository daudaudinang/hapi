import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const defaultBranches = {
    listEditorGitBranches: vi.fn().mockResolvedValue({
        success: true,
        branches: [{ name: 'main', isCurrent: true }],
        currentBranch: 'main'
    })
}

const defaultStashes = {
    listEditorGitStashes: vi.fn().mockResolvedValue({
        success: true,
        stashes: []
    })
}

const readyStatus = {
    success: true,
    state: 'ready' as const,
    repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' as const }],
    activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' as const },
    branch: 'main',
    ahead: 0,
    behind: 0,
    stagedFiles: [{ fileName: 'Added.tsx', filePath: 'src', fullPath: 'src/Added.tsx', status: 'added' as const, isStaged: true, linesAdded: 10, linesRemoved: 0 }],
    unstagedFiles: [{ fileName: 'App.tsx', filePath: 'src', fullPath: 'src/App.tsx', status: 'modified' as const, isStaged: false, linesAdded: 2, linesRemoved: 1 }],
    totalStaged: 1,
    totalUnstaged: 1
}

describe('EditorGitPanel', () => {
    afterEach(() => { cleanup() })

    it('shows no repository empty state', async () => {
        renderPanel({
            ...defaultBranches,
            ...defaultStashes,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                success: true,
                state: 'notRepository',
                repositories: [],
                stagedFiles: [],
                unstagedFiles: [],
                totalStaged: 0,
                totalUnstaged: 0
            })
        })
        expect(await screen.findByText('No Git repository found')).toBeInTheDocument()
    })

    it('renders staged and unstaged groups and stages a file', async () => {
        const api = {
            ...defaultBranches,
            ...defaultStashes,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({ ...readyStatus, ahead: 1 }),
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
            ...defaultBranches,
            ...defaultStashes,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                ...readyStatus, stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0
            }),
            commitEditorGit: vi.fn()
        }
        renderPanel(api)
        fireEvent.click(await screen.findByRole('button', { name: 'Commit staged changes' }))
        expect(await screen.findByText('Enter a commit message')).toBeInTheDocument()
        expect(api.commitEditorGit).not.toHaveBeenCalled()
    })

    it('shows branch picker with current branch', async () => {
        renderPanel({
            ...defaultBranches,
            ...defaultStashes,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                ...readyStatus, stagedFiles: [], unstagedFiles: [], totalStaged: 0, totalUnstaged: 0
            })
        })
        expect(await screen.findByText('main')).toBeInTheDocument()
    })

    it('shows discard button and confirms discard', async () => {
        const api = {
            ...defaultBranches,
            ...defaultStashes,
            getEditorGitStatusV2: vi.fn().mockResolvedValue(readyStatus),
            discardEditorGitFile: vi.fn().mockResolvedValue({ success: true })
        }
        renderPanel(api)
        const discardBtn = await screen.findByRole('button', { name: 'Discard changes to src/App.tsx' })
        expect(discardBtn).toBeInTheDocument()
        fireEvent.click(discardBtn)
        expect(await screen.findByText(/Discard changes to/)).toBeInTheDocument()
        fireEvent.click(screen.getByText('Discard'))
        await waitFor(() => expect(api.discardEditorGitFile).toHaveBeenCalledWith('machine-1', '/repo', 'src/App.tsx', '/repo'))
    })

    it('shows stash section with Stash all button', async () => {
        const api = {
            ...defaultBranches,
            getEditorGitStatusV2: vi.fn().mockResolvedValue(readyStatus),
            listEditorGitStashes: vi.fn().mockResolvedValue({
                success: true,
                stashes: []
            }),
            stashPushEditorGit: vi.fn().mockResolvedValue({ success: true }),
            stashPopEditorGit: vi.fn().mockResolvedValue({ success: true })
        }
        renderPanel(api)
        expect(await screen.findByText('Stashes')).toBeInTheDocument()
        expect(screen.getByRole("button", { name: "Stash all" })).toBeInTheDocument()
        fireEvent.click(screen.getByRole('button', { name: 'Stash all' }))
        await waitFor(() => expect(api.stashPushEditorGit).toHaveBeenCalled())
    })
})
