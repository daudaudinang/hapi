import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
    CreateTerminalSnippetInput,
    TerminalSnippet,
    TerminalSnippetsResponse,
    UpdateTerminalSnippetInput
} from '@hapi/protocol'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

function sortTerminalSnippets(
    left: TerminalSnippet,
    right: TerminalSnippet
): number {
    if (left.createdAt !== right.createdAt) {
        return right.createdAt - left.createdAt
    }
    if (left.id === right.id) {
        return 0
    }
    return left.id < right.id ? 1 : -1
}

export function useTerminalSnippets(
    api: ApiClient | null,
    enabled: boolean
): {
    snippets: TerminalSnippet[]
    isLoading: boolean
    error: string | null
    refetch: () => Promise<unknown>
    createSnippet: (input: CreateTerminalSnippetInput) => Promise<TerminalSnippet>
    updateSnippet: (id: string, input: UpdateTerminalSnippetInput) => Promise<TerminalSnippet>
    deleteSnippet: (id: string) => Promise<void>
    isPending: boolean
} {
    const queryClient = useQueryClient()
    const queryKey = queryKeys.terminalSnippets(
        api?.cacheScope ?? 'api-unavailable'
    )
    const query = useQuery({
        queryKey,
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return await api.getTerminalSnippets()
        },
        enabled: Boolean(api) && enabled
    })

    const createMutation = useMutation({
        mutationFn: async (input: CreateTerminalSnippetInput) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return (await api.createTerminalSnippet(input)).snippet
        },
        onSuccess: (snippet) => {
            queryClient.setQueryData<TerminalSnippetsResponse>(
                queryKey,
                (previous) => {
                    if (!previous) {
                        return previous
                    }
                    return {
                        snippets: [
                            ...previous.snippets.filter((item) => (
                                item.id !== snippet.id
                            )),
                            snippet
                        ].sort(sortTerminalSnippets)
                    }
                }
            )
        }
    })

    const updateMutation = useMutation({
        mutationFn: async (args: {
            id: string
            input: UpdateTerminalSnippetInput
        }) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            return (await api.updateTerminalSnippet(args.id, args.input)).snippet
        },
        onSuccess: (snippet) => {
            queryClient.setQueryData<TerminalSnippetsResponse>(
                queryKey,
                (previous) => {
                    if (!previous) {
                        return previous
                    }
                    return {
                        snippets: previous.snippets.map((item) => (
                            item.id === snippet.id ? snippet : item
                        ))
                    }
                }
            )
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            if (!api) {
                throw new Error('API unavailable')
            }
            await api.deleteTerminalSnippet(id)
            return id
        },
        onSuccess: (id) => {
            queryClient.setQueryData<TerminalSnippetsResponse>(
                queryKey,
                (previous) => {
                    if (!previous) {
                        return previous
                    }
                    return {
                        snippets: previous.snippets.filter((item) => item.id !== id)
                    }
                }
            )
        }
    })

    return {
        snippets: query.data?.snippets ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error
            ? query.error.message
            : query.error
                ? 'Failed to load terminal snippets'
                : null,
        refetch: query.refetch,
        createSnippet: createMutation.mutateAsync,
        updateSnippet: async (id, input) => await updateMutation.mutateAsync({ id, input }),
        deleteSnippet: async (id) => {
            await deleteMutation.mutateAsync(id)
        },
        isPending: createMutation.isPending
            || updateMutation.isPending
            || deleteMutation.isPending
    }
}
