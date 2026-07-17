import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { AdminPage } from './admin'

const api = {
    listMembers: vi.fn(async () => ({ members: [] })),
    listInvitations: vi.fn(async () => ({ invitations: [] })),
    listRunners: vi.fn(async () => ({ runners: [] })),
    listTeams: vi.fn(async () => ({ teams: [] })),
    listGrants: vi.fn(async () => ({ grants: [] })),
    listAuditEvents: vi.fn(async () => ({ events: [] })),
    createInvitation: vi.fn(async () => ({ invitationId: 'invite-1', token: 'one-time-secret', expiresAt: 2_000_000_000_000 }))
} as unknown as ApiClient

vi.mock('@/lib/app-context', () => ({
    useAppContext: () => ({ api, role: 'admin' })
}))

describe('AdminPage invitations', () => {
    beforeEach(() => vi.clearAllMocks())
    afterEach(cleanup)

    it('creates an invitation and reveals its one-time code', async () => {
        render(<AdminPage />)
        await screen.findByRole('heading', { name: 'Invite a member' })

        fireEvent.change(screen.getByLabelText('Verified email'), { target: { value: 'member@example.com' } })
        fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'viewer' } })
        fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }))

        await waitFor(() => expect(api.createInvitation).toHaveBeenCalledWith('member@example.com', 'viewer'))
        expect(await screen.findByText('one-time-secret')).toBeInTheDocument()
    })
})
