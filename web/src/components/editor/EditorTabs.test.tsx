import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import type { EditorTab } from '@/hooks/useEditorState'
import { EditorTabs } from './EditorTabs'

const cmMocks = vi.hoisted(() => ({
    editorViews: [] as Array<{
        doc: string
        destroyed: boolean
        dispatch: ReturnType<typeof vi.fn>
        simulateChange: (content: string) => void
    }>,
    editableOf: vi.fn((value: boolean) => ({ type: 'editable', value })),
    updateListenerOf: vi.fn((callback: (update: { docChanged: boolean; state: { doc: { toString: () => string } } }) => void) => ({ type: 'update-listener', callback })),
    EditorView: vi.fn(function EditorView(this: { state: { doc: { toString: () => string; length: number } }; destroy: () => void; dispatch: ReturnType<typeof vi.fn> }, config: { doc?: string; parent?: Element; extensions?: unknown[] }) {
        const view = {
            doc: config.doc ?? '',
            destroyed: false,
            dispatch: vi.fn((payload: { changes?: { insert?: string } }) => {
                view.doc = payload.changes?.insert ?? view.doc
                const update = {
                    docChanged: true,
                    state: {
                        doc: {
                            toString: () => view.doc
                        }
                    }
                }
                for (const extension of config.extensions ?? []) {
                    if (extension && typeof extension === 'object' && 'type' in extension && extension.type === 'update-listener') {
                        (extension as unknown as { callback: (next: typeof update) => void }).callback(update)
                    }
                }
            }),
            simulateChange: (content: string) => {
                view.doc = content
                const update = {
                    docChanged: true,
                    state: {
                        doc: {
                            toString: () => content
                        },
                        selection: {
                            main: { from: 0, to: 0, empty: true }
                        }
                    }
                }
                for (const extension of config.extensions ?? []) {
                    if (extension && typeof extension === 'object' && 'type' in extension && extension.type === 'update-listener') {
                        (extension as unknown as { callback: (next: typeof update) => void }).callback(update)
                    }
                }
            }
        }
        cmMocks.editorViews.push(view)
        if (config.parent) {
            const marker = document.createElement('div')
            marker.dataset.testid = 'codemirror-view'
            config.parent.appendChild(marker)
        }
        this.state = {
            doc: {
                toString: () => view.doc,
                get length() {
                    return view.doc.length
                }
            }
        }
        this.dispatch = view.dispatch
        this.destroy = () => {
            view.destroyed = true
        }
    }),
    language: vi.fn((..._args: unknown[]) => 'language-extension')
}))

vi.mock('codemirror', () => {
    const editorView = cmMocks.EditorView as typeof cmMocks.EditorView & {
        editable: { of: ReturnType<typeof vi.fn> }
        updateListener: { of: ReturnType<typeof vi.fn> }
        theme: ReturnType<typeof vi.fn>
    }
    editorView.editable = { of: cmMocks.editableOf }
    editorView.updateListener = { of: cmMocks.updateListenerOf }
    editorView.theme = vi.fn(() => 'editor-theme')
    return {
        basicSetup: 'basic-setup',
        EditorView: cmMocks.EditorView
    }
})

vi.mock('@codemirror/theme-one-dark', () => ({ oneDark: 'one-dark' }))
vi.mock('@codemirror/lang-javascript', () => ({ javascript: (...args: unknown[]) => cmMocks.language('javascript', ...args) }))
vi.mock('@codemirror/lang-json', () => ({ json: (...args: unknown[]) => cmMocks.language('json', ...args) }))
vi.mock('@codemirror/lang-css', () => ({ css: (...args: unknown[]) => cmMocks.language('css', ...args) }))
vi.mock('@codemirror/lang-html', () => ({ html: (...args: unknown[]) => cmMocks.language('html', ...args) }))
vi.mock('@codemirror/lang-markdown', () => ({ markdown: (...args: unknown[]) => cmMocks.language('markdown', ...args) }))
vi.mock('@codemirror/lang-python', () => ({ python: (...args: unknown[]) => cmMocks.language('python', ...args) }))
vi.mock('@codemirror/lang-rust', () => ({ rust: (...args: unknown[]) => cmMocks.language('rust', ...args) }))
vi.mock('@codemirror/lang-go', () => ({ go: (...args: unknown[]) => cmMocks.language('go', ...args) }))

