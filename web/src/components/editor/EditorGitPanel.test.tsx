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
        renderPanel({
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
})
