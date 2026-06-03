import { useEffect, useRef } from 'react'
import type { TeamMentionBlock } from '@/chat/types'

export function TeamMentionMessage(props: {
    block: TeamMentionBlock
    onOpenTeamChat: () => void
    onReplyToTeam: () => void
    onPostUpdate: () => void
    onViewOriginal: () => void
    onNoAction: () => void
    onSeen?: () => void
}) {
    const seenReportedRequestIdRef = useRef<string | null>(null)

    useEffect(() => {
        if ((props.block.status === 'pending' || props.block.status === 'delivered') && seenReportedRequestIdRef.current !== props.block.requestId) {
            seenReportedRequestIdRef.current = props.block.requestId
            props.onSeen?.()
        }
    }, [props.block.requestId, props.block.status, props.onSeen])

    const isSeen = props.block.status === 'seen' || props.block.status === 'processing' || props.block.status === 'responded' || props.block.status === 'no_action'

    return (
        <div className="rounded-xl border border-[var(--app-border)] bg-[var(--app-subtle-bg)] p-3 text-sm shadow-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
                <div className="font-medium text-[var(--app-fg)]">Team mention</div>
                <div className="flex items-center gap-1 rounded-full border border-[var(--app-border)] px-2 py-0.5 text-[11px] capitalize text-[var(--app-hint)]">
                    {isSeen && <span aria-label="Seen" className="text-[10px]">👁</span>}
                    <span>{props.block.status.replace('_', ' ')}</span>
                </div>
            </div>
            <div className="whitespace-pre-wrap text-[var(--app-fg)]">{props.block.text}</div>
            <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-md bg-[var(--app-button)] px-2.5 py-1.5 text-xs font-medium text-[var(--app-button-text)]" onClick={props.onReplyToTeam}>Reply to Team</button>
                <button className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-xs text-[var(--app-fg)]" onClick={props.onPostUpdate}>Post update</button>
                <button className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-xs text-[var(--app-fg)]" onClick={props.onViewOriginal}>View original</button>
                <button className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-xs text-[var(--app-fg)]" onClick={props.onOpenTeamChat}>Open Team Chat</button>
                <button className="rounded-md border border-[var(--app-border)] px-2.5 py-1.5 text-xs text-[var(--app-hint)]" onClick={props.onNoAction}>No action needed</button>
            </div>
        </div>
    )
}
