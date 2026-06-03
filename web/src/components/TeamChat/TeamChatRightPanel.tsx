import type { TeamParticipant } from '@/types/api'
import { cn } from '@/lib/utils'
import { getParticipantAccent } from './teamColors'

export function TeamChatRightPanel(props: { participants: TeamParticipant[]; className?: string }) {
    return (
        <aside className={cn('hidden w-72 shrink-0 border-l border-[var(--app-border)] bg-[var(--app-bg)] p-3 lg:block', props.className)}>
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--app-hint)]">Members</div>
            <div className="mt-3 space-y-2">
                {props.participants.map((participant) => (
                    <div key={participant.id} className="flex items-center gap-2 rounded-xl border border-[var(--app-border)] p-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: getParticipantAccent(participant.color) }} />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{participant.displayName}</div>
                            <div className="text-xs capitalize text-[var(--app-hint)]">{participant.role}</div>
                        </div>
                    </div>
                ))}
            </div>
        </aside>
    )
}
