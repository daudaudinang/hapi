// TODO: Integrate into EditorGitPanel for inline diff viewing (click file to expand diff)
import { useQuery } from '@tanstack/react-query'
import type { ApiClient } from '@/api/client'
import { queryKeys } from '@/lib/query-keys'

export function useEditorGitDiff(
    api: ApiClient | null,
    machineId: string | null,
    projectPath: string | null,
    filePath: string | null,
    staged?: boolean,
    repoRoot?: string | null
) {
    return useQuery({
        queryKey: queryKeys.editorGitDiff(machineId ?? 'unknown', projectPath ?? '', filePath ?? '', staged, repoRoot ?? undefined),
        enabled: Boolean(api && machineId && projectPath && filePath),
        queryFn: async () => {
            if (!api || !machineId || !projectPath || !filePath) throw new Error('Missing git diff target')
            return await api.getEditorGitDiffFile(machineId, projectPath, filePath, staged, repoRoot ?? undefined)
        }
    })
}
