import { describe, expect, it } from 'bun:test'
import { AuthorizationService } from './authorizationService'
import { CAPABILITY_RANK, AuthorizationActionSchema, type Capability, type OrganizationRole } from '@hapi/protocol/auth'

const service = new AuthorizationService()
const runner = { type: 'runner' as const, id: 'r1', organizationId: 'o1', ownerMembershipId: 'owner' }

describe('AuthorizationService', () => {
    it('gives admins full access and fails closed across organizations/disabled users', () => {
        expect(service.can({ membershipId: 'a', organizationId: 'o1', role: 'admin', disabled: false }, 'runner.revoke', runner, [])).toBeTrue()
        expect(service.can({ membershipId: 'a', organizationId: 'o2', role: 'admin', disabled: false }, 'runner.view', runner, [])).toBeFalse()
        expect(service.can({ membershipId: 'a', organizationId: 'o1', role: 'admin', disabled: true }, 'runner.view', runner, [])).toBeFalse()
    })

    it('applies cumulative grants, expiry and Viewer hard cap', () => {
        const operate = [{ capability: 'operate' as const, expiresAt: null, source: 'team' as const }]
        expect(service.can({ membershipId: 'm', organizationId: 'o1', role: 'member', disabled: false }, 'runner.view', runner, operate)).toBeTrue()
        expect(service.can({ membershipId: 'm', organizationId: 'o1', role: 'viewer', disabled: false }, 'runner.operate', runner, operate)).toBeFalse()
        expect(service.can({ membershipId: 'm', organizationId: 'o1', role: 'viewer', disabled: false }, 'runner.view', runner, [])).toBeTrue()
        expect(service.can({ membershipId: 'm', organizationId: 'o1', role: 'member', disabled: false }, 'runner.view', runner, [{ ...operate[0], expiresAt: 1 }], 2)).toBeFalse()
    })

    it('reserves lifecycle for owner/admin and keeps session grants read-only', () => {
        const manage = [{ capability: 'manage' as const, expiresAt: null, source: 'direct' as const }]
        const member = { membershipId: 'm', organizationId: 'o1', role: 'member' as const, disabled: false }
        expect(service.can(member, 'runner.revoke', runner, manage)).toBeFalse()
        expect(service.can(member, 'session.interact', { ...runner, type: 'session' }, manage)).toBeFalse()
        const owner = { ...member, membershipId: 'owner' }
        expect(service.can(owner, 'organization.manage', runner, [])).toBeFalse()
        expect(service.can(owner, 'member.manage', runner, [])).toBeFalse()
        expect(service.can(owner, 'team.manage', runner, [])).toBeFalse()
    })

    it('matches the Cartesian role, ownership, grant, action, expiry and status contract', () => {
        const required: Partial<Record<(typeof AuthorizationActionSchema.options)[number], Capability>> = {
            'runner.view': 'view', 'runner.interact': 'interact', 'runner.spawn': 'spawn',
            'runner.operate': 'operate', 'runner.manage': 'manage', 'session.view': 'view',
            'session.interact': 'interact', 'session.operate': 'operate', 'terminal.open': 'operate',
            'editor.read': 'view', 'editor.write': 'operate', 'files.read': 'view', 'files.write': 'operate',
            'git.read': 'view', 'git.write': 'operate', 'rpc.invoke': 'operate',
            'permission.respond': 'interact', 'team-chat.read': 'view', 'team-chat.write': 'interact'
        }
        const lifecycle = new Set(['runner.transfer', 'runner.archive', 'runner.revoke', 'runner.credential.rotate'])
        const grantCases: Array<{ source: 'none' | 'direct' | 'team'; capability: Capability | null }> = [
            { source: 'none', capability: null },
            ...(['direct', 'team'] as const).flatMap((source) =>
                (['view', 'interact', 'spawn', 'operate', 'manage'] as const).map((capability) => ({ source, capability })))
        ]
        let assertions = 0
        for (const role of ['admin', 'member', 'viewer'] as const satisfies readonly OrganizationRole[]) {
            for (const owner of [false, true]) for (const grantCase of grantCases) {
                for (const action of AuthorizationActionSchema.options) for (const active of [false, true]) for (const disabled of [false, true]) {
                    const resource = {
                        type: action.startsWith('session.') ? 'session' as const : 'runner' as const,
                        id: 'resource', organizationId: 'o1', ownerMembershipId: owner ? 'actor' : 'other'
                    }
                    const grants = grantCase.capability ? [{
                        capability: grantCase.capability,
                        expiresAt: active ? null : 9,
                        source: grantCase.source === 'team' ? 'team' as const : 'direct' as const
                    }] : []
                    const capability = required[action]
                    const expected = !disabled && (
                        role === 'admin'
                        || (role === 'viewer' ? capability === 'view'
                            : action === 'organization.manage' || action === 'member.manage' || action === 'team.manage' ? false
                                : lifecycle.has(action) ? owner
                                    : capability === undefined ? false
                                        : owner ? true
                                            : Boolean(grantCase.capability && active
                                                && CAPABILITY_RANK[grantCase.capability] >= CAPABILITY_RANK[capability]
                                                && !(resource.type === 'session' && capability !== 'view')))
                    )
                    expect(service.can({ membershipId: 'actor', organizationId: 'o1', role, disabled }, action, resource, grants, 10)).toBe(expected)
                    assertions++
                }
            }
        }
        expect(assertions).toBe(6864)
    })

})
