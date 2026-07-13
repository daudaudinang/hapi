# HAPI Shared Hub Internal Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Xây Shared Hub nội bộ có danh tính thật, Runner credential riêng, onboarding copy-paste và quyền truy cập an toàn để pilot cấp phòng.

**Architecture:** Shared Hub là control plane; Runner là execution agent chỉ kết nối outbound. Triển khai theo vertical slices: security boundary trước, zero-touch enrollment thứ hai, ownership/SSO tiếp theo, rồi audit và pilot operations.

**Tech Stack:** Bun workspaces, TypeScript strict, Hono, Socket.IO, Zod, `bun:sqlite`, React/TanStack Query, `jose`.

---

## Phạm vi release

### Release A — Shared Hub foundation

- `RequestContext`, actor và action catalog.
- Authorization tập trung nhưng giữ hành vi personal mode.
- Organization seed và Runner records.
- Test isolation REST/SSE/Socket.IO.

### Release B — Zero-touch Runner Enrollment

- Add Runner API và UI.
- Enrollment code one-time.
- `runner.sh` và `runner.ps1` mỏng.
- `hapi runner enroll` + service install.
- Runner credential riêng thay shared token trong shared mode.

### Release C — Internal access control

- OIDC adapter.
- User/membership/roles.
- Machine/session ownership và resource grants.
- Share UI.

### Release D — Audit, updates và pilot

- Audit events.
- Version manifest/checksum.
- Canary/pinned update.
- Backup, monitoring, restore drill.

---

## Task 1: Shared auth contracts

**Files:**
- Create: `shared/src/auth.ts`
- Create: `shared/src/runnerEnrollment.ts`
- Modify: `shared/src/types.ts`
- Modify: `shared/src/schemas.ts`
- Test: `shared/src/auth.test.ts`
- Test: `shared/src/runnerEnrollment.test.ts`

- [ ] **Step 1: Write failing schema tests**

```ts
import { describe, expect, it } from 'vitest'
import { ActorSchema, AuthorizationActionSchema } from './auth'
import { RunnerEnrollmentExchangeSchema } from './runnerEnrollment'

describe('Shared Hub contracts', () => {
    it('rejects actors without organization scope', () => {
        expect(ActorSchema.safeParse({ type: 'user', id: 'user-1' }).success).toBe(false)
    })

    it('accepts only declared authorization actions', () => {
        expect(AuthorizationActionSchema.parse('runner.enroll')).toBe('runner.enroll')
        expect(AuthorizationActionSchema.safeParse('runner.root').success).toBe(false)
    })

    it('does not expose a long-lived secret in enrollment input', () => {
        const parsed = RunnerEnrollmentExchangeSchema.parse({
            code: 'ABCD-EFGH',
            machine: { id: 'machine-1', platform: 'linux', arch: 'x64' }
        })
        expect(parsed).not.toHaveProperty('runnerSecret')
    })
})
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
bun run --cwd shared test auth.test.ts runnerEnrollment.test.ts
```

Expected: FAIL because schemas are not defined.

- [ ] **Step 3: Add strict shared types**

Define:

```ts
export const ActorSchema = z.object({
    type: z.enum(['user', 'runner']),
    id: z.string().min(1),
    organizationId: z.string().min(1)
})

export const AuthorizationActionSchema = z.enum([
    'organization.manage',
    'member.manage',
    'runner.enroll',
    'runner.view',
    'runner.operate',
    'runner.revoke',
    'machine.view',
    'machine.operate',
    'machine.manage',
    'session.create',
    'session.view',
    'session.operate',
    'session.manage',
    'terminal.open',
    'editor.read',
    'editor.write',
    'git.write'
])
```

Enrollment exchange input contains one-time code and machine identity. Output contains `runnerId`, plaintext secret returned once, Hub URL and update channel.

- [ ] **Step 4: Run tests and typecheck**

```bash
bun run --cwd shared test auth.test.ts runnerEnrollment.test.ts
bun run typecheck:shared
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/src/auth.ts shared/src/runnerEnrollment.ts shared/src/types.ts shared/src/schemas.ts shared/src/auth.test.ts shared/src/runnerEnrollment.test.ts
git commit -m "feat(shared): add Shared Hub auth and enrollment contracts"
```

## Task 2: Organization, Runner and enrollment persistence

