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
        branches: [{ name: 'main', isCurrent: true }, { name: 'feature-a', isCurrent: false }],
        currentBranch: 'main'
    })
}

describe('EditorGitPanel', () => {
    afterEach(() => { cleanup() })
    it('shows no repository empty state', async () => {
        renderPanel({
            ...defaultBranches,
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
            ...defaultBranches,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                success: true,
                state: 'ready',
                repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' }],
                activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' },
                stagedFiles: [],
                unstagedFiles: [],
                totalStaged: 0,
                totalUnstaged: 0
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
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                success: true,
                state: 'ready',
                repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' }],
                activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' },
                branch: 'main',
                ahead: 0,
                behind: 0,
                stagedFiles: [],
                unstagedFiles: [],
                totalStaged: 0,
                totalUnstaged: 0
            })
        })
        expect(await screen.findByText('main')).toBeInTheDocument()
    })

    it('opens branch picker and shows branches', async () => {
        renderPanel({
            ...defaultBranches,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                success: true,
                state: 'ready',
                repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' }],
                activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' },
                branch: 'main',
                ahead: 0,
                behind: 0,
                stagedFiles: [],
                unstagedFiles: [],
                totalStaged: 0,
                totalUnstaged: 0
            })
        })
        fireEvent.click(await screen.findByRole('button', { name: 'Select branch' }))
        expect(await screen.findByText('feature-a')).toBeInTheDocument()
    })

    it('switches branch on click', async () => {
        const api = {
            ...defaultBranches,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                success: true,
                state: 'ready',
                repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' }],
                activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' },
                branch: 'main',
                ahead: 0,
                behind: 0,
                stagedFiles: [],
                unstagedFiles: [],
                totalStaged: 0,
                totalUnstaged: 0
            }),
            checkoutEditorGitBranch: vi.fn().mockResolvedValue({ success: true })
        }
        renderPanel(api)
        fireEvent.click(await screen.findByRole('button', { name: 'Select branch' }))
        fireEvent.click(await screen.findByText('feature-a'))
        await waitFor(() => expect(api.checkoutEditorGitBranch).toHaveBeenCalledWith('machine-1', '/repo', 'feature-a', '/repo'))
    })

    it('creates a new branch', async () => {
        const api = {
            ...defaultBranches,
            getEditorGitStatusV2: vi.fn().mockResolvedValue({
                success: true,
                state: 'ready',
                repositories: [{ root: '/repo', name: 'repo', branch: 'main', state: 'ready' }],
                activeRepository: { root: '/repo', name: 'repo', branch: 'main', state: 'ready' },
                branch: 'main',
                ahead: 0,
                behind: 0,
                stagedFiles: [],
                unstagedFiles: [],
                totalStaged: 0,
                totalUnstaged: 0
            }),
            createEditorGitBranch: vi.fn().mockResolvedValue({ success: true })
        }
        renderPanel(api)
        const input = await screen.findByRole('textbox', { name: 'New branch name' })
        fireEvent.change(input, { target: { value: 'feature-b' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create branch' }))
        await waitFor(() => expect(api.createEditorGitBranch).toHaveBeenCalledWith('machine-1', '/repo', 'feature-b', '/repo'))
    })
})
