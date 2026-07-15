import { Database } from 'bun:sqlite'
import { expect, it } from 'bun:test'
import { RunnerEnrollmentService } from '../../application/runnerEnrollmentService'
import { RunnerLifecycleService } from '../../application/runnerLifecycleService'
import { RunnerAuthenticator } from '../../auth/runnerAuthenticator'
import { SharedHubStore } from '../../store/sharedHubStore'
import { createCliRoutes } from './cli'

it('rejects rotated and revoked credentials before machine REST mutation', async () => {
    const db = new Database(':memory:')
    const store = new SharedHubStore(db, { organizationId: 'o1', organizationName: 'Pilot' })
    db.exec("INSERT INTO memberships(id,organization_id,invited_email,role,status,created_at) VALUES('u1','o1','u@example.com','admin','active',1)")
    const subject = { membershipId: 'u1', organizationId: 'o1', role: 'admin' as const, disabled: false }
    const enrollment = new RunnerEnrollmentService(store, 'pepper', 'https://hub.test', () => 1)
    const lifecycle = new RunnerLifecycleService(store, 'pepper', () => 2)
    const authenticator = new RunnerAuthenticator(store, 'pepper')
    const issued = enrollment.issue(subject, 'u1')
    const first = enrollment.exchange({ code: issued.code, profile: 'p1', machine: { id: 'm1', name: 'M', platform: 'linux', arch: 'x64' } })
    let mutations = 0
    const machine = { id: 'm1', namespace: 'o1' }
    const engine = { getMachine: () => null, getOrCreateMachine: () => { mutations++; return machine }, getMachineByNamespace: () => machine } as never
    const app = createCliRoutes(() => engine, authenticator)
    const request = (credential: { credentialId: string; secret: string }) => app.request('/machines', {
        method: 'POST',
        headers: { authorization: `Runner ${credential.credentialId}.${credential.secret}`, 'content-type': 'application/json', 'x-hapi-machine-id': 'm1' },
        body: JSON.stringify({ id: 'm1', metadata: {} })
    })

    expect((await request(first.credential)).status).toBe(200)
    const rotated = lifecycle.rotate(subject, first.runnerId, first.generation)
    expect((await request(first.credential)).status).toBe(401)
    expect(authenticator.authenticateAny(first.credential)).toBeNull()
    expect((await request(rotated.credential)).status).toBe(200)
    lifecycle.revoke(subject, first.runnerId)
    expect((await request(rotated.credential)).status).toBe(401)
    expect(authenticator.authenticateAny(rotated.credential)).toBeNull()
    expect(mutations).toBe(2)
})
