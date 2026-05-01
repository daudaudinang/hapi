import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ApiClient } from '@/api/client'
import type { EditorTab } from '@/hooks/useEditorState'
import type { EditorTreeItem } from '@/types/editor'
import { EditorChatPanel } from './EditorChatPanel'
import { EditorFileTree } from './EditorFileTree'
import { EditorTabs } from './EditorTabs'
import { EditorTerminal } from './EditorTerminal'

export type MobileEditorView = 'files' | 'editor' | 'chat' | 'terminal'

type MobileEditorLayoutProps = {
    api: ApiClient | null
    machineId: string | null
    projectPath: string | null
    fileTabs: EditorTab[]
    terminalTabs: EditorTab[]
    activeFileTab: EditorTab | null
    activeTerminalTab: EditorTab | null
    activeSessionId: string | null
    pendingDraftText?: string
    newFileTargetPath: string | null
    newSessionError: string | null
    onBackToAgents: () => void
    onBrowseProject: () => void
    onOpenFile: (path: string) => void
    onShowContextMenu: (filePath: string, x: number, y: number, items: EditorTreeItem[]) => void
    onCreateFile: (parentPath: string, fileName: string) => Promise<{ success: boolean; path?: string; error?: string } | unknown>
    onCancelNewFile: () => void
    onNewFileFromTabs: () => void
    onDirtyChange: (tabId: string, dirty: boolean) => void
    onAddSelectionToChat: (filePath: string, startLine: number, endLine: number, content: string) => void
    onSelectFileTab: (tabId: string) => void
    onCloseTab: (tabId: string) => void
    onOpenNewSessionModal: () => void
    onSessionResolved: (resolvedSessionId: string) => void
    onExpandDraft: (text: string) => string
    onDraftConsumed: () => void
    onOpenTerminal: () => void
    onSelectTerminalTab: (tabId: string) => void
    onCloseTerminalTab: (tabId: string) => void
    onAddTerminalToChat: (text: string) => void
    onRegisterTerminalClose: (tabId: string, close: (() => void) | null) => void
}

function getRelativeLabel(projectPath: string | null, path: string | null | undefined): string {
    if (!path) return ''
    if (!projectPath) return path

    const root = projectPath.replace(/\/+$/, '')
    if (path === root) {
        return path.split('/').filter(Boolean).pop() ?? path
    }
    if (path.startsWith(`${root}/`)) {
        return path.slice(root.length + 1)
    }
    return path
}

function MobileHeader(props: {
    title: string
    subtitle: string
    action: ReactNode
    onBackToAgents: () => void
}) {
    return (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-bg)] px-2 py-2">
            <button
                type="button"
                aria-label="Back to Agent Mode"
                className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                onClick={props.onBackToAgents}
            >
                ← Agents
            </button>
            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--app-fg)]">{props.title}</div>
                <div className="truncate text-xs text-[var(--app-hint)]">{props.subtitle}</div>
            </div>
            {props.action}
        </div>
    )
}