const useEditorFileMock = vi.fn()
vi.mock('@/hooks/queries/useEditorFile', () => ({
    useEditorFile: (...args: unknown[]) => useEditorFileMock(...args)
}))

vi.mock('@/components/assistant-ui/markdown-text', () => ({
    MARKDOWN_PLUGINS: [],
    MARKDOWN_REHYPE_PLUGINS: [],
    defaultComponents: {}
}))

vi.mock('@/components/assistant-ui/shiki-highlighter', () => ({
    SyntaxHighlighter: () => null
}))

vi.mock('@assistant-ui/react-markdown', () => ({
    MarkdownTextPrimitive: ({ children }: { children?: string }) => (
        <div data-testid="markdown-preview">{children}</div>
    )
}))

vi.mock('@assistant-ui/react', () => ({
    TextMessagePartProvider: ({ children, text }: { children: React.ReactNode; text: string }) => (
        <div data-testid="text-message-part-provider" data-text={text}>
            {children}
        </div>
    )
}))

const createObjectURLMock = vi.fn()
const revokeObjectURLMock = vi.fn()
Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, writable: true })
Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, writable: true })

const tabs: EditorTab[] = [
    { id: 'tab-file', type: 'file', path: '/repo/src/App.tsx', label: 'App.tsx' },
    { id: 'tab-terminal', type: 'terminal', label: 'Terminal: bash', shell: 'bash' }
]

