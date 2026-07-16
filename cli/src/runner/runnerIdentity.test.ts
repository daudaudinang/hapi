import { describe, expect, it } from 'vitest'
import { isRunnerStateCompatibleWithIdentity } from './runnerIdentity'

describe('runner identity', () => {
    const state = { startedWithApiUrl: 'https://hub.test', startedWithMachineId: 'machine-1' }

    it('matches the selected Hub and machine', () => {
        expect(isRunnerStateCompatibleWithIdentity(state, { apiUrl: 'https://hub.test', machineId: 'machine-1' })).toBe(true)
    })

    it('rejects missing or different Hub and machine identity', () => {
        expect(isRunnerStateCompatibleWithIdentity(state, { apiUrl: 'https://other.test', machineId: 'machine-1' })).toBe(false)
        expect(isRunnerStateCompatibleWithIdentity(state, { apiUrl: 'https://hub.test', machineId: 'machine-2' })).toBe(false)
        expect(isRunnerStateCompatibleWithIdentity(state, { apiUrl: 'https://hub.test' })).toBe(false)
    })
})
