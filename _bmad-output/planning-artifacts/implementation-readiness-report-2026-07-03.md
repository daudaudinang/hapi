---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
inputDocuments:
  - _bmad-output/planning-artifacts/prd-session-scoped-terminal-lifecycle.md
  - _bmad-output/planning-artifacts/architecture-session-scoped-terminal-lifecycle.md
  - _bmad-output/planning-artifacts/epics.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-07-03
**Project:** hapi

## Document Inventory

### PRD Files Found

**Whole Documents:**
- `_bmad-output/planning-artifacts/prd-session-scoped-terminal-lifecycle.md` (4692 bytes, modified 2026-07-02 23:54)

**Sharded Documents:**
- None found.

### Architecture Files Found

**Whole Documents:**
- `_bmad-output/planning-artifacts/architecture-session-scoped-terminal-lifecycle.md` (4438 bytes, modified 2026-07-02 23:54)

**Sharded Documents:**
- None found.

### Epics & Stories Files Found

**Whole Documents:**
- `_bmad-output/planning-artifacts/epics.md` (43010 bytes, modified 2026-07-03 01:18)

**Sharded Documents:**
- None found.

### UX Design Files Found

**Whole Documents:**
- None found.

**Sharded Documents:**
- None found.

## Issues Found

- No duplicate whole/sharded documents found.
- UX design contract not found. This is acceptable for this feature because UX requirements were extracted from the committed lifecycle plan and included as UX-DR items in `epics.md`.

## Documents Selected for Assessment

- PRD: `_bmad-output/planning-artifacts/prd-session-scoped-terminal-lifecycle.md`
- Architecture: `_bmad-output/planning-artifacts/architecture-session-scoped-terminal-lifecycle.md`
- Epics & Stories: `_bmad-output/planning-artifacts/epics.md`
- UX: none standalone; use UX-DR section inside `epics.md`

## PRD Analysis

### Functional Requirements

FR1: Modal terminal và editor terminal phải dùng chung danh sách session terminal.
FR2: Terminal phải sống theo session, không theo browser/modal/component.
FR3: Đóng browser/tab/modal/route/editor tab chỉ detach, không kill process.
FR4: User explicit close một terminal mới kill đúng terminal đó.
FR5: Archive session phải kill toàn bộ terminal của session qua internal path.
FR6: Web/browser không được gọi `close-all`.
FR7: Mỗi session tối đa 3 live terminals.
FR8: CLI `TerminalManager` là source of truth cho list, limit, timer, replay, cleanup.
FR9: Hub chỉ làm authenticated Socket.IO routing/control plane.
FR10: Scope room phải theo exact scope `terminal:session:${sessionId}` hoặc `terminal:machine:${machineId}`.
FR11: Session A không được nhận output/list/warning/close của Session B.
FR12: Machine/project terminals giữ legacy behavior trong wave này.
FR13: CLI crash/restart không được giả terminal cũ còn sống; UI phải hiển thị `lost` hoặc recovery state.
FR14: Reconnect phải nhận bounded output replay đúng terminal, không cross-session.
FR15: Idle warning sau 2h không input/output.
FR16: Idle kill sau 4h không input/output.
FR17: Hard kill sau 24h tổng vòng đời; keepalive không reset hard lifetime.
FR18: UI phải hiển thị warning, close reason, lost/closed CTA, count `n/3`.

Total FRs: 18

### Non-Functional Requirements

NFR1: Không persist raw terminal output ngoài CLI memory.
NFR2: Không log raw output, typed input, command, env, token, cookie.
NFR3: Output replay buffer phải bounded ở `MAX_OUTPUT_BUFFER_CHARS = 200_000`.
NFR4: Cleanup phải clear buffer, timers, process refs.
NFR5: Process cleanup phải dùng SIGTERM rồi SIGKILL grace.
NFR6: Max-3 phải enforce atomic ở CLI; hub preflight chỉ advisory.
NFR7: Timer logic phải test được bằng fake clock hoặc injected clock.
NFR8: Auth/namespace check bắt buộc cho list/create/attach/close/keepalive.
NFR9: Scope routing không được dùng mutable global subscription gây leak.
NFR10: Protocol thay đổi yêu cầu hub + CLI + web cùng build.
NFR11: Rollback bằng revert branch; nếu leak process thì restart CLI hoặc archive session.
NFR12: Logs/metrics chỉ dùng metadata an toàn: namespace, sessionId, terminalId, reason, ageMs, idleMs, clientCount, liveCount.

Total NFRs: 12

### Additional Requirements

- In scope: session-scoped terminals for modal, editor, legacy session terminal route.
- In scope: shared terminal tabs UI, terminal list/count/warning/closed/lost UX, archive cleanup, idle/hard timeout, auth/scope routing.
- Out of scope: machine/project terminal durability change, process persistence across CLI crash/restart, web-callable close-all.

### PRD Completeness Assessment

