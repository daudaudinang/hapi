import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useSessionActions } from './useSessionActions'
import type { ApiClient } from '@/api/client'

function createWrapper() {
    const queryClient = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    })
    return function Wrapper({ children }: { children: ReactNode }) {
        return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    }
}

describe('useSessionActions', () => {
    it('allows OpenCode model reasoning effort changes', async () => {
        const setModelReasoningEffort = vi.fn(async () => undefined)
        const api = { setModelReasoningEffort } as unknown as ApiClient

        const { result } = renderHook(
            () => useSessionActions(api, 'session-1', 'opencode', false),
            { wrapper: createWrapper() },
        )

        await act(async () => {
            await result.current.setModelReasoningEffort('high')
        })

        await waitFor(() => {
            expect(setModelReasoningEffort).toHaveBeenCalledWith('session-1', 'high')
        })
    })
})
