import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { TeamParticipant } from '@/types/api'
import { IncludedContextPreview } from './IncludedContextPreview'
import { TeamMentionAutocomplete } from './TeamMentionAutocomplete'

function hasMentionDraft(text: string): boolean {
    return /(^|\s)@\S*/.test(text)
}

function replaceTrailingMention(text: string, displayName: string): string {
    return text.replace(/(^|\s)@[^\s@]*$/, (match, prefix: string) => `${prefix}@${displayName} `)
}

export function TeamChatComposer(props: {
    participants: TeamParticipant[]
    onSend: (text: string) => void
    disabled?: boolean
}) {
    const [text, setText] = useState('')
    const showContext = hasMentionDraft(text)

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault()
                if (props.disabled) return
                const trimmed = text.trim()
                if (!trimmed) return
                props.onSend(trimmed)
                setText('')
            }}
            className="border-t border-[var(--app-border)] bg-[var(--app-bg)] p-3"
        >
            {showContext ? (
                <TeamMentionAutocomplete
                    text={text}
                    participants={props.participants}
                    onPick={(name) => setText((current) => replaceTrailingMention(current, name))}
                />
            ) : null}
            {showContext ? <IncludedContextPreview onEdit={() => {}} onAttachFile={() => {}} onUseDefault={() => {}} /> : null}
            <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                disabled={props.disabled}
                placeholder="Message the team… use @ to mention a session"
                className="min-h-20 w-full resize-none rounded-xl border border-[var(--app-border)] bg-[var(--app-bg)] p-3 text-sm text-[var(--app-fg)] outline-none transition focus:border-[var(--app-link)] disabled:opacity-60"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
                <div className="text-xs text-[var(--app-hint)]">Reply, ask, or assign by mentioning a session.</div>
                <Button type="submit" size="sm" disabled={props.disabled || !text.trim()}>Send</Button>
            </div>
        </form>
    )
}
