import { useState } from 'react'
import { useTranslation } from '@/lib/use-translation'
import { useServerUrl } from '@/hooks/useServerUrl'

export function LoginPrompt(props: {
    isLoading: boolean
    error: string | null
    onLogin: () => void
    onLoginWithInvitation: (token: string) => Promise<void>
}) {
    const { t } = useTranslation()
    const { serverUrl, setServerUrl, clearServerUrl } = useServerUrl()
    const [showHubConfig, setShowHubConfig] = useState(false)
    const [hubUrlInput, setHubUrlInput] = useState(serverUrl || '')
    const [showInvitation, setShowInvitation] = useState(false)
    const [invitationToken, setInvitationToken] = useState('')

    const handleLogin = () => {
        props.onLogin()
    }

    const handleInvitationSubmit = async () => {
        await props.onLoginWithInvitation(invitationToken.trim())
    }

    const handleSaveHubUrl = () => {
        const trimmed = hubUrlInput.trim()
        if (trimmed) {
            setServerUrl(trimmed)
        } else {
            clearServerUrl()
        }
        setShowHubConfig(false)
    }

    return (
        <div className="min-h-dvh flex items-center justify-center bg-background px-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="space-y-2 text-center">
                    <div className="flex justify-center">
                        <span className="text-3xl">H</span>
                    </div>
                    <h1 className="text-2xl font-semibold">HAPI</h1>
                    <p className="text-sm text-muted-foreground">
                        {t('Sign in to control your agents remotely')}
                    </p>
                </div>

                <div className="space-y-3">
                    {props.error && (
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
                            {props.error}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleLogin}
                        disabled={props.isLoading}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                        {props.isLoading ? t('Signing in...') : t('Sign in with Keycloak')}
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowInvitation(!showInvitation)}
                        className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
                    >
                        {showInvitation ? t('Cancel') : t('Have an invitation code?')}
                    </button>

                    {showInvitation && (
                        <div className="space-y-2">
                            <input
                                type="text"
                                value={invitationToken}
                                onChange={(e) => setInvitationToken(e.target.value)}
                                placeholder={t('Enter invitation code')}
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') void handleInvitationSubmit()
                                }}
                            />
                            <button
                                type="button"
                                onClick={handleInvitationSubmit}
                                disabled={props.isLoading || !invitationToken.trim()}
                                className="w-full rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
                            >
                                {t('Redeem invitation')}
                            </button>
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={() => setShowHubConfig(!showHubConfig)}
                        className="w-full text-center text-xs text-muted-foreground/60 hover:text-muted-foreground"
                    >
                        {serverUrl
                            ? t('Hub') + `: ${serverUrl}`
                            : showHubConfig
                                ? t('Cancel')
                                : t('Configure hub URL')
                        }
                    </button>

                    {showHubConfig && (
                        <div className="space-y-2">
                            <input
                                type="url"
                                value={hubUrlInput}
                                onChange={(e) => setHubUrlInput(e.target.value)}
                                placeholder="https://your-hub.example.com"
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveHubUrl()
                                }}
                            />
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleSaveHubUrl}
                                    className="flex-1 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
                                >
                                    {t('Save')}
                                </button>
                                {serverUrl && (
                                    <button
                                        type="button"
                                        onClick={clearServerUrl}
                                        className="flex-1 rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
                                    >
                                        {t('Reset')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
