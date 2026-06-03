import { Button } from '@/components/ui/button'

export function IncludedContextPreview(props: {
    onEdit: () => void
    onAttachFile: () => void
    onUseDefault: () => void
}) {
    return (
        <div className="mb-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-xs font-semibold text-[var(--app-fg)]">Included context</div>
                    <div className="mt-1 text-xs text-[var(--app-hint)]">Goal, recent decisions, open questions, reply preview, and attached files.</div>
                </div>
                <div className="flex shrink-0 gap-1">
                    <Button type="button" variant="outline" size="sm" onClick={props.onEdit}>Edit context</Button>
                    <Button type="button" variant="outline" size="sm" onClick={props.onAttachFile}>Attach file</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={props.onUseDefault}>Use default</Button>
                </div>
            </div>
        </div>
    )
}
