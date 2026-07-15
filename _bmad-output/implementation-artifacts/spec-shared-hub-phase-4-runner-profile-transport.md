---
title: 'Shared Hub Phase 4 Runner profile and transport authentication'
type: 'feature'
created: '2026-07-14'
status: 'in-review'
baseline_commit: 'c96229d5a11e2ed642c0c1c9b81419bae6570ee5'
context:
  - 'docs/superpowers/plans/2026-07-14-shared-hub-pilot-core-implementation-plan.md'
  - '_bmad-output/implementation-artifacts/shared-hub-pilot-core-checklist.md'
  - '_bmad-output/implementation-artifacts/spec-shared-hub-phase-4-enrollment-credential-core.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hub đã phát per-Runner credential nhưng CLI chưa thể enroll/lưu profile và Runner machine transport vẫn dùng shared `CLI_API_TOKEN`. Credential mới vì thế chưa vận hành được, còn nhiều Hub/profile không có state/lock/log isolation.

**Approach:** Thêm `hapi runner enroll --hub --code --profile`, profile filesystem an toàn, truyền profile rõ ràng vào daemon, và thay authentication cho machine REST/Socket.IO bằng Runner credential đã bind organization/Runner/machine. Interactive agent-session transport giữ legacy auth tạm thời đến Phase 5 nhưng không được fallback vào machine path.

## Boundaries & Constraints

**Always:** named profile bắt buộc; Hub URL canonical; profile dir `0700`, secret/state files `0600`; atomic same-directory write+fsync+rename; reject symlink/traversal/corrupt schema; credential không xuất hiện trong argv/env/log/state/command output; profile tách URL, credential, state, lock, log; Hub derive actor từ credential và compare bound machine; machine REST/socket reject shared token, wrong machine, rotated/revoked credential; Runner principal không được gọi session event family; stable sanitized errors; không backward compatibility cho global Runner state.

**Ask First:** xóa legacy auth khỏi interactive agent sessions; sửa semantics session/RPC/terminal; cleanup-only reconnect/tombstone acknowledgement; install systemd/LaunchAgent; bootstrap/update artifacts; online revoke disconnect.

**Never:** namespace hoặc client organization làm identity; secret trong query/header ngoài bounded Authorization envelope/socket auth; import legacy global Runner token/state; overwrite profile hiện có; fallback shared token cho Runner machine path; đánh dấu Phase 5 data-plane enforcement hoàn tất.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Enroll | valid Hub/code/new profile | exchange rồi atomic profile+credential save | used/rejected/unreachable/invalid response sanitized |
| Existing profile | same profile đã tồn tại | không exchange/overwrite | stable `profile_exists` |
| Start | valid profile | daemon dùng profile URL/machine/credential | corrupt/missing/locked fail closed |
| Multi-profile | hai Hub/profile | state, locks, logs, credentials cô lập | không cross-read/write |
| Machine REST/socket | valid active credential + bound machine | Runner actor context được derive | shared/wrong/rotated/revoked 401/403 |
| Event family | Runner principal gửi session event | reject/disconnect scoped socket | không mutate session state |

</frozen-after-approval>

## Code Map

- `shared/src/runnerEnrollment.ts`, `shared/src/socket.ts` — profile schema và discriminated Runner handshake contracts.
- `cli/src/runner/profile.ts` — secure profile layout/read/write/locking.
- `cli/src/runner/enrollmentClient.ts` — exchange HTTP client và response validation.
- `cli/src/commands/runner.ts` — enroll/start/stop/status/logs profile UX.
- `cli/src/configuration.ts`, `cli/src/persistence.ts` — profile-scoped path/state without mutable global secrets.
- `cli/src/runner/run.ts`, `cli/src/api/apiMachine.ts` — stored credential machine transport.
- `hub/src/web/routes/cli.ts`, `hub/src/socket/server.ts` — machine REST/socket principal authentication.
- `hub/src/socket/socketTypes.ts`, `hub/src/socket/handlers/cli/` — authoritative Runner/machine context và event-family guards.
- `hub/src/index.ts`, `hub/src/web/server.ts` — RunnerAuthenticator injection.

## Tasks & Acceptance

**Execution:**
- [x] Shared contracts — add strict versioned profile and bounded Runner handshake schemas.
- [x] `cli/src/runner/profile.ts` — implement isolated secure layout, atomic persistence, symlink defense và lock lifecycle.
- [x] `cli/src/runner/enrollmentClient.ts` — exchange without secret echo; validate Hub response and canonical URL.
- [x] `cli/src/commands/runner.ts` — add enroll/profile-aware lifecycle commands; remove `initializeToken()` from Runner start-sync path.
- [x] CLI configuration/persistence/runner/API machine — load profile explicitly; keep secrets out of args/env/state/logs; multi-profile isolation.
- [x] Hub `/cli` REST — authenticate machine endpoints only via Runner credential; derive organization/Runner/machine; reject legacy bearer.
- [x] Hub `/cli` Socket.IO — discriminated principal; Runner credential machine events only; enforce payload machine binding; preserve interactive session regression path.
- [x] Composition + focused tests + checklist — mount authenticator and verify filesystem, command, REST/socket isolation, revoke/rotate and redaction.

