import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import type { EditorGitStatusV2Response } from '@/types/api'
import { queryKeys } from '@/lib/query-keys'

export function useEditorGitStatus(
    api: ApiClient | null,
    machineId: string | null,
    projectPath: string | null,
    repoRoot?: string | null
) {
    const resolvedMachineId = machineId ?? 'unknown'
    const resolvedProjectPath = projectPath ?? ''
    return useQuery<{ status: EditorGitStatusV2Response | null; error: string | null }>({
        queryKey: queryKeys.editorGitStatus(resolvedMachineId, resolvedProjectPath, repoRoot ?? undefined),
        enabled: Boolean(api && machineId && projectPath),
        queryFn: async () => {
            if (!api || !machineId || !projectPath) throw new Error('Missing editor project')
            const response = await api.getEditorGitStatusV2(machineId, projectPath, repoRoot ?? undefined)
            if (!response.success) return { status: response, error: response.error ?? 'Git status unavailable' }
            return { status: response, error: null }
        },
        refetchInterval: 5_000
    })
}