function BottomNav(props: { view: MobileEditorView; onViewChange: (view: MobileEditorView) => void }) {
    const items: Array<{ view: MobileEditorView; label: string; ariaLabel?: string; icon: string }> = [
        { view: 'files', label: 'Files', icon: '📁' },
        { view: 'editor', label: 'Editor', icon: '⌨️' },
        { view: 'chat', label: 'Chat', icon: '💬' },
        { view: 'terminal', label: 'Terminal', icon: '▣' },
    ]

    return (
        <nav aria-label="Mobile editor views" className="grid h-14 shrink-0 grid-cols-4 border-t border-[var(--app-border)] bg-[var(--app-bg)]">
            {items.map((item) => {
                const active = item.view === props.view
                return (
                    <button
                        key={item.view}
                        type="button"
                        aria-label={item.ariaLabel ?? item.label}
                        aria-current={active ? 'page' : undefined}
                        className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-xs ${active ? 'font-semibold text-[var(--app-fg)]' : 'text-[var(--app-hint)]'}`}
                        onClick={() => props.onViewChange(item.view)}
                    >
                        <span aria-hidden="true">{item.icon}</span>
                        <span>{item.label}</span>
                    </button>
                )
            })}
        </nav>
    )
}

export function MobileEditorLayout(props: MobileEditorLayoutProps) {
    const [view, setView] = useState<MobileEditorView>('files')
    const [selectionNoticeVisible, setSelectionNoticeVisible] = useState(false)
    const activeFilePath = props.activeFileTab?.path ?? null

    const title = useMemo(() => {
        switch (view) {
            case 'files':
                return 'HAPI Editor'
            case 'editor':
                return props.activeFileTab?.label ?? 'Editor'
            case 'chat':
                return 'Chat'
            case 'terminal':
                return 'Terminal'
        }
    }, [props.activeFileTab?.label, view])

    const subtitle = useMemo(() => {
        switch (view) {
            case 'files':
                return props.projectPath ?? 'Open a project'
            case 'editor':
                return getRelativeLabel(props.projectPath, props.activeFileTab?.path) || 'Open a file'
            case 'chat':
                return props.activeSessionId ? `Session ${props.activeSessionId.slice(0, 8)}` : 'No session selected'
            case 'terminal':
                return props.activeTerminalTab?.label ?? 'No terminal open'
        }
    }, [props.activeFileTab?.path, props.activeSessionId, props.activeTerminalTab?.label, props.projectPath, view])

    const handleOpenFile = useCallback((path: string) => {
        props.onOpenFile(path)
        setView('editor')
    }, [props.onOpenFile])

    const handleOpenTerminal = useCallback(() => {
        props.onOpenTerminal()
        setView('terminal')
    }, [props.onOpenTerminal])

    const handleAddSelectionToChat = useCallback((filePath: string, startLine: number, endLine: number, content: string) => {
        props.onAddSelectionToChat(filePath, startLine, endLine, content)
        setSelectionNoticeVisible(true)
    }, [props.onAddSelectionToChat])

    const headerAction = useMemo(() => {
        if (view === 'files') {
            return (
                <button
                    type="button"
                    className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                    onClick={props.onBrowseProject}
                >
                    Browse
                </button>
            )
        }
        if (view === 'editor') {
            return (
                <button
                    type="button"
                    aria-label="New file"
                    className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                    onClick={props.onNewFileFromTabs}
                >
                    +
                </button>
            )
        }
        if (view === 'chat') {
            return (
                <button
                    type="button"
                    aria-label="New chat session"
                    className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                    onClick={props.onOpenNewSessionModal}
                >
                    +
                </button>
            )
        }
        return (
            <button
                type="button"
                aria-label="Open terminal"
                className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]"
                onClick={handleOpenTerminal}
            >
                +
            </button>
        )
    }, [handleOpenTerminal, props.onBrowseProject, props.onNewFileFromTabs, props.onOpenNewSessionModal, view])

    return (
        <div data-testid="mobile-editor-layout" className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)]">
            <MobileHeader
                title={title}
                subtitle={subtitle}
                action={headerAction}
                onBackToAgents={props.onBackToAgents}
            />

            <div className="min-h-0 flex-1 overflow-hidden">
                {view === 'files' ? (
                    <EditorFileTree
                        api={props.api}
                        machineId={props.machineId}
                        projectPath={props.projectPath}
                        onOpenFile={handleOpenFile}
                        onContextMenu={props.onShowContextMenu}
                        activeFilePath={activeFilePath}
                        newFileTargetPath={props.newFileTargetPath}
                        onCreateFile={props.onCreateFile}
                        onCancelNewFile={props.onCancelNewFile}
                    />
                ) : null}

                {view === 'editor' ? (
                    <EditorTabs
                        api={props.api}
                        machineId={props.machineId}
                        tabs={props.fileTabs}
                        activeTabId={props.activeFileTab?.id ?? null}
                        onSelectTab={props.onSelectFileTab}
                        onCloseTab={props.onCloseTab}
                        onNewFile={props.onNewFileFromTabs}
                        onDirtyChange={props.onDirtyChange}
                        onAddSelectionToChat={handleAddSelectionToChat}
                        mobileMode={true}
                    />
                ) : null}

                {view === 'chat' ? (
                    <EditorChatPanel
                        api={props.api}
                        sessionId={props.activeSessionId}
                        pendingDraftText={props.pendingDraftText}
                        onDraftConsumed={props.onDraftConsumed}
                        onExpandDraft={props.onExpandDraft}
                        onSessionResolved={props.onSessionResolved}
                        onNewSessionRequested={props.onOpenNewSessionModal}
                    />
                ) : null}

                {view === 'terminal' ? (
                    <EditorTerminal
                        api={props.api}
                        tabs={props.terminalTabs}
                        activeTabId={props.activeTerminalTab?.id ?? null}
                        isCollapsed={false}
                        onSelectTab={props.onSelectTerminalTab}
                        onCloseTab={props.onCloseTerminalTab}
                        onOpenTerminal={handleOpenTerminal}
                        onToggleCollapsed={() => {}}
                        onAddToChat={props.onAddTerminalToChat}
                        onRegisterTerminalClose={props.onRegisterTerminalClose}
                        mobileMode={true}
                    />
                ) : null}
            </div>

            {selectionNoticeVisible ? (
                <div className="shrink-0 border-t border-[var(--app-border)] bg-[var(--app-subtle-bg)] px-3 py-2 text-xs text-[var(--app-fg)]">
                    <span>Selection added to chat draft</span>
                    <button
                        type="button"
                        className="ml-2 rounded-md px-2 py-1 text-xs font-semibold hover:bg-[var(--app-bg)]"
                        onClick={() => setView('chat')}
                    >
                        Open chat
                    </button>
                    <button
                        type="button"
                        className="ml-1 rounded-md px-2 py-1 text-xs text-[var(--app-hint)] hover:bg-[var(--app-bg)]"
                        onClick={() => setSelectionNoticeVisible(false)}
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}

            {props.newSessionError ? (
                <div className="shrink-0 border-t border-[var(--app-border)] px-3 py-2 text-xs text-red-500">
                    {props.newSessionError}
                </div>
            ) : null}

            <BottomNav view={view} onViewChange={setView} />
        </div>
    )
}
