import type { RunnerLocallyPersistedState } from '@/persistence'

export type RunnerConnectionIdentity = {
    apiUrl: string
    machineId?: string
}

export function isRunnerStateCompatibleWithIdentity(
    state: Pick<
        RunnerLocallyPersistedState,
        'startedWithApiUrl' | 'startedWithMachineId'
    >,
    current: RunnerConnectionIdentity
): boolean {
    if (!state.startedWithApiUrl || state.startedWithApiUrl !== current.apiUrl) {
        return false
    }

    if (!current.machineId || state.startedWithMachineId !== current.machineId) {
        return false
    }

    return true
}
