import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nProvider } from '@/lib/i18n-context'
import { LoginPrompt } from './LoginPrompt'

function renderWithProviders(ui: React.ReactElement) {
    return render(
        <I18nProvider>
            {ui}
        </I18nProvider>
    )
}

describe('LoginPrompt', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        const localStorageMock = {
            getItem: vi.fn(() => 'en'),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            key: vi.fn(() => null),
            length: 0,
        }
        Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true })
    })

    it('renders login button and invitation toggle', async () => {
        const onLogin = vi.fn()
        const onLoginWithInvitation = vi.fn()

        renderWithProviders(
            <LoginPrompt
                isLoading={false}
                error={null}
                onLogin={onLogin}
                onLoginWithInvitation={onLoginWithInvitation}
            />
        )

        expect(screen.getByText('Sign in with Keycloak')).toBeInTheDocument()
        expect(screen.getByText('Have an invitation code?')).toBeInTheDocument()
    })

    it('shows loading state', () => {
        renderWithProviders(
            <LoginPrompt
                isLoading={true}
                error={null}
                onLogin={vi.fn()}
                onLoginWithInvitation={vi.fn()}
            />
        )

        expect(screen.getByText('Signing in...')).toBeInTheDocument()
    })

    it('shows error message', () => {
        renderWithProviders(
            <LoginPrompt
                isLoading={false}
                error={'Authentication failed'}
                onLogin={vi.fn()}
                onLoginWithInvitation={vi.fn()}
            />
        )

        expect(screen.getByText('Authentication failed')).toBeInTheDocument()
    })
})