describe('EditorTabs', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        cmMocks.editorViews.length = 0
        cmMocks.editableOf.mockClear()
        cmMocks.updateListenerOf.mockClear()
        useEditorFileMock.mockReturnValue({ content: 'console.log("hi")', error: null, isLoading: false, refetch: vi.fn() })
    })

    afterEach(() => {
        cleanup()
    })

    it('shows an empty state when no tab is active', () => {
        render(
            <EditorTabs
                api={null}
                machineId={null}
                tabs={[]}
                activeTabId={null}
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        expect(screen.getByText('Open a file from the explorer')).toBeInTheDocument()
    })

    it('renders only file tabs and emits select, close, and new file actions', () => {
        const onSelectTab = vi.fn()
        const onCloseTab = vi.fn()
        const onNewFile = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={onSelectTab}
                onCloseTab={onCloseTab}
                onNewFile={onNewFile}
            saveRef={{ current: null }}
            />
        )

        expect(screen.queryByRole('button', { name: 'Select tab Terminal: bash' })).not.toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Close tab App.tsx' }))
        expect(onCloseTab).toHaveBeenCalledWith('tab-file')
        expect(onSelectTab).not.toHaveBeenCalledWith('tab-file')

        fireEvent.click(screen.getByRole('button', { name: 'New File' }))
        expect(onNewFile).toHaveBeenCalledWith()
    })

    it('hides the tabbar new file button in mobile mode', () => {
        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                mobileMode
            saveRef={{ current: null }}
            />
        )

        expect(screen.queryByRole('button', { name: 'New File' })).not.toBeInTheDocument()
    })

    it('loads active file content into an editable CodeMirror view', async () => {
        const api = {} as ApiClient

        render(
            <EditorTabs
                api={api}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(cmMocks.EditorView).toHaveBeenCalled()
        })
        expect(useEditorFileMock).toHaveBeenCalledWith(api, 'machine-1', '/repo/src/App.tsx', { refetchInterval: 2_000 })
        expect(cmMocks.editorViews[0].doc).toBe('console.log("hi")')
        expect(screen.getByTestId('codemirror-view')).toBeInTheDocument()
        expect(screen.getByText('TSX', { selector: 'div' })).toBeInTheDocument()
        expect(cmMocks.editableOf).toHaveBeenCalledWith(true)
        expect(cmMocks.language).toHaveBeenCalledWith('javascript', { jsx: true, typescript: true })
    })

    it('marks the active file tab dirty when CodeMirror content changes', async () => {
        const onDirtyChange = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                onDirtyChange={onDirtyChange}
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(cmMocks.editorViews[0]).toBeDefined()
        })
        cmMocks.editorViews[0].simulateChange('console.log("changed")')

        expect(onDirtyChange).toHaveBeenCalledWith('tab-file', true)
    })

    it('does not mark a clean tab dirty when file content refreshes from disk', async () => {
        const onDirtyChange = vi.fn()
        let fileResult = { content: 'console.log("v1")', error: null, isLoading: false, refetch: vi.fn() }
        useEditorFileMock.mockImplementation(() => fileResult)
        const { rerender } = render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                onDirtyChange={onDirtyChange}
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(cmMocks.editorViews[0]).toBeDefined()
        })
        fileResult = { content: 'console.log("v2")', error: null, isLoading: false, refetch: vi.fn() }

        rerender(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                onDirtyChange={onDirtyChange}
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(cmMocks.editorViews[0].doc).toBe('console.log("v2")')
        })
        expect(onDirtyChange).not.toHaveBeenCalled()
    })

    it('shows a dirty marker and save button for dirty file tabs', () => {
        const api = {} as ApiClient
        render(
            <EditorTabs
                api={api}
                machineId="machine-1"
                tabs={[{ ...tabs[0], dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        expect(screen.getByText('●')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Save App.tsx' })).toBeInTheDocument()
        expect(useEditorFileMock).toHaveBeenCalledWith(api, 'machine-1', '/repo/src/App.tsx', { refetchInterval: false })
    })

    it('saves the active file with Ctrl+S and clears dirty state on success', async () => {
        const onSaveFile = vi.fn(async () => {})
        const onDirtyChange = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ ...tabs[0], dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                onDirtyChange={onDirtyChange}
                saveRef={{ current: null }}
                onSaveFile={onSaveFile}
            />
        )

        await waitFor(() => {
            expect(cmMocks.editorViews[0]).toBeDefined()
        })
        fireEvent.keyDown(window, { key: 's', ctrlKey: true })

        await waitFor(() => {
            expect(onSaveFile).toHaveBeenCalledWith('/repo/src/App.tsx', 'console.log("hi")')
        })
        expect(onDirtyChange).toHaveBeenCalledWith('tab-file', false)
    })

    it('shows a save error when saving fails', async () => {
        const onSaveFile = vi.fn(async () => {
            throw new Error('disk full')
        })

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ ...tabs[0], dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                onSaveFile={onSaveFile}
            saveRef={{ current: null }}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Save App.tsx' }))

        expect(await screen.findByText('disk full')).toBeInTheDocument()
    })


    it('asks before closing a dirty mobile tab and cancels without closing', async () => {
        const onCloseTab = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ ...tabs[0], dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onNewFile={vi.fn()}
                mobileMode
            saveRef={{ current: null }}
            />
        )

        const tabBar = screen.getByTestId('editor-tabs-tabbar')
        expect(tabBar).toHaveClass('bg-[var(--app-secondary-bg)]')
        expect(screen.getByRole('button', { name: 'Select tab App.tsx' })).toHaveClass('px-2')

        fireEvent.click(screen.getByRole('button', { name: 'Close tab App.tsx' }))

        const dialog = await screen.findByRole('dialog', { name: 'Close unsaved tab?' })
        expect(dialog).toBeInTheDocument()
        expect(onCloseTab).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

        await waitFor(() => {
            expect(screen.queryByRole('dialog', { name: 'Close unsaved tab?' })).not.toBeInTheDocument()
        })
        expect(onCloseTab).not.toHaveBeenCalled()
    })

    it('discards a dirty mobile tab before closing', async () => {
        const onCloseTab = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ ...tabs[0], dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onNewFile={vi.fn()}
                mobileMode
            saveRef={{ current: null }}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Close tab App.tsx' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Discard changes' }))

        expect(onCloseTab).toHaveBeenCalledWith('tab-file')
    })

    it('saves a dirty mobile tab before closing', async () => {
        let finishSave!: () => void
        const onSaveFile = vi.fn(() => new Promise<void>((resolve) => {
            finishSave = resolve
        }))
        const onDirtyChange = vi.fn()
        const onCloseTab = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={[{ ...tabs[0], dirty: true }]}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={onCloseTab}
                onNewFile={vi.fn()}
                onDirtyChange={onDirtyChange}
                onSaveFile={onSaveFile}
                mobileMode
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(cmMocks.editorViews[0]).toBeDefined()
        })
        cmMocks.editorViews[0].simulateChange('console.log("mobile")')

        fireEvent.click(screen.getByRole('button', { name: 'Close tab App.tsx' }))
        fireEvent.click(await screen.findByRole('button', { name: 'Save then close' }))

        await waitFor(() => {
            expect(onSaveFile).toHaveBeenCalledWith('/repo/src/App.tsx', 'console.log("mobile")')
        })
        expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()

        finishSave()

        await waitFor(() => {
            expect(onCloseTab).toHaveBeenCalledWith('tab-file')
        })
        expect(onDirtyChange).toHaveBeenCalledWith('tab-file', false)
    })

    it('keeps the editor viewport constrained so CodeMirror owns scrolling', async () => {
        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId('editor-tabs-content')).toBeInTheDocument()
        })

        expect(screen.getByTestId('editor-tabs-root')).toHaveClass('overflow-hidden')
        expect(screen.getByTestId('editor-tabs-content')).toHaveClass('overflow-hidden')
        expect(screen.getByTestId('codemirror-host')).toHaveClass('h-full', 'min-h-0', 'overflow-hidden')
    })

    it('mounts CodeMirror when content arrives after the loading state', async () => {
        useEditorFileMock.mockReturnValueOnce({ content: null, error: null, isLoading: true, refetch: vi.fn() })
        const api = {} as ApiClient
        const { rerender } = render(
            <EditorTabs
                api={api}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        expect(screen.getByText('Loading...')).toBeInTheDocument()
        expect(cmMocks.EditorView).not.toHaveBeenCalled()

        rerender(
            <EditorTabs
                api={api}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(cmMocks.EditorView).toHaveBeenCalled()
        })
        expect(cmMocks.editorViews[0].doc).toBe('console.log("hi")')
        expect(screen.getByTestId('codemirror-view')).toBeInTheDocument()
    })

    it('shows file loading and error states instead of CodeMirror', () => {
        useEditorFileMock.mockReturnValueOnce({ content: null, error: null, isLoading: true, refetch: vi.fn() })
        const { rerender } = render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        expect(screen.getByText('Loading...')).toBeInTheDocument()

        useEditorFileMock.mockReturnValueOnce({ content: null, error: 'Cannot read binary file', isLoading: false, refetch: vi.fn() })
        rerender(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-file"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        expect(screen.getByText('Cannot read binary file')).toBeInTheDocument()
    })

    it('keeps the file editor visible when the global active tab is a terminal', async () => {
        render(
            <EditorTabs
                api={null}
                machineId="machine-1"
                tabs={tabs}
                activeTabId="tab-terminal"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
            saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(cmMocks.EditorView).toHaveBeenCalled()
        })
        expect(screen.queryByText('Terminal panel below')).not.toBeInTheDocument()
        expect(useEditorFileMock).toHaveBeenCalledWith(null, 'machine-1', '/repo/src/App.tsx', { refetchInterval: 2_000 })
    })
})