**Files:**
- Modify: `hub/src/store/index.ts`
- Modify: `hub/src/store/types.ts`
- Create: `hub/src/store/organizationStore.ts`
- Create: `hub/src/store/runnerStore.ts`
- Create: `hub/src/store/runnerEnrollmentStore.ts`
- Test: `hub/src/store/runnerEnrollmentStore.test.ts`
- Test: `hub/src/store/sharedHubMigration.test.ts`

- [ ] **Step 1: Write failing persistence tests**

Cover:

```text
- organization seed created exactly once
- enrollment code stored as hash, never plaintext
- expired code rejected
- code consumed once atomically
- Runner secret stored as hash
- revoking one Runner does not revoke another
```

- [ ] **Step 2: Run RED test**

```bash
bun run --cwd hub test src/store/runnerEnrollmentStore.test.ts src/store/sharedHubMigration.test.ts
```

Expected: FAIL because stores and tables do not exist.

- [ ] **Step 3: Add next SQLite schema migration**

Create tables:

```sql
organizations(id, name, slug, status, created_at)
runners(id, organization_id, machine_id, owner_user_id, name, credential_hash, status, update_channel, last_seen_at, revoked_at, created_at)
runner_enrollments(id, organization_id, created_by_user_id, code_hash, expires_at, consumed_at, cancelled_at, created_at)
```

Add indexes on organization, machine, active enrollment expiration and Runner status.

- [ ] **Step 4: Implement stores**

Store API must expose operations, not raw SQL:

```ts
createEnrollment(input)
consumeEnrollment(codeHash, now)
createRunner(input)
findRunnerById(id)
findRunnerByMachineId(organizationId, machineId)
revokeRunner(id, now)
updateRunnerLastSeen(id, now)
```

`consumeEnrollment` must use one transaction and an update condition containing `consumed_at IS NULL`, `cancelled_at IS NULL`, `expires_at > now`.

- [ ] **Step 5: Run GREEN tests**

```bash
bun run --cwd hub test src/store/runnerEnrollmentStore.test.ts src/store/sharedHubMigration.test.ts
bun run typecheck:hub
```

- [ ] **Step 6: Commit**

```bash
git add hub/src/store
git commit -m "feat(hub): persist Runner enrollment and credentials"
```

## Task 3: Enrollment service and HTTP API

**Files:**
- Create: `hub/src/runnerEnrollment/runnerEnrollmentService.ts`
- Create: `hub/src/runnerEnrollment/runnerCredentialService.ts`
- Create: `hub/src/web/routes/runnerEnrollments.ts`
- Modify: `hub/src/web/server.ts`
- Test: `hub/src/web/routes/runnerEnrollments.test.ts`

- [ ] **Step 1: Write failing route tests**

Test:

```text
POST /api/runner-enrollments requires authenticated user
POST returns code, expiresAt and platform commands
POST /api/runner-enrollments/exchange is public but code-bound
exchange consumes code once
second exchange returns 409 enrollment_used
expired exchange returns 410 enrollment_expired
response returns Runner secret once
```

- [ ] **Step 2: Run RED test**

```bash
bun run --cwd hub test src/web/routes/runnerEnrollments.test.ts
```

- [ ] **Step 3: Implement service**

Use `crypto.getRandomValues` for enrollment code and Runner secret. Hash with SHA-256 plus server-side pepper from configuration. Never log plaintext values.

- [ ] **Step 4: Implement routes**

```text
POST   /api/runner-enrollments
GET    /api/runner-enrollments/:id
DELETE /api/runner-enrollments/:id
POST   /api/runner-enrollments/exchange
```

Create response commands for `darwin`, `linux`, and `windows`, but command generation must live in one helper and URL-encode all values.

- [ ] **Step 5: Run GREEN tests**

```bash
bun run --cwd hub test src/web/routes/runnerEnrollments.test.ts
bun run typecheck:hub
```

- [ ] **Step 6: Commit**

```bash
git add hub/src/runnerEnrollment hub/src/web/routes/runnerEnrollments.ts hub/src/web/server.ts
git commit -m "feat(hub): add one-time Runner enrollment API"
```

## Task 4: Runner credential persistence and enroll command