PRD đủ để validate implementation readiness. PRD ngắn nhưng traceable: 18 FR, 12 NFR, source AC list rõ. UX standalone không có, nhưng UX obligations có trong epics UX-DR section.

## Epic Coverage Validation

### Coverage Matrix

| FR Number | PRD Requirement | Epic/Story Coverage | Status |
|---|---|---|---|
| FR1 | Modal terminal và editor terminal phải dùng chung danh sách session terminal. | Epic 1 / Stories 1.4 | ✓ Covered |
| FR2 | Terminal phải sống theo session, không theo browser/modal/component. | Epic 1 / Stories 1.2, 1.4 | ✓ Covered |
| FR3 | Đóng browser/tab/modal/route/editor tab chỉ detach, không kill process. | Epic 1 / Stories 1.2, 1.3, 1.4 | ✓ Covered |
| FR4 | User explicit close một terminal mới kill đúng terminal đó. | Epic 1 / Stories 1.2, 1.4 | ✓ Covered |
| FR5 | Archive session phải kill toàn bộ terminal của session qua internal path. | Epic 3 / Stories 3.1, 3.2 | ✓ Covered |
| FR6 | Web/browser không được gọi `close-all`. | Epic 3 / Story 3.1 | ✓ Covered |
| FR7 | Mỗi session tối đa 3 live terminals. | Epic 1 + 4 / Stories 1.2, 4.2 | ✓ Covered |
| FR8 | CLI `TerminalManager` là source of truth cho list, limit, timer, replay, cleanup. | Epic 1 / Story 1.2 | ✓ Covered |
| FR9 | Hub chỉ làm authenticated Socket.IO routing/control plane. | Epic 1 + 3 / Stories 1.3, 3.1, 3.2 | ✓ Covered |
| FR10 | Scope room phải theo exact scope `terminal:session:${sessionId}` hoặc `terminal:machine:${machineId}`. | Epic 1 + 3 / Stories 1.3, 3.1 | ✓ Covered |
| FR11 | Session A không được nhận output/list/warning/close của Session B. | Epic 3 + 4 / Stories 1.3, 4.2 | ✓ Covered |
| FR12 | Machine/project terminals giữ legacy behavior trong wave này. | Epic 1 + 3 + 4 / Stories 1.5, 3.2, 4.4 | ✓ Covered |
| FR13 | CLI crash/restart không được giả terminal cũ còn sống; UI phải hiển thị `lost` hoặc recovery state. | Epic 4 / Story 4.1 | ✓ Covered |
| FR14 | Reconnect phải nhận bounded output replay đúng terminal, không cross-session. | Epic 1 + 4 / Stories 1.2, 4.3 | ✓ Covered |
| FR15 | Idle warning sau 2h không input/output. | Epic 2 / Stories 2.1, 2.3 | ✓ Covered |
| FR16 | Idle kill sau 4h không input/output. | Epic 2 / Story 2.2 | ✓ Covered |
| FR17 | Hard kill sau 24h tổng vòng đời; keepalive không reset hard lifetime. | Epic 2 / Stories 2.1, 2.2 | ✓ Covered |
| FR18 | UI phải hiển thị warning, close reason, lost/closed CTA, count `n/3`. | Epic 1 + 2 + 4 / Stories 1.4, 2.3, 4.1 | ✓ Covered |

### Missing Requirements

None.

### Coverage Statistics

- Total PRD FRs: 18
- FRs covered in epics/stories: 18
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

Standalone UX document: Not found.

UX is implied because PRD and architecture include user-facing web terminal UI: modal, editor, legacy route, warning banners, count, close confirmation, archive confirmation, closed/lost CTA, localized copy.

### Alignment Issues

No blocking UX alignment issue after review. UX requirements are captured as UX-DR1 through UX-DR10 in `epics.md` and mapped to stories:

- UX-DR1-4: Story 1.4
- UX-DR5-8: Story 2.3
- UX-DR9: Story 3.3
- UX-DR10: Stories 2.3, 3.3

### Warnings

- Warning: no standalone UX design contract exists. Risk acceptable because this feature is workflow/lifecycle heavy and UX requirements were extracted from committed plan.
- Minor gap found during review: Story 1.4 missed first-empty-list auto-create/stable CLI list behavior from source plan. Fixed in `epics.md`.

### Architecture Support

Architecture supports UX needs through `SessionTerminalTabs`, `useTerminalSocket`, list/count state, warning payloads, keepalive, close confirmation, closed/lost state, and localized strings.

## Epic Quality Review

### Overall Verdict

Pass after fixes. 4 epics are acceptable for BMAD because they are user/operator value oriented, not pure technical layers. Story order is implementable and traceable.

### Epic Structure Validation

