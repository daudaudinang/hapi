import { useQuery } from '@tanstack/react-query';
import type { ApiClient } from '@/api/client';
import type { CodexModelSummary } from '@/types/api';
import { queryKeys } from '@/lib/query-keys';

export function useMachineCodexModels(api: ApiClient | null, machineId: string | null, enabled: boolean): {
    models: CodexModelSummary[];
    isLoading: boolean;
    error: string | null;
} {
    const query = useQuery({
        queryKey: machineId ? queryKeys.machineCodexModels(machineId) : ['machine-codex-models', 'missing-machine'],
        queryFn: async () => {
            if (!api) {
                throw new Error('API unavailable');
            }

            if (!machineId) {
                throw new Error('Machine unavailable');
            }

            return await api.getCodexModels(machineId);
        },
        enabled: Boolean(api && machineId && enabled)
    });

    return {
        models: query.data?.models ?? [],
        isLoading: query.isLoading,
        error: query.error instanceof Error ? query.error.message : query.error ? 'Failed to load Codex models' : null
    };
}
