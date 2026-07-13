import { useAppContext } from '@/lib/app-context'
import { useSession } from '@/hooks/queries/useSession'
import { SessionTerminalTabs } from '@/components/Terminal/SessionTerminalTabs'
import { LoadingState } from '@/components/LoadingState'
import { isRemoteTerminalSupported } from '@/utils/terminalSupport'
import { DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export function TerminalModal(props: { sessionId: string; onClose: () => void }) {
    const sessionId = props.sessionId
    const { api } = useAppContext()
    const { session } = useSession(api, sessionId)
    const terminalSupported = isRemoteTerminalSupported(session?.metadata)

    if (!session) {
        return (
            <div className="flex h-full items-center justify-center">
                <LoadingState label="Loading session…" className="text-sm" />
            </div>
        )
    }

    return (
        <DialogContent className="flex h-[85vh] max-h-[800px] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden border-[var(--app-border)] bg-[var(--app-bg)] p-0">
            <DialogTitle className="sr-only">Terminal</DialogTitle>
            <DialogDescription className="sr-only">Session terminal</DialogDescription>
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
