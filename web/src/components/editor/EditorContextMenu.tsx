import { useEffect, useRef } from 'react'
import type { EditorTreeItem } from '@/types/editor'

export function EditorContextMenu(props: {
    filePath: string | null
    items: EditorTreeItem[]
    position: { x: number; y: number } | null
    onOpen: (items: EditorTreeItem[]) => void
    onNewFile: (filePath: string) => void
    onAddToChat: (items: EditorTreeItem[]) => void
    onCopyPath: (items: EditorTreeItem[]) => void | Promise<void>
    onCopyRelativePath: (items: EditorTreeItem[]) => void | Promise<void>
    onRefresh: (items: EditorTreeItem[]) => void
    onDelete: (items: EditorTreeItem[]) => void | Promise<void>
    onClose: () => void
    mobileMode?: boolean
}) {
    const menuRef = useRef<HTMLDivElement | null>(null)
    const filePath = props.filePath
    const position = props.position
    const items = props.items.length > 0
        ? props.items
        : (filePath ? [{ path: filePath, type: 'file' as const }] : [])

    useEffect(() => {
        if (!filePath || !position) return

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                props.onClose()
            }
        }
        const handleMouseDown = (event: MouseEvent) => {
            if (props.mobileMode) {
                return
            }
            const menu = menuRef.current
            if (menu && event.target instanceof Node && !menu.contains(event.target)) {
                props.onClose()
            }
        }

        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('mousedown', handleMouseDown)
        return () => {
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('mousedown', handleMouseDown)
        }
    }, [filePath, position, props])

    if (!filePath || !position) {
        return null
    }

    const handleOpen = () => {
        props.onOpen(items)
        props.onClose()
    }

    const handleAddToChat = () => {
        props.onAddToChat(items)
        props.onClose()
    }

    const handleNewFile = () => {
        props.onNewFile(filePath)
        props.onClose()
    }

    const handleCopyPath = async () => {
        await props.onCopyPath(items)
        props.onClose()
    }

    const handleCopyRelativePath = async () => {
        await props.onCopyRelativePath(items)
        props.onClose()
    }

    const handleRefresh = () => {
        props.onRefresh(items)
        props.onClose()
    }

    const handleDeleteFile = () => {
        void props.onDelete(items)
        props.onClose()
    }

    if (props.mobileMode) {
        const title = items.length === 1
            ? items[0].path.split('/').filter(Boolean).pop() ?? items[0].path
            : `${items.length} items`

        return (
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3" role="presentation">
                <div
                    ref={menuRef}
                    role="menu"
                    aria-label={`File actions ${title}`}
                    className="w-full max-w-sm rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm text-[var(--app-fg)] shadow-xl"
                >
                    <div className="border-b border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-hint)]">
                        {title}
                    </div>
                    <button type="button" role="menuitem" onClick={handleOpen} className="block min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)]">Open in Editor</button>
                    <button type="button" role="menuitem" onClick={handleNewFile} className="block min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)]">New File</button>
                    <button type="button" role="menuitem" onClick={handleAddToChat} className="block min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)]">Add to Chat</button>
                    <button type="button" role="menuitem" onClick={() => { void handleCopyPath() }} className="block min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)]">Copy Path</button>
                    <button type="button" role="menuitem" onClick={() => { void handleCopyRelativePath() }} className="block min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)]">Copy Relative Path</button>
                    <button type="button" role="menuitem" onClick={handleRefresh} className="block min-h-11 w-full rounded-md px-3 py-2 text-left hover:bg-[var(--app-subtle-bg)]">Refresh</button>
                    <button type="button" role="menuitem" onClick={handleDeleteFile} className="block min-h-11 w-full rounded-md px-3 py-2 text-left text-red-500 hover:bg-[var(--app-subtle-bg)]">Delete</button>
                    <button type="button" onClick={props.onClose} className="mt-1 block min-h-11 w-full rounded-md border border-[var(--app-border)] px-3 py-2 text-center text-[var(--app-fg)] hover:bg-[var(--app-subtle-bg)]">Cancel</button>
                </div>
            </div>
        )
    }

    return (
        <div
            ref={menuRef}
            role="menu"
            className="fixed z-50 min-w-[160px] rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] py-1 text-xs text-[var(--app-fg)] shadow-lg"
            style={{ left: position.x, top: position.y }}
        >
            <button
                type="button"
                role="menuitem"
                onClick={handleOpen}
                className="block w-full px-3 py-1.5 text-left hover:bg-[var(--app-subtle-bg)]"
            >
                Open in Editor
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={handleNewFile}
                className="block w-full px-3 py-1.5 text-left hover:bg-[var(--app-subtle-bg)]"
            >
                New File
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={handleAddToChat}
                className="block w-full px-3 py-1.5 text-left hover:bg-[var(--app-subtle-bg)]"
            >
                Add to Chat
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => { void handleCopyPath() }}
                className="block w-full px-3 py-1.5 text-left hover:bg-[var(--app-subtle-bg)]"
            >
                Copy Path
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={() => { void handleCopyRelativePath() }}
                className="block w-full px-3 py-1.5 text-left hover:bg-[var(--app-subtle-bg)]"
            >
                Copy Relative Path
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={handleRefresh}
                className="block w-full px-3 py-1.5 text-left hover:bg-[var(--app-subtle-bg)]"
            >
                Refresh
            </button>
            <button
                type="button"
                role="menuitem"
                onClick={handleDeleteFile}
                className="block w-full px-3 py-1.5 text-left text-red-500 hover:bg-[var(--app-subtle-bg)]"
            >
                Delete
            </button>
        </div>
    )
}