**Files:**
- Modify: `cli/src/persistence.ts`
- Modify: `cli/src/configuration.ts`
- Modify: `cli/src/commands/runner.ts`
- Create: `cli/src/runner/credentials.ts`
- Create: `cli/src/runner/enrollment.ts`
- Test: `cli/src/runner/enrollment.test.ts`
- Test: `cli/src/runner/credentials.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Test:

```text
- enroll exchanges code against selected Hub URL
- credentials saved atomically with mode 0600 on POSIX
- logs never contain Runner secret
- existing enrollment to another Hub stops with explicit conflict
- rerunning against same Hub is idempotent
```

- [ ] **Step 2: Run RED tests**

```bash
bun run --cwd cli test src/runner/enrollment.test.ts src/runner/credentials.test.ts
```

- [ ] **Step 3: Add credential shape**

```ts
type RunnerCredentials = {
    hubUrl: string
    runnerId: string
    runnerSecret: string
    organizationId: string
    updateChannel: 'stable' | 'canary' | 'pinned'
}
```

Store separately from `settings.json` in `runner.credentials.json`; use atomic temp-file rename and restrictive permissions.

- [ ] **Step 4: Add command**

```bash
hapi runner enroll --hub <url> --code <code> --install-service --start
```

Exit codes:

```text
0 success/idempotent
2 invalid arguments
3 enrollment rejected/expired
4 Hub conflict
5 service install failed
6 Runner start failed
```

- [ ] **Step 5: Run GREEN tests**

```bash
bun run --cwd cli test src/runner/enrollment.test.ts src/runner/credentials.test.ts
bun run typecheck:cli
```

- [ ] **Step 6: Commit**

```bash
git add cli/src/persistence.ts cli/src/configuration.ts cli/src/commands/runner.ts cli/src/runner/credentials.ts cli/src/runner/enrollment.ts cli/src/runner/*.test.ts
git commit -m "feat(cli): enroll Runner with Shared Hub credentials"
```

## Task 5: Authenticate `/cli` with Runner credentials

**Files:**
- Modify: `hub/src/socket/server.ts`
- Create: `hub/src/auth/runnerAuthenticator.ts`
- Modify: `cli/src/api/auth.ts`
- Modify: `cli/src/runner/controlClient.ts`
- Test: `hub/src/socket/runnerAuthentication.test.ts`
- Test: `cli/src/api/auth.test.ts`

- [ ] **Step 1: Write failing transport tests**

Cover valid credential, wrong secret, revoked Runner, machine mismatch and last-seen update. Ensure a credential for Runner A cannot announce machine B.

- [ ] **Step 2: Run RED tests**

```bash
bun run --cwd hub test src/socket/runnerAuthentication.test.ts
bun run --cwd cli test src/api/auth.test.ts
```

- [ ] **Step 3: Add explicit deployment modes**

```text
HAPI_DEPLOYMENT_MODE=personal
HAPI_DEPLOYMENT_MODE=shared
```

Personal mode retains existing access-token behavior. Shared mode rejects shared `CLI_API_TOKEN` on `/cli` and requires Runner credentials.

- [ ] **Step 4: Bind socket identity**

After authentication:

```ts
socket.data.actor = {
    type: 'runner',
    id: runner.id,
    organizationId: runner.organizationId
}
socket.data.machineId = runner.machineId
```

Handlers must use this identity rather than namespace supplied by client payload.

- [ ] **Step 5: Run GREEN and regression tests**

```bash
bun run --cwd hub test src/socket/runnerAuthentication.test.ts src/socket/handlers/cli
bun run --cwd cli test src/api/auth.test.ts
bun run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add hub/src/socket/server.ts hub/src/auth/runnerAuthenticator.ts hub/src/socket/runnerAuthentication.test.ts cli/src/api/auth.ts cli/src/api/auth.test.ts cli/src/runner/controlClient.ts
git commit -m "feat: authenticate Shared Hub Runners independently"
```

## Task 6: Bootstrap scripts and artifact manifest

**Files:**
- Create: `hub/src/web/install/runner.sh`
- Create: `hub/src/web/install/runner.ps1`
- Create: `shared/src/versionManifest.ts`
- Create: `scripts/generate-runner-manifest.ts`
- Modify: `scripts/release.ts`
- Test: `hub/src/web/install/runnerScripts.test.ts`
- Test: `scripts/generate-runner-manifest.test.ts`

- [ ] **Step 1: Write static script safety tests**

Assert scripts:

```text
- enable fail-fast (`set -eu` / `$ErrorActionPreference = 'Stop'`)
- reject unsupported OS/architecture
- download to temporary path
- verify SHA-256 before execution
- do not invoke sudo automatically
- call one shared `hapi runner enroll` command
- remove temporary files on exit
```

- [ ] **Step 2: Run RED tests**

```bash
bun run --cwd hub test src/web/install/runnerScripts.test.ts
bun test scripts/generate-runner-manifest.test.ts
```

- [ ] **Step 3: Generate manifest during release**

Manifest includes version, channel, artifact URL, size and SHA-256 for:

```text
darwin-arm64
darwin-x64
linux-arm64
linux-x64
windows-x64
```

- [ ] **Step 4: Implement thin scripts**

Scripts accept Hub URL and enrollment code, download the matching artifact, verify checksum, install user-local and call:

```bash
hapi runner enroll --hub "$HAPI_HUB_URL" --code "$HAPI_ENROLLMENT_CODE" --install-service --start
```

- [ ] **Step 5: Run GREEN tests and shell syntax checks**

```bash
bash -n hub/src/web/install/runner.sh
bun run --cwd hub test src/web/install/runnerScripts.test.ts
bun test scripts/generate-runner-manifest.test.ts
```

Run PowerShell parser test in Windows CI before merging.

- [ ] **Step 6: Commit**

```bash
git add hub/src/web/install shared/src/versionManifest.ts scripts/generate-runner-manifest.ts scripts/generate-runner-manifest.test.ts scripts/release.ts
git commit -m "feat: add verified Runner bootstrap artifacts"
```

## Task 7: Cross-platform service installation

**Files:**
- Create: `cli/src/runner/serviceInstaller.ts`
- Create: `cli/src/runner/platform/darwin.ts`
- Create: `cli/src/runner/platform/linux.ts`
- Create: `cli/src/runner/platform/windows.ts`
- Test: `cli/src/runner/serviceInstaller.test.ts`

- [ ] **Step 1: Write failing platform adapter tests**

Verify generated definitions:

```text
macOS: LaunchAgent, user context, restart on failure
Linux: systemd --user unit, restart on failure
Windows: Task Scheduler entry at user logon
```

No adapter may silently overwrite an existing service pointing to another Hub.

- [ ] **Step 2: Run RED test**

```bash
bun run --cwd cli test src/runner/serviceInstaller.test.ts
```

- [ ] **Step 3: Implement adapter interface**

```ts
interface RunnerServiceInstaller {
    inspect(): Promise<ServiceState>
    install(command: RunnerServiceCommand): Promise<void>
    start(): Promise<void>
    stop(): Promise<void>
    uninstall(): Promise<void>
}
```

- [ ] **Step 4: Run GREEN tests**

```bash
bun run --cwd cli test src/runner/serviceInstaller.test.ts
bun run typecheck:cli
```

Platform smoke tests must run on macOS, Linux and Windows CI runners.

- [ ] **Step 5: Commit**

```bash
git add cli/src/runner/serviceInstaller.ts cli/src/runner/platform cli/src/runner/serviceInstaller.test.ts
git commit -m "feat(cli): install Runner as a user service"
```

## Task 8: Add Runner web flow

**Files:**
- Create: `web/src/components/RunnerEnrollment/AddRunnerDialog.tsx`
- Create: `web/src/components/RunnerEnrollment/EnrollmentStatus.tsx`
- Create: `web/src/hooks/mutations/useCreateRunnerEnrollment.ts`
- Create: `web/src/hooks/queries/useRunnerEnrollment.ts`
- Modify: `web/src/api/client.ts`
- Modify: `web/src/components/Dashboard/index.tsx`
- Test: `web/src/components/RunnerEnrollment/AddRunnerDialog.test.tsx`

- [ ] **Step 1: Write failing UI tests**

Cover:

```text
- OS tabs Windows/macOS/Linux
- generated command displayed and copied
- status Waiting → Connected
- expired code offers Generate new code
- dialog never displays Runner long-lived secret
- accessibility names exist for copy and close actions
```

- [ ] **Step 2: Run RED test**

```bash
bun run --cwd web test src/components/RunnerEnrollment/AddRunnerDialog.test.tsx
```

- [ ] **Step 3: Implement API hooks and dialog**

Poll enrollment every two seconds only while status is `waiting`; stop on `connected`, `expired`, `cancelled` or dialog close.

- [ ] **Step 4: Run GREEN tests and typecheck**

```bash
bun run --cwd web test src/components/RunnerEnrollment/AddRunnerDialog.test.tsx
bun run typecheck:web
```

- [ ] **Step 5: Commit**

```bash
git add web/src/components/RunnerEnrollment web/src/hooks/mutations/useCreateRunnerEnrollment.ts web/src/hooks/queries/useRunnerEnrollment.ts web/src/api/client.ts web/src/components/Dashboard/index.tsx
git commit -m "feat(web): add copy-paste Runner onboarding"
```

## Task 9: Authorization boundary and realtime isolation

**Files:**
- Create: `hub/src/auth/requestContext.ts`
- Create: `hub/src/auth/authorizationService.ts`
- Modify: `hub/src/web/middleware/auth.ts`
- Modify: `hub/src/sse/sseManager.ts`
- Modify: `hub/src/socket/server.ts`
- Modify: `hub/src/sync/rpcGateway.ts`
- Test: `hub/src/auth/authorizationService.test.ts`
- Test: `hub/src/sse/sseAuthorization.test.ts`
- Test: `hub/src/socket/sharedHubIsolation.test.ts`

- [ ] **Step 1: Write two-actor isolation tests**

Create users A/B and Runners A/B in one organization. Assert A cannot see or operate B until a grant exists. Repeat for REST, SSE, terminal Socket.IO and RPC.

- [ ] **Step 2: Run RED tests**

```bash
bun run --cwd hub test src/auth/authorizationService.test.ts src/sse/sseAuthorization.test.ts src/socket/sharedHubIsolation.test.ts
```

- [ ] **Step 3: Implement centralized checks**

Initial rules:

```text
organization admin → manage all organization resources
resource owner → manage owned resource
explicit view grant → read only
explicit operate grant → read and operate
explicit manage grant → read, operate and share
otherwise → deny
```

- [ ] **Step 4: Run GREEN and route regression suite**

```bash
bun run --cwd hub test src/auth src/sse src/socket src/web/routes
bun run typecheck:hub
```

- [ ] **Step 5: Commit**

```bash
git add hub/src/auth hub/src/web/middleware/auth.ts hub/src/sse/sseManager.ts hub/src/socket/server.ts hub/src/sync/rpcGateway.ts hub/src/**/*.test.ts
git commit -m "feat(hub): enforce Shared Hub resource authorization"
```

## Task 10: Pilot release gate

**Files:**
- Create: `docs/shared-hub/pilot-runbook.md`
- Create: `docs/shared-hub/security-checklist.md`
- Create: `docs/shared-hub/restore-drill.md`
- Modify: `.github/workflows/*` where release matrix lives

- [ ] **Step 1: Add release matrix verification**

Build and checksum all supported Runner artifacts. Run CLI smoke tests on Linux, macOS and Windows.

- [ ] **Step 2: Run full repository verification**

```bash
bun typecheck
bun run test
bun run build:single-exe:all
```

Expected: all commands exit 0.

- [ ] **Step 3: Run security scenarios**

```text
expired enrollment rejected
reused enrollment rejected
revoked Runner disconnected and denied reconnect
User A denied Runner B
SSE does not leak Runner B events
terminal cannot attach without operate permission
artifact checksum mismatch aborts install
rollback restores previous Runner binary
```

- [ ] **Step 4: Run backup/restore drill**

Create enrollment, Runner and session records; back up SQLite; restore into clean Hub; verify records and Runner reconnection policy.

- [ ] **Step 5: Pilot rollout**

```text
Day 1: 2 canary users
Day 3: 5 users
Week 2: 10 users
Week 3: review security/operations evidence
```

Do not expand rollout while any Sev-1/Sev-2 issue remains open.

- [ ] **Step 6: Commit operational docs**

```bash
git add docs/shared-hub .github/workflows
git commit -m "docs: add Shared Hub pilot release gates"
```

---

## Verification evidence required per release

| Release | Required evidence |
| --- | --- |
| A | Cross-namespace/context isolation tests; no route bypass |
| B | One-time code tests; secret redaction; three-OS service smoke tests |
| C | Two-user resource isolation across REST/SSE/Socket.IO/RPC |
| D | Audit coverage, artifact checksum, update rollback, backup restore |

## Rollback

- Shared mode remains behind `HAPI_DEPLOYMENT_MODE=shared` until pilot gate passes.
- Personal deployments continue with `HAPI_DEPLOYMENT_MODE=personal`.
- Runner keeps previous binary for one-version rollback.
- Enrollment schema migrations require database backup before deployment.
- Revoking all newly enrolled Runners and reverting Hub code restores pre-pilot connectivity only for personal-mode deployments; shared-mode Runner credentials are not converted back into a common token.
