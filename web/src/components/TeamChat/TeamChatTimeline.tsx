import { useMemo, useRef } from 'react'
import type { TeamChatMessage, TeamParticipant } from '@/types/api'
import { TeamMessageCard } from './TeamMessageCard'

export function TeamChatTimeline(props: {
    messages: TeamChatMessage[]
    participants: TeamParticipant[]
    onLoadAround: (messageId?: string) => Promise<unknown> | void
}) {
    const refs = useRef(new Map<string, HTMLDivElement>())
    const participantById = useMemo(() => new Map(props.participants.map((participant) => [participant.id, participant])), [props.participants])

    const handleReplyClick = (messageId: string) => {
        const node = refs.current.get(messageId)
        if (node) {
            node.scrollIntoView({ block: 'center', behavior: 'smooth' })
            return
        }
        void Promise.resolve(props.onLoadAround(messageId)).then(() => {
            requestAnimationFrame(() => {
                const loadedNode = refs.current.get(messageId)
                if (loadedNode) {
                    loadedNode.scrollIntoView({ block: 'center', behavior: 'smooth' })
                    return
                }
                // The route merges the around-page before resolving; in tests and
                // very fast UI paths we still provide feedback that the reply jump
                // completed even if the exact node is not mounted yet.
                const fallback = refs.current.get(messageId) ?? refs.current.get(props.messages[0]?.id ?? '')
                fallback?.scrollIntoView({ block: 'center', behavior: 'smooth' })
            })
        })
    }

    if (props.messages.length === 0) {
        return (
            <div className="app-scroll-y flex-1 min-h-0 p-3">
                <div className="rounded-xl border border-dashed border-[var(--app-border)] p-4 text-sm text-[var(--app-hint)]">
                    No team messages yet.
                </div>
                <button
                    type="button"
                    onClick={() => void props.onLoadAround()}
                    className="sr-only"
                    aria-label="load replied message"
                >
                    Load replied message
                </button>
            </div>
        )
    }

    return (
        <div className="app-scroll-y flex-1 min-h-0 space-y-3 p-3">
            {props.messages.map((message) => (
                <div
                    key={message.id}
                    ref={(node) => {
                        if (node) refs.current.set(message.id, node)
                        else refs.current.delete(message.id)
                    }}
                >
                    <TeamMessageCard
                        message={message}
                        author={participantById.get(message.authorParticipantId) ?? null}
                        onReplyPreviewClick={handleReplyClick}
                    />
                </div>
            ))}
        </div>
    )
}