| Epic | User value | Independence | Result |
|---|---|---|---|
| Epic 1: Terminal session dùng chung, detach an toàn | User can use same session terminals across modal/editor/route without losing process on UI close. | Standalone foundation; usable before later timeout/archive hardening. | Pass |
| Epic 2: Tự bảo vệ tài nguyên terminal theo idle/age | User gets warning/keepalive; operator avoids unbounded process lifetime. | Builds on Epic 1 only; does not need archive. | Pass |
| Epic 3: Archive session dọn terminal qua internal path | User/operator can archive sessions without leaking terminals and without exposing web close-all. | Builds on Epic 1/2 cleanup; works before release hardening. | Pass |
| Epic 4: Phục hồi niềm tin vận hành và hardening trước khi dev/ship | User sees truthful lost state; operator gets release gates. | Release-readiness epic; no new feature scope beyond recovery/hardening. | Pass |

### Story Quality Findings

Critical violations: none remaining.

Major issues found and fixed:

1. Story 2.3 used closed idle/age UX but only depended on Story 2.1. Fixed dependency to include Story 2.2.
2. Story 3.1 archive close-all used cleanup semantics but did not depend on process cleanup story. Fixed dependency to include Story 2.2.
3. Story 4.1 verification still said `lost/empty`; this weakened lost-state decision. Fixed to `lost` or session-level recovery banner.
4. Story 1.4 missed first empty list auto-create/stable CLI list behavior. Added AC.

Minor concerns remaining:

- Story 4.4 remains gate-heavy, but acceptable because it is explicitly release-readiness and does not expand feature scope.
- No standalone UX artifact; acceptable with warning because UX-DR coverage exists.

### Dependency Review

No forward dependencies remain. Notable dependency corrections applied:

- Story 2.3 now depends on Stories 1.4, 2.1, 2.2.
- Story 3.1 now depends on Stories 1.1, 1.2, 1.3, 2.2.

### AC Quality Review

- All 15 stories use testable Given/When/Then-style acceptance criteria.
- Each story has Definition of Done.
- Each story has Verification commands/manual checks.
- Error/risk paths covered: max-3 race, detach no kill, no web close-all, CLI lost, replay memory, scope leak, SIGTERM/SIGKILL, fake-clock timers, no-secret logging, archive/create race, machine legacy regression.

### Starter/Database Checks

- Starter template: not applicable. Brownfield HAPI project.
- Database/entity creation: not applicable except existing hub/session persistence touched by archive/session state; no story creates all data upfront.

### File Churn Check

Multiple stories touch terminal core files, but split is justified by risk boundaries and safe implementation order: contract → CLI → hub → UI → timers → archive → hardening. No unnecessary churn found.

## Summary and Recommendations

### Overall Readiness Status

READY WITH MINOR WARNINGS.

Artifacts are ready for implementation planning handoff after the fixes applied during this review. No blocking issue remains in the 4 epics / 15 stories.

### Critical Issues Requiring Immediate Action

None remaining.

### Issues Found and Fixed During This Review

1. Story 2.3 dependency was incomplete.
   - Problem: closed idle/age UX depends on actual close behavior from Story 2.2.
   - Fix: dependency updated to `Story 1.4, Story 2.1, Story 2.2`.

2. Story 3.1 dependency was incomplete.
   - Problem: archive close-all relies on cleanup semantics from Story 2.2.
   - Fix: dependency updated to `Story 1.1, Story 1.2, Story 1.3, Story 2.2`.

3. Story 4.1 verification weakened lost-state decision.
   - Problem: wording `lost/empty` could let old terminals disappear silently.
   - Fix: changed to `lost` or session-level recovery banner, not running.

4. Story 1.4 missed first-empty-list behavior from source plan.
   - Problem: initial create/stable CLI list after reload was not explicit.
   - Fix: added AC for empty list first create and stable list after reload.

### Remaining Minor Warnings

1. No standalone UX design contract exists.
   - Impact: visual details rely on UX-DR requirements in epics, not a separate UX artifact.
   - Risk: low, because UX surface is small and requirements are explicit.

2. Epic 4 is release-readiness/gate heavy.
   - Impact: less pure user journey than Epics 1-3.
   - Risk: acceptable, because it protects user trust and operator safety without expanding feature scope.

### Recommended Next Steps

1. Start implementation from Story 1.1 only.
2. Do not parallelize stories that share core contract/CLI/hub state until Story 1.3 is complete.
3. Keep verification evidence per story: command, result, manual risk not run.
4. Run focused tests after each story; run full typecheck/test only after stable integration points.
5. Before merge, execute Story 4.4 readiness checklist and manual E2E list from `session-terminal-lifecycle-dev-readiness.md`.

### Final Note

This assessment identified 4 fixable issues across dependency, lost-state, and UX behavior coverage. All 4 were fixed in `epics.md` and `session-terminal-lifecycle-dev-readiness.md`. Remaining warnings are non-blocking.

Assessor: Codex BMAD Implementation Readiness Review
Date: 2026-07-03
