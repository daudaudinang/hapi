import { useTranslation } from '@/lib/use-translation'

export function CodexResumeSection(props: {
    enabled: boolean
    sessionId: string
    isDisabled: boolean
    onEnabledChange: (enabled: boolean) => void
    onSessionIdChange: (sessionId: string) => void
}) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-col gap-2 px-3 py-3">
            <label className="flex items-center justify-between gap-3">
                <span className="flex flex-col">
                    <span className="text-sm text-[var(--app-fg)]">{t('newSession.codexResume.title')}</span>
                    <span className="text-xs text-[var(--app-hint)]">
                        {t('newSession.codexResume.desc')}
                    </span>
                </span>
                <input
                    type="checkbox"
                    checked={props.enabled}
                    onChange={(event) => props.onEnabledChange(event.target.checked)}
                    disabled={props.isDisabled}
                    className="accent-[var(--app-link)]"
                />
            </label>
            {props.enabled ? (
                <label className="flex flex-col gap-1.5">
                    <span className="text-xs font-medium text-[var(--app-hint)]">{t('newSession.codexResume.sessionId')}</span>
                    <input
                        type="text"
                        value={props.sessionId}
                        onChange={(event) => props.onSessionIdChange(event.target.value)}
                        disabled={props.isDisabled}
                        placeholder="019ed35e-db26-7770-abb3-1c7ee3c92f52"
                        className="w-full rounded-md border border-[var(--app-border)] bg-[var(--app-bg)] p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--app-link)] disabled:opacity-50"
                    />
                </label>
            ) : null}
        </div>
    )
}
