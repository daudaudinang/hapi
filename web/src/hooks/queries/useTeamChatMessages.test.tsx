import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '@/api/client'
import { useTeamChatMessages } from './useTeamChatMessages'

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } }
    })
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
}

describe('useTeamChatMessages', () => {
    it('accumulates older messages when loading more', async () => {
        const getTeamMessages = vi.fn(async (_teamChatId: string, opts?: { beforeSeq?: number | null }) => {
            if (opts?.beforeSeq === 2) {
                return {
                    messages: [{ id: 'm1', teamChatId: 'team-1', seq: 1, authorParticipantId: 'p1', text: 'older', mentions: [], files: [], createdAt: 1 }],
                    page: { limit: 50, nextBeforeSeq: 1, hasMore: false }
                }
            }
            return {
                messages: [{ id: 'm2', teamChatId: 'team-1', seq: 2, authorParticipantId: 'p1', text: 'latest', mentions: [], files: [], createdAt: 2 }],
                page: { limit: 50, nextBeforeSeq: 2, hasMore: true }
            }
        })
        const api = { getTeamMessages } as unknown as ApiClient

        const { result } = renderHook(() => useTeamChatMessages(api, 'team-1'), { wrapper: createWrapper() })

        await waitFor(() => expect(result.current.messages.map((message) => message.text)).toEqual(['latest']))
        await act(async () => {
            await result.current.loadMore()
        })

        await waitFor(() => expect(result.current.messages.map((message) => message.text)).toEqual(['older', 'latest']))
        expect(getTeamMessages).toHaveBeenCalledWith('team-1', { limit: 50, beforeSeq: 2 })
    })
})
