import type { TerminalScopeTyped } from '@hapi/protocol'

export function terminalScopeRoom(namespace: string, scope: TerminalScopeTyped): string {
    const encodedNamespace = encodeURIComponent(namespace)
    return scope.scopeType === 'session'
        ? `terminal:${encodedNamespace}:session:${scope.sessionId}`
        : `terminal:${encodedNamespace}:machine:${scope.machineId}`
}
