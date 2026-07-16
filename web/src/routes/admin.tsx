import { useState, useEffect, useCallback } from 'react'
import { useAppContext } from '@/lib/app-context'

type Member = {
    membershipId: string; invitedEmail: string; role: string; status: string
    identityId: string | null; identityIssuer: string | null; identitySubject: string | null; createdAt: number
}
type Runner = {
    id: string; ownerMembershipId: string; machineId: string; profile: string; name: string; status: string; createdAt: number
}
type Team = {
    id: string; organizationId: string; name: string; archivedAt: number | null
}
type TeamMember = { membershipId: string; role: 'owner' | 'member' }
type Grant = { id: string; principalType: 'user' | 'team'; principalId: string; resourceType: 'runner' | 'session'; resourceId: string; capability: string; expiresAt: number | null; createdAt: number }
type AuditEvent = { id: string; actorType: 'user' | 'runner'; actorId: string; action: string; resourceType: string; resourceId: string; outcome: string; createdAt: number }
type Tab = 'members' | 'teams' | 'runners' | 'audit'

export function AdminPage() {
    const { api, role } = useAppContext()
    const isAdmin = role === 'admin'
    const isViewer = role === 'viewer'
    const [tab, setTab] = useState<Tab>('members')
    const [members, setMembers] = useState<Member[]>([])
    const [runners, setRunners] = useState<Runner[]>([])
    const [teams, setTeams] = useState<Team[]>([])
    const [teamMembers, setTeamMembers] = useState<Record<string, TeamMember[]>>({})
    const [teamMemberSelection, setTeamMemberSelection] = useState<Record<string, string>>({})
    const [grants, setGrants] = useState<Grant[]>([])
    const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [newTeamName, setNewTeamName] = useState('')
    const [newTeamOwner, setNewTeamOwner] = useState('')
    const [showGrantForm, setShowGrantForm] = useState<string | null>(null)
    const [grantForm, setGrantForm] = useState<{ principalType: 'user' | 'team'; principalId: string; capability: 'view' | 'interact' | 'spawn' | 'operate' | 'manage'; expiresAt: string }>({ principalType: 'user', principalId: '', capability: 'view', expiresAt: '' })

    const refresh = useCallback(async () => {
        if (!api) return
        setLoading(true)
        try {
            const [memberRes, runnerRes, teamRes, grantRes, auditRes] = await Promise.all([
                api.listMembers(), api.listRunners(), api.listTeams(), api.listGrants(), api.listAuditEvents()
            ])
            setMembers(memberRes.members)
            setRunners(runnerRes.runners)
            setTeams(teamRes.teams)
            const memberEntries = await Promise.all(teamRes.teams.filter((team) => !team.archivedAt).map(async (team) =>
                [team.id, (await api.listTeamMembers(team.id)).members] as const))
            setTeamMembers(Object.fromEntries(memberEntries))
            setGrants(grantRes.grants)
            setAuditEvents(auditRes.events)
            setError(null)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load')
        } finally { setLoading(false) }
    }, [api])

    useEffect(() => { refresh() }, [refresh])
    useEffect(() => {
        const handleSharedHubUpdate = () => { void refresh() }
        window.addEventListener('hapi:shared-hub-updated', handleSharedHubUpdate)
        return () => window.removeEventListener('hapi:shared-hub-updated', handleSharedHubUpdate)
    }, [refresh])

    const handleRoleChange = async (id: string, role: string) => { if (!api) return; try { await api.updateMemberRole(id, role); refresh() } catch (e) { setError((e as Error).message) } }
    const handleStatusChange = async (id: string, status: string) => { if (!api) return; try { await api.updateMemberStatus(id, status); refresh() } catch (e) { setError((e as Error).message) } }
    const handleRevoke = async (id: string) => { if (!api || !window.confirm('Revoke this Runner? Active remote access will disconnect immediately.')) return; try { await api.revokeRunner(id); refresh() } catch (e) { setError((e as Error).message) } }
    const handleCreateTeam = async () => { if (!api || !newTeamName || !newTeamOwner) return; try { await api.createTeam(newTeamName, newTeamOwner); setNewTeamName(''); setNewTeamOwner(''); refresh() } catch (e) { setError((e as Error).message) } }
    const handleCreateGrant = async (runnerId: string) => {
        if (!api) return
        if (!window.confirm('Grant access to this whole Runner and every session on its machine?')) return
        try {
            await api.createGrant({
                principalType: grantForm.principalType,
                principalId: grantForm.principalId,
                resourceType: 'runner',
                resourceId: runnerId,
                capability: grantForm.capability,
                expiresAt: grantForm.expiresAt ? Number(grantForm.expiresAt) : null
            })
            setShowGrantForm(null)
            setError(null)
            refresh()
        } catch (e) { setError((e as Error).message) }
    }
    const handleRevokeGrant = async (grantId: string) => { if (!api) return; try { await api.revokeGrant(grantId); refresh() } catch (e) { setError((e as Error).message) } }
    const handleAddTeamMember = async (teamId: string) => { const membershipId = teamMemberSelection[teamId]; if (!api || !membershipId) return; try { await api.addTeamMember(teamId, membershipId); setTeamMemberSelection({ ...teamMemberSelection, [teamId]: '' }); refresh() } catch (e) { setError((e as Error).message) } }
    const handleRemoveTeamMember = async (teamId: string, membershipId: string) => { if (!api || !window.confirm('Remove this member from the Team? Team-derived access will be revoked immediately.')) return; try { await api.removeTeamMember(teamId, membershipId); refresh() } catch (e) { setError((e as Error).message) } }
    const handleTransferTeam = async (teamId: string, sourceMembershipId: string) => { const targetMembershipId = teamMemberSelection[teamId]; if (!api || !targetMembershipId || !window.confirm('Transfer Team ownership?')) return; try { await api.transferTeamOwnership(teamId, sourceMembershipId, targetMembershipId); refresh() } catch (e) { setError((e as Error).message) } }
    const handleArchiveTeam = async (teamId: string) => { if (!api || !window.confirm('Archive this Team? Its grants and membership access will stop.')) return; try { await api.archiveTeam(teamId); refresh() } catch (e) { setError((e as Error).message) } }
    const handleTransferRunner = async (runnerId: string) => { const target = window.prompt('Target membership ID'); if (!api || !target || !window.confirm('Transfer Runner ownership?')) return; try { await api.transferRunner(runnerId, target); refresh() } catch (e) { setError((e as Error).message) } }

    const ownerEmail = (id: string) => members.find((m) => m.membershipId === id)?.invitedEmail || id

    if (loading) return <div className="flex-1 overflow-auto p-6"><p className="text-sm text-muted-foreground">Loading...</p></div>

    return (
        <div className="flex-1 overflow-auto p-6">
            <h1 className="mb-6 text-xl font-semibold">Admin</h1>
            {error && <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

            <div className="mb-6 flex gap-1 border-b border-border">
                {(['members', 'teams', 'runners', 'audit'] as Tab[]).map((t) => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                        className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'}`}>
                        {t === 'members' ? 'Members' : t === 'teams' ? 'Teams' : t === 'runners' ? 'Runners' : 'Audit'}
                    </button>
                ))}
            </div>

            {tab === 'members' && (
                <div className="space-y-2">
                    {members.map((m) => (
                        <div key={m.membershipId} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-2">
                                    <span className={`inline-block size-1.5 rounded-full ${m.status === 'active' ? 'bg-green-500' : m.status === 'disabled' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                                    <span className="text-sm font-medium">{m.invitedEmail}</span>
                                    <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-accent-foreground">{m.role}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">{m.identitySubject ? `Bound to: ${m.identitySubject}` : 'Not claimed'} — {new Date(m.createdAt).toLocaleString()}</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {isAdmin && (
                                    <>
                                        <select value={m.role} onChange={(e) => handleRoleChange(m.membershipId, e.target.value)} className="rounded border border-input bg-background px-2 py-1 text-xs">
                                            <option value="admin">Admin</option><option value="member">Member</option><option value="viewer">Viewer</option>
                                        </select>
                                        {m.status === 'active' ? (
                                            <button type="button" onClick={() => handleStatusChange(m.membershipId, 'disabled')} className="text-xs text-destructive hover:underline">Disable</button>
                                        ) : (
                                            <button type="button" onClick={() => handleStatusChange(m.membershipId, 'active')} className="text-xs text-primary hover:underline">Enable</button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                    {members.length === 0 && <p className="text-sm text-muted-foreground">No members found.</p>}
                </div>
            )}

            {tab === 'teams' && (
                <div className="space-y-4">
                    {isAdmin && (
                        <div className="flex items-end gap-3">
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Team name</label>
                                <input type="text" value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring w-48" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-muted-foreground">Owner ID</label>
                                <select value={newTeamOwner} onChange={(e) => setNewTeamOwner(e.target.value)} className="rounded-lg border border-input bg-background px-3 py-2 text-sm w-56">
                                    <option value="">Select owner...</option>
                                    {members.filter((m) => m.status === 'active').map((m) => (
                                        <option key={m.membershipId} value={m.membershipId}>{m.invitedEmail} ({m.role})</option>
                                    ))}
                                </select>
                            </div>
                            <button type="button" onClick={handleCreateTeam} disabled={!newTeamName || !newTeamOwner} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Create</button>
                        </div>
                    )}
                    <div className="space-y-2">
                        {teams.map((t) => (
                            <div key={t.id} className="rounded-lg border border-border px-4 py-3 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className={`inline-block size-1.5 rounded-full ${t.archivedAt ? 'bg-muted-foreground' : 'bg-green-500'}`} />
                                    <span className="text-sm font-medium">{t.name}</span>
                                    {t.archivedAt && <span className="text-xs text-muted-foreground">(archived)</span>}
                                  </div>
                                  {isAdmin && !t.archivedAt && <button type="button" onClick={() => handleArchiveTeam(t.id)} className="text-xs text-destructive hover:underline">Archive</button>}
                                </div>
                                {!t.archivedAt && <>
                                    <div className="flex flex-wrap gap-2 text-xs">{(teamMembers[t.id] ?? []).map((member) => <span key={member.membershipId} className="rounded bg-secondary px-2 py-1">{ownerEmail(member.membershipId)} · {member.role} {isAdmin && <button type="button" onClick={() => handleRemoveTeamMember(t.id, member.membershipId)} className="ml-1 text-destructive">×</button>}</span>)}</div>
                                    {isAdmin && <div className="flex gap-2"><select value={teamMemberSelection[t.id] ?? ''} onChange={(e) => setTeamMemberSelection({ ...teamMemberSelection, [t.id]: e.target.value })} className="rounded border border-input bg-background px-2 py-1 text-xs"><option value="">Select member...</option>{members.filter((member) => member.status === 'active' && !(teamMembers[t.id] ?? []).some((teamMember) => teamMember.membershipId === member.membershipId)).map((member) => <option key={member.membershipId} value={member.membershipId}>{member.invitedEmail}</option>)}</select><button type="button" onClick={() => handleAddTeamMember(t.id)} className="text-xs text-primary">Add</button>{(teamMembers[t.id] ?? []).filter((member) => member.role === 'owner').map((owner) => <button key={owner.membershipId} type="button" onClick={() => handleTransferTeam(t.id, owner.membershipId)} className="text-xs text-primary">Transfer from {ownerEmail(owner.membershipId)}</button>)}</div>}
                                </>}
                            </div>
                        ))}
                        {teams.length === 0 && <p className="text-sm text-muted-foreground">No teams created.</p>}
                    </div>
                </div>
            )}

            {tab === 'runners' && (
                <div className="space-y-3">
                    {runners.map((r) => (
                        <div key={r.id} className="rounded-lg border border-border px-4 py-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className={`inline-block size-1.5 rounded-full ${r.status === 'active' ? 'bg-green-500' : r.status === 'revoked' ? 'bg-red-500' : 'bg-muted-foreground'}`} />
                                    <span className="text-sm font-medium">{r.name}</span>
                                    <span className="text-xs text-muted-foreground">({r.profile})</span>
                                    {r.status === 'active' && (
                                        <span className="rounded bg-yellow-500/10 px-1.5 py-0.5 text-xs text-yellow-600">⚠ Grants access to all sessions on this machine</span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {!isViewer && (
                                        <>
                                            <button type="button" onClick={() => setShowGrantForm(showGrantForm === r.id ? null : r.id)} className="text-xs text-primary hover:underline">Grant access</button>
                                            <button type="button" onClick={() => handleTransferRunner(r.id)} className="text-xs text-primary hover:underline">Transfer</button>
                                            {r.status === 'active' && (
                                                <button type="button" onClick={() => handleRevoke(r.id)} className="text-sm text-destructive hover:underline">Revoke</button>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                            <div className="flex gap-6 text-xs text-muted-foreground">
                                <span>Owner: {ownerEmail(r.ownerMembershipId)}</span>
                                <span>Machine: {r.machineId}</span>
                                <span>Created: {new Date(r.createdAt).toLocaleString()}</span>
                            </div>
                            {showGrantForm === r.id && (
                                <div className="rounded-lg bg-secondary/50 px-4 py-3 space-y-2">
                                    <p className="text-xs font-medium">Create grant for {r.name}</p>
                                    <div className="flex flex-wrap gap-2">
                                        <select value={grantForm.principalType} onChange={(e) => setGrantForm({ ...grantForm, principalType: e.target.value as 'user' | 'team' })} className="rounded border border-input bg-background px-2 py-1 text-xs">
                                            <option value="user">User</option><option value="team">Team</option>
                                        </select>
                                        {grantForm.principalType === 'user' ? (
                                            <select value={grantForm.principalId} onChange={(e) => setGrantForm({ ...grantForm, principalId: e.target.value })} className="rounded border border-input bg-background px-2 py-1 text-xs w-48">
                                                <option value="">Select user...</option>
                                                {members.filter((m) => m.status === 'active').map((m) => (
                                                    <option key={m.membershipId} value={m.membershipId}>{m.invitedEmail}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <select value={grantForm.principalId} onChange={(e) => setGrantForm({ ...grantForm, principalId: e.target.value })} className="rounded border border-input bg-background px-2 py-1 text-xs w-48">
                                                <option value="">Select team...</option>
                                                {teams.filter((t) => !t.archivedAt).map((t) => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                        )}
                                        <select value={grantForm.capability} onChange={(e) => setGrantForm({ ...grantForm, capability: e.target.value as 'view' | 'interact' | 'spawn' | 'operate' | 'manage' })} className="rounded border border-input bg-background px-2 py-1 text-xs">
                                            <option value="view">View</option><option value="interact">Interact</option><option value="spawn">Spawn</option><option value="operate">Operate</option><option value="manage">Manage</option>
                                        </select>
                                        <input type="text" value={grantForm.expiresAt} onChange={(e) => setGrantForm({ ...grantForm, expiresAt: e.target.value })} placeholder="Expiry (unix ms, optional)" className="rounded border border-input bg-background px-2 py-1 text-xs w-40" />
                                        <button type="button" onClick={() => handleCreateGrant(r.id)} disabled={!grantForm.principalId} className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Grant</button>
                                    </div>
                                    <p className="text-xs text-yellow-600">Granting operate or manage capability allows the principal to read/write files on this machine.</p>
                                </div>
                            )}
                            {grants.filter((grant) => grant.resourceType === 'runner' && grant.resourceId === r.id).map((grant) => (
                                <div key={grant.id} className="flex items-center justify-between rounded bg-secondary/40 px-3 py-2 text-xs">
                                    <span>{grant.principalType}: {grant.principalId} · {grant.capability} · {grant.expiresAt ? `expires ${new Date(grant.expiresAt).toLocaleString()}` : 'no expiry'}</span>
                                    {isAdmin && <button type="button" onClick={() => handleRevokeGrant(grant.id)} className="text-destructive hover:underline">Revoke grant</button>}
                                </div>
                            ))}
                        </div>
                    ))}
                    {runners.length === 0 && <p className="text-sm text-muted-foreground">No runners found.</p>}
                </div>
            )}

            {tab === 'audit' && (
                <div className="space-y-2">
                    {auditEvents.map((event) => (
                        <div key={event.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between gap-4">
                                <span className="font-medium">{event.action}</span>
                                <span className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString()}</span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">{event.actorType}:{event.actorId} → {event.resourceType}:{event.resourceId} · {event.outcome}</p>
                        </div>
                    ))}
                    {auditEvents.length === 0 && <p className="text-sm text-muted-foreground">No audit events found.</p>}
                </div>
            )}
        </div>
    )
}
