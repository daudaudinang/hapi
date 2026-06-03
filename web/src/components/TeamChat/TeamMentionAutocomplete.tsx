import type { TeamParticipant } from '@/types/api'
import { getParticipantAccent } from './teamColors'

function getMentionQuery(text: string): string | null {
    const match = text.match(/(^|\s)@([^\s@]*)$/)
    return match ? match[2].toLowerCase() : null
}

export function TeamMentionAutocomplete(props: {
    text: string
    participants: TeamParticipant[]
    onPick: (displayName: string) => void
}) {
    const query = getMentionQuery(props.text)
    if (query === null) return null
    const matches = props.participants
        .filter((participant) => participant.sessionId)
        .filter((participant) => participant.displayName.toLowerCase().includes(query))
        .slice(0, 6)

    if (matches.length === 0) return null

    return (
        <div className="mb-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-1 shadow-lg">
            {matches.map((participant) => (
                <button
                    key={participant.id}
                    type="button"
                    onClick={() => props.onPick(participant.displayName)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-[var(--app-secondary-bg)]"
                >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getParticipantAccent(participant.color) }} />
                    <span className="font-medium text-[var(--app-fg)]">{participant.displayName}</span>
                    <span className="text-xs capitalize text-[var(--app-hint)]">{participant.role}</span>
                </button>
            ))}
        </div>
    )
}
