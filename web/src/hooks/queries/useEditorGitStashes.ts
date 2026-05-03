import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { EditorGitStashListResponse } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useEditorGitStashes(
    api: ApiClient | null,
    machineId: string | null,
    projectPath: string | null,
    repoRoot?: string | null
) {
    return useQuery<EditorGitStashListResponse>({
        queryKey: queryKeys.editorGitStashes(machineId ?? 'unknown', projectPath ?? '', repoRoot ?? undefined),
        enabled: Boolean(api && machineId && projectPath),
        queryFn: async () => {
            if (!api || !machineId || !projectPath) throw new Error('Missing editor project')
            return await api.listEditorGitStashes(machineId, projectPath, repoRoot ?? undefined)
        },
        staleTime: 30_000
    })
}
