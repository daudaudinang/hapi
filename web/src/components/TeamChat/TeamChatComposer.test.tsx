import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamChatComposer } from './TeamChatComposer'

it('shows context preview and mention suggestions when typing @', () => {
    render(<TeamChatComposer
        participants={[{ id: 'p1', teamChatId: 't1', type: 'session', displayName: 'Backend API', color: '#60a5fa', sessionId: 's1', role: 'backend', joinedAt: 1 }]}
        onSend={vi.fn()}
    />)
    fireEvent.change(screen.getByPlaceholderText(/Message the team/i), { target: { value: '@Back' } })
    expect(screen.getByText('Backend API')).toBeInTheDocument()
    expect(screen.getByText('Included context')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Edit context/i })).toBeInTheDocument()
})
