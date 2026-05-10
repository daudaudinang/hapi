import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'

const tempDirs: string[] = []

async function importLoggerWithTempHome() {
    const hapiHome = mkdtempSync(join(tmpdir(), 'hapi-logger-test-'))
    tempDirs.push(hapiHome)

    vi.resetModules()
    vi.unstubAllEnvs()
    vi.stubEnv('HAPI_HOME', hapiHome)

    const module = await import('@/ui/logger')
    return { logger: module.logger, hapiHome }
}

afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()

    for (const dir of tempDirs.splice(0)) {
        rmSync(dir, { recursive: true, force: true })
    }
})

describe('logger file output', () => {
    test('does not write debug messages to local log files', async () => {
        const { logger, hapiHome } = await importLoggerWithTempHome()

        logger.debug('debug message that should not touch disk', { count: 1 })

        const logPath = logger.getLogPath()
        expect(existsSync(logPath)).toBe(false)

        const logsDir = join(hapiHome, 'logs')
        const logFiles = existsSync(logsDir) ? readdirSync(logsDir) : []
        expect(logFiles).toEqual([])
    })
})
