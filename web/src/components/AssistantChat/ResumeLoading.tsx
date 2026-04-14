import { useTranslation } from '@/lib/use-translation'

export function ResumeLoading() {
    const { t } = useTranslation()

    return (
        <div className="flex items-center gap-3 px-4 py-3 text-sm text-[var(--app-hint)]">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--app-hint)] border-t-transparent" />
            <span>{t('resume.resumingSession') || 'Resuming session...'}</span>
        </div>
    )
}
