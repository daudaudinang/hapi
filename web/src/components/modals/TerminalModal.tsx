import { useMemo } from 'react'
import { useAppContext } from '@/lib/app-context'
import { useSession } from '@/hooks/queries/useSession'
import { SessionTerminalTabs } from '@/components/Terminal/SessionTerminalTabs'
import { LoadingState } from '@/components/LoadingState'
import { isRemoteTerminalSupported } from '@/utils/terminalSupport'
import {
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from '@/components/ui/dialog'

export function TerminalModal(props: { sessionId: string; onClose: () => void }) {
    const sessionId = props.sessionId
    const { api } = useAppContext()
    const { session } = useSession(api, sessionId)
    const terminalSupported = isRemoteTerminalSupported(session?.metadata)
    const subtitle = useMemo(() => session?.metadata?.path ?? sessionId, [session?.metadata?.path, sessionId])

    if (!session) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingState label="Loading session…" className="text-sm" />
            </div>
        )
    }

    return (
        <DialogContent className="flex h-[85vh] max-h-[800px] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden border-[var(--app-border)] bg-[var(--app-bg)] p-0">
            <DialogHeader className="border-b border-[var(--app-border)] p-4 pb-2">
                <DialogTitle className="text-xl font-semibold">Terminal</DialogTitle>
                <DialogDescription className="mt-1 text-xs text-[var(--app-hint)]">{subtitle}</DialogDescription>
            </DialogHeader>
            <SessionTerminalTabs
                sessionId={sessionId}
                active={Boolean(session.active)}
                terminalSupported={terminalSupported}
                cwd={session.metadata?.path}
                className="min-h-0 flex-1"
            />
        </DialogContent>
    )
}
