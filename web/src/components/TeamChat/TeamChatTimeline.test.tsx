import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamChatTimeline } from './TeamChatTimeline'

it('loads around-page when reply target is not mounted', async () => {
    const loadAround = vi.fn().mockResolvedValue(undefined)
    render(<TeamChatTimeline messages={[]} participants={[]} onLoadAround={loadAround} />)
    fireEvent.click(screen.getByRole('button', { name: /load replied message/i }))
    expect(loadAround).toHaveBeenCalled()
})