**Acceptance Criteria:**
- Given enrollment succeeds, when inspecting permissions/files/process args/env/logs, then only credential file contains secret and it is mode `0600` under `0700` profile dir.
- Given two profiles, when both daemons operate, then URL, machine, credential, state, lock and log never cross.
- Given valid shared token, when calling machine REST/socket path, then authentication fails; valid bound Runner credential succeeds.
- Given wrong machine, rotated or revoked credential, when connecting/registering, then fail closed before machine/session mutation.
- Given Runner socket principal, when sending session/RPC/terminal event family, then rejected without affecting interactive session behavior.
- Given corrupted/symlinked/partially-written profile, when starting, then fail closed with remediation and no secret/path disclosure.

## Spec Change Log

## Design Notes

Profile layout: `~/.hapi/profiles/<name>/{profile.json,credential.json,runner.state.json,locks/,logs/}`. Profile name dùng schema hiện có; resolved path phải nằm dưới profiles root. Write dùng exclusive temp mode `0600`, file fsync, atomic rename, directory fsync. Enrollment exchange hoàn tất trước local write; local write failure không re-exchange secret và báo recovery/re-enroll requirement, không in secret.

Machine REST dùng `Authorization: Runner <credentialId>.<secret>`; Hub lookup credential ID rồi derive organization/Runner/machine, không tin client organization. Socket auth mang bounded `{kind:'runner', credential, machineId}`; Hub compare machineId với binding. Legacy principal chỉ còn cho interactive session family; machine routes/events không có fallback. Runner principal bị từ chối khỏi session/RPC/terminal family trong slice này.

## Verification

**Commands:**
- `bun test shared/src/runnerEnrollment.test.ts cli/src/runner/profile.test.ts cli/src/runner/enrollmentClient.test.ts cli/src/commands/runner.test.ts cli/src/api/apiMachine.test.ts hub/src/web/routes/cli*.test.ts hub/src/socket/**/*.test.ts` — focused pass.
- `bun typecheck` — all workspaces pass.
- `bun run test` — full repository pass or unchanged Runner integration blocker recorded separately.
- `git diff --check` — pass.
- GitNexus change detection — approved flows only; all d=1 callers updated.

**Checkpoint 2026-07-14 — additive pre-boundary:** versioned bounded profile/credential/socket contracts; secure profile layout with `0700` directories, `0600` files, traversal/symlink rejection, exclusive lock, same-directory exclusive temp write, file fsync, atomic rename and directory fsync; canonical sanitized enrollment client; additive `runner enroll` UX that refuses existing profiles before exchange and never prints the secret. Verification: shared/CLI typecheck pass; profile/enrollment focused tests 4 pass. GitNexus could not resolve `runnerCommand`; impact attempt recorded. No Hub transport boundary edited. Work intentionally stops before CRITICAL `createSocketServer`/`createCliRoutes` and their `createWebApp`/`startWebServer`/`main` callers pending explicit approval for this run.

**Checkpoint 2026-07-14 — transport boundary implemented after explicit approval:** Runner profiles now drive daemon identity, state, lock, logs and machine transport without secret-bearing argv/env/state. Hub machine REST and Socket.IO authenticate credential-bound Runner principals, derive organization/machine scope, reject legacy machine auth, and preserve legacy session/RPC/terminal registration without machine events. Verification: Hub 342/342 pass; workspace typecheck pass; `git diff --check` pass; CLI 627 pass with 12 legacy `runner.integration.test.ts` failures, all `beforeEach` timeouts from the obsolete profile-less global runner harness. GitNexus change detection reports CRITICAL scope across the previously approved composition chains. Composition/checklist task remains open pending runner integration harness migration and final revoke/rotate/redaction acceptance review.

**Checkpoint 2026-07-14 — ready for review:** migrated Runner integration harness from legacy global state/control/logs to an isolated enrolled profile created per test process; `start` and duplicate `start-sync` pass only the non-secret profile name, while fixture credentials remain in mode-`0600` `credential.json` and the profile is removed after the suite. The external integration suite now skips when its credential fixture is absent instead of timing out against invalid shared machine auth. Added acceptance coverage proving secrets remain absent from profile/state, and rotated/revoked credentials fail before machine mutation through the authenticator used by REST and Socket.IO. Verification: focused profile/harness pass with external 12 skipped; CLI 628 pass/12 external skipped; Hub 343/343 pass; root `bun run test` pass; workspace typecheck pass; `git diff --check` pass.
