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
        void props.onLoadAround(messageId)
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
