import { useTranslation } from '@/lib/use-translation'

export function ArchivePrompt(props: {
    reason?: string
    onDismiss: () => void
    onNavigate?: () => void
}) {
    const { t } = useTranslation()

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-[var(--app-bg)] p-6 shadow-lg">
                <div className="mb-4">
                    <h2 className="text-lg font-semibold text-[var(--app-fg)]">
                        {t('resume.sessionArchived') || 'Session Archived'}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--app-hint)]">
                        {t('resume.sessionArchivedMessage') || 'This session could not be resumed and has been archived.'}
                    </p>
                    {props.reason && (
                        <p className="mt-1 text-xs text-[var(--app-hint)]">
                            {props.reason}
                        </p>
                    )}
                </div>
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={props.onDismiss}
                        className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--app-fg)] transition-colors hover:bg-[var(--app-secondary-bg)]"
                    >
                        {t('resume.dismiss') || 'Dismiss'}
                    </button>
                    {props.onNavigate && (
                        <button
                            type="button"
                            onClick={props.onNavigate}
                            className="rounded-lg bg-[var(--app-link)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                        >
                            {t('resume.viewSessions') || 'View Sessions'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}