describe('EditorTabs preview', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        cmMocks.editorViews.length = 0
        useEditorFileMock.mockReturnValue({ content: '# Hello\n\nWorld', error: null, isLoading: false, refetch: vi.fn() })
        createObjectURLMock.mockReturnValue('blob:test-url')
    })

    afterEach(() => {
        cleanup()
    })

    it('shows Source/Preview toggle for .md files', () => {
        const mdTabs: EditorTab[] = [
            { id: 'tab-md', type: 'file', path: '/repo/README.md', label: 'README.md' }
        ]
        const setTabViewMode = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={mdTabs}
                activeTabId="tab-md"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                setTabViewMode={setTabViewMode}
                saveRef={{ current: null }}
            />
        )

        expect(screen.getByRole('button', { name: 'Source' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    })

    it('shows toggle for .markdown files', () => {
        const markdownTabs: EditorTab[] = [
            { id: 'tab-mkd', type: 'file', path: '/repo/DOCS.markdown', label: 'DOCS.markdown' }
        ]

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={markdownTabs}
                activeTabId="tab-mkd"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                setTabViewMode={vi.fn()}
                saveRef={{ current: null }}
            />
        )

        expect(screen.getByRole('button', { name: 'Source' })).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    })

    it('does NOT show toggle for .ts files', () => {
        const tsTabs: EditorTab[] = [
            { id: 'tab-ts', type: 'file', path: '/repo/src/index.ts', label: 'index.ts' }
        ]

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={tsTabs}
                activeTabId="tab-ts"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                setTabViewMode={vi.fn()}
                saveRef={{ current: null }}
            />
        )

        expect(screen.queryByRole('button', { name: 'Source' })).not.toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument()
    })

    it('calls setTabViewMode when clicking Preview toggle', () => {
        const mdTabs: EditorTab[] = [
            { id: 'tab-md', type: 'file', path: '/repo/README.md', label: 'README.md' }
        ]
        const setTabViewMode = vi.fn()

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={mdTabs}
                activeTabId="tab-md"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                setTabViewMode={setTabViewMode}
                saveRef={{ current: null }}
            />
        )

        fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
        expect(setTabViewMode).toHaveBeenCalledWith('tab-md', 'preview')
    })

    it('renders markdown preview in preview mode', async () => {
        const mdTabs: EditorTab[] = [
            { id: 'tab-md', type: 'file', path: '/repo/README.md', label: 'README.md', viewMode: 'preview' }
        ]

        render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={mdTabs}
                activeTabId="tab-md"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                setTabViewMode={vi.fn()}
                saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
        })
        expect(screen.getByTestId('text-message-part-provider')).toBeInTheDocument()
    })

    it('renders image preview for .png files', async () => {
        const getEditorFileRawBlob = vi.fn()
        getEditorFileRawBlob.mockResolvedValue(new Blob(['fake-image'], { type: 'image/png' }))

        const imgTabs: EditorTab[] = [
            { id: 'tab-img', type: 'file', path: '/repo/logo.png', label: 'logo.png' }
        ]

        render(
            <EditorTabs
                api={{ getEditorFileRawBlob } as unknown as ApiClient}
                machineId="machine-1"
                tabs={imgTabs}
                activeTabId="tab-img"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(getEditorFileRawBlob).toHaveBeenCalledWith('machine-1', '/repo/logo.png')
        })
        expect(createObjectURLMock).toHaveBeenCalled()
    })

    it('shows error state for failed image load', async () => {
        const getEditorFileRawBlob = vi.fn()
        getEditorFileRawBlob.mockRejectedValue({ status: 500 })

        const imgTabs: EditorTab[] = [
            { id: 'tab-img', type: 'file', path: '/repo/broken.jpg', label: 'broken.jpg' }
        ]

        render(
            <EditorTabs
                api={{ getEditorFileRawBlob } as unknown as ApiClient}
                machineId="machine-1"
                tabs={imgTabs}
                activeTabId="tab-img"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(screen.getByText('Could not load image')).toBeInTheDocument()
        })
    })

    it('toggles between source and preview per markdown tab', async () => {
        const mdTabs: EditorTab[] = [
            { id: 'tab-a', type: 'file', path: '/repo/A.md', label: 'A.md', viewMode: 'preview' },
            { id: 'tab-b', type: 'file', path: '/repo/B.md', label: 'B.md' }
        ]
        const setTabViewMode = vi.fn()

        const { rerender } = render(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={mdTabs}
                activeTabId="tab-a"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                setTabViewMode={setTabViewMode}
                saveRef={{ current: null }}
            />
        )

        // tab-a is in preview mode → markdown preview visible
        await waitFor(() => {
            expect(screen.getByTestId('markdown-preview')).toBeInTheDocument()
        })

        // Switch active tab to tab-b (source mode) → preview hidden
        rerender(
            <EditorTabs
                api={{} as ApiClient}
                machineId="machine-1"
                tabs={mdTabs}
                activeTabId="tab-b"
                onSelectTab={vi.fn()}
                onCloseTab={vi.fn()}
                onNewFile={vi.fn()}
                setTabViewMode={setTabViewMode}
                saveRef={{ current: null }}
            />
        )

        await waitFor(() => {
            expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument()
        })
        expect(screen.getByTestId('codemirror-host')).toBeInTheDocument()
    })
})
