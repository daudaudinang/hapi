import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamChatLayout } from './TeamChatLayout'

const teamChat = { id: 'team-1', namespace: 'default', name: 'Confirm Phase 2 Passed', projectPath: '/repo', createdAt: 1, updatedAt: 1 }
const participants = [{ id: 'p1', teamChatId: 'team-1', type: 'user' as const, displayName: 'You', role: 'general' as const, color: '#34d399', joinedAt: 1 }]

describe('TeamChatLayout navigation', () => {
    it('renders escape hatches back to app-level modes', () => {
        const onOpenTeamChats = vi.fn()
        const onOpenAgentMode = vi.fn()
        const onOpenEditorMode = vi.fn()

        render(<TeamChatLayout
            teamChat={teamChat}
            messages={[]}
            participants={participants}
            currentParticipantId="p1"
            onSend={vi.fn()}
            onLoadAround={vi.fn()}
            onOpenTeamChats={onOpenTeamChats}
            onOpenAgentMode={onOpenAgentMode}
            onOpenEditorMode={onOpenEditorMode}
        />)

        fireEvent.click(screen.getByRole('button', { name: /Team Chats/i }))
        fireEvent.click(screen.getByRole('button', { name: /Agent Mode/i }))
        fireEvent.click(screen.getByRole('button', { name: /Editor/i }))

        expect(onOpenTeamChats).toHaveBeenCalled()
        expect(onOpenAgentMode).toHaveBeenCalled()
        expect(onOpenEditorMode).toHaveBeenCalled()
    })
})
