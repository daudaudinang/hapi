export type SharedWebAppEnv = {
    Variables: {
        membershipId: string
        organizationId: string
        organizationRole: 'admin' | 'member' | 'viewer'
        namespace: string
        userId?: number
    }
}
