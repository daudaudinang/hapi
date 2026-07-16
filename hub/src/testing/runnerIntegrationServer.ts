import { Database } from 'bun:sqlite'
import { writeFile } from 'node:fs/promises'
import { RunnerEnrollmentService } from '../application/runnerEnrollmentService'
import { SharedHubStore } from '../store/sharedHubStore'

function required(name: string): string {
    const value = process.env[name]?.trim()
    if (!value) throw new Error(`Missing Runner integration fixture setting: ${name}`)
    return value
}

const descriptorPath = required('HAPI_RUNNER_INTEGRATION_DESCRIPTOR')
const organizationId = required('HAPI_ORGANIZATION_ID')
const profile = required('HAPI_RUNNER_INTEGRATION_PROFILE')
const machineId = required('HAPI_RUNNER_INTEGRATION_MACHINE_ID')
const pepper = required('HAPI_AUTH_PEPPER')
const databasePath = required('DB_PATH')
const membershipId = 'runner-integration-admin'
const db = new Database(databasePath, { create: true, readwrite: true, strict: true })
const store = new SharedHubStore(db, {
    organizationId,
    organizationName: required('HAPI_ORGANIZATION_NAME')
})

db.run(
    'INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES(?,?,?,?,?,?)',
    [membershipId, organizationId, 'runner-integration@example.com', 'admin', 'active', Date.now()]
)
const enrollment = new RunnerEnrollmentService(store, pepper, required('HAPI_PUBLIC_URL'))
const issued = enrollment.issue({
    membershipId,
    organizationId,
    role: 'admin',
    disabled: false
}, membershipId)
const enrolled = enrollment.exchange({
    code: issued.code,
    profile,
    machine: {
        id: machineId,
        name: 'Runner Integration',
        platform: process.platform === 'darwin' ? 'darwin' : 'linux',
        arch: process.arch === 'arm64' ? 'arm64' : 'x64'
    }
})

await writeFile(descriptorPath, JSON.stringify({
    runnerId: enrolled.runnerId,
    generation: enrolled.generation,
    credential: enrolled.credential
}), { mode: 0o600 })
db.close()

await import('../index')
