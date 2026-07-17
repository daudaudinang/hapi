import type { ToolViewProps } from '@/components/ToolCard/views/_all'
import { basename, resolveDisplayPath } from '@/utils/path'
import { extractCodexPatchFiles } from '@/components/ToolCard/codexPatch'
import { useTranslation } from '@/lib/use-translation'

export function CodexPatchView(props: ToolViewProps) {
    const { t } = useTranslation()
    const files = extractCodexPatchFiles(props.block.tool.input)

    if (files.length === 0) {
        return (
            <div className="text-sm text-[var(--app-hint)]">
                {t('tool.patchDetailsUnavailable')}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-1">
            {files.map((file) => {
                const display = resolveDisplayPath(file.path, props.metadata)
                return (
                    <div
                        key={file.path}
                        title={file.path}
                        className="text-sm text-[var(--app-fg)] font-mono break-all"
                    >
                        {basename(display)}
                    </div>
                )
            })}
        </div>
    )
}
