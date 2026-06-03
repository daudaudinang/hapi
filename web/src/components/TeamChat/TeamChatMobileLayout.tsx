import { useState } from 'react'
import type { ReactNode } from 'react'

export function TeamChatMobileLayout(props: {
    chat: ReactNode
    sessions: ReactNode
    context: ReactNode
}) {
    const [tab, setTab] = useState<'chat' | 'sessions' | 'context'>('chat')
    return (
        <div className="flex h-full min-h-0 flex-col lg:hidden">
            <div className="grid grid-cols-3 border-b border-[var(--app-border)] text-sm">
                {(['chat', 'sessions', 'context'] as const).map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => setTab(item)}
                        className={`px-3 py-2 capitalize ${tab === item ? 'text-[var(--app-link)]' : 'text-[var(--app-hint)]'}`}
                    >
                        {item === 'sessions' ? 'Sessions' : item}
                    </button>
                ))}
            </div>
            <div className="flex-1 min-h-0">{tab === 'chat' ? props.chat : tab === 'sessions' ? props.sessions : props.context}</div>
        </div>
    )
}
