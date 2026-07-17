import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { isObject } from '@hapi/protocol'
import { DiffView } from '@/components/DiffView'
import { parsePatch } from 'diff'
import { useMemo } from 'react'
import { useTranslation } from '@/lib/use-translation'

export type DiffFileSummary = {
    path: string
    added: number
    removed: number
}

export type UnifiedDiffSummary = {
    added: number
    removed: number
    files: DiffFileSummary[]
}

function displayPatchPath(
    oldFileName: string | undefined,
    newFileName: string | undefined
): string | null {
    const path = newFileName === '/dev/null' ? oldFileName : newFileName
    return path ? path.replace(/^[ab]\//, '') : null
}

export function summarizeUnifiedDiff(unifiedDiff: string): UnifiedDiffSummary {
    try {
        const files = parsePatch(unifiedDiff).flatMap((patch): DiffFileSummary[] => {
            const path = displayPatchPath(patch.oldFileName, patch.newFileName)
            if (!path || patch.hunks.length === 0) return []

            let added = 0
            let removed = 0
            for (const hunk of patch.hunks) {
                for (const line of hunk.lines) {
                    if (line.startsWith('+')) added += 1
                    else if (line.startsWith('-')) removed += 1
                }
            }
            return [{ path, added, removed }]
        })

        return {
            added: files.reduce((total, file) => total + file.added, 0),
            removed: files.reduce((total, file) => total + file.removed, 0),
            files
        }
    } catch {
        return { added: 0, removed: 0, files: [] }
    }
}

function parseUnifiedDiff(unifiedDiff: string): { oldText: string; newText: string; fileName?: string } {
    const lines = unifiedDiff.split('\n')
    const oldLines: string[] = []
    const newLines: string[] = []
    let fileName: string | undefined
    let inHunk = false

    for (const line of lines) {
        if (line.startsWith('+++ b/') || line.startsWith('+++ ')) {
            fileName = line.replace(/^\+\+\+ (b\/)?/, '')
            continue
        }

        if (
            line.startsWith('diff --git')
            || line.startsWith('index ')
            || line.startsWith('---')
            || line.startsWith('new file mode')
            || line.startsWith('deleted file mode')
        ) {
            continue
        }

        if (line.startsWith('@@')) {
            inHunk = true
            continue
        }

        if (!inHunk) continue

        if (line.startsWith('+')) {
            newLines.push(line.substring(1))
        } else if (line.startsWith('-')) {
            oldLines.push(line.substring(1))
        } else if (line.startsWith(' ')) {
            oldLines.push(line.substring(1))
            newLines.push(line.substring(1))
        } else if (line === '\\ No newline at end of file') {
            continue
        } else if (line === '') {
            oldLines.push('')
            newLines.push('')
        }
    }

    return {
        oldText: oldLines.join('\n'),
        newText: newLines.join('\n'),
        fileName
    }
}

function renderDiff(block: ToolViewProps['block'], showFileHeader: boolean) {
    const input = block.tool.input
    if (!isObject(input) || typeof input.unified_diff !== 'string') return null

    const parsed = parseUnifiedDiff(input.unified_diff)
    return (
        <DiffView
            oldString={parsed.oldText}
            newString={parsed.newText}
            filePath={showFileHeader ? parsed.fileName : undefined}
            variant={showFileHeader ? 'inline' : undefined}
        />
    )
}

export function CodexDiffCompactView(props: ToolViewProps) {
    const { t } = useTranslation()
    const input = props.block.tool.input
    const unifiedDiff = isObject(input) && typeof input.unified_diff === 'string'
        ? input.unified_diff
        : ''
    const summary = useMemo(() => summarizeUnifiedDiff(unifiedDiff), [unifiedDiff])
    if (summary.files.length === 0) return null

    const visible = summary.files.slice(0, 3)
    const remaining = summary.files.length - visible.length

    return (
        <div className="flex flex-col gap-2.5">
            <div className="flex items-center gap-3 font-mono text-xs font-semibold">
                <span className="text-[var(--app-tool-diff-accent)]">+{summary.added}</span>
                <span className="text-[var(--app-badge-error-text)]">-{summary.removed}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {visible.map((file) => (
                    <li key={file.path} className="flex min-w-0 items-center gap-3 font-mono text-xs">
                        <span className="min-w-0 flex-1 truncate text-[var(--app-fg)]">
                            {file.path}
                        </span>
                        <span className="shrink-0 text-[var(--app-tool-diff-accent)]">
                            +{file.added}
                        </span>
                        <span className="shrink-0 text-[var(--app-badge-error-text)]">
                            -{file.removed}
                        </span>
                    </li>
                ))}
            </ul>
            {remaining > 0 ? (
                <div className="text-xs text-[var(--app-hint)]">
                    {t('tool.moreFiles', { count: remaining })}
                </div>
            ) : null}
        </div>
    )
}

export function CodexDiffFullView(props: ToolViewProps) {
    return renderDiff(props.block, true)
}
