# Shared Hub Pilot-Core — Kế hoạch triển khai

**Ngày:** 2026-07-14
**Trạng thái:** approved-for-implementation
**Mục tiêu:** thay authentication legacy bằng Shared Hub một tổ chức: Keycloak OIDC, authorization theo Runner/Team, enrollment Linux/macOS, audit và ngắt realtime tức thời.

## Quyết định khóa

- Chỉ Shared Hub; không personal/shared-token mode, không tương thích database cũ.
- Pilot single-instance, SQLite WAL, database mới; database cũ chỉ giữ offline backup.
- Một organization. Admin có toàn quyền vận hành mọi Runner.
- Runner owner có thể cấp `manage`; delegated manager không được transfer/archive/revoke.
- Capability cộng dồn: `view → interact → spawn → operate → manage`; Viewer bị hard-cap `view`.
- `view` gồm metadata, trạng thái session và messages; session sharing chỉ read-only grant rõ ràng.
- Invitation khóa verified email; sau claim lưu `(issuer, subject)` Keycloak.
- Browser dùng opaque server session cookie Secure/HttpOnly/SameSite và CSRF token.
- Enrollment Linux/macOS trong pilot; Windows, updater channels, HA/PostgreSQL, directory sync, Telegram identity linking hoãn.

## Kiến trúc và invariants

`Browser --OIDC/cookie--> Hub control plane <--runner credential/WSS-- Runner`.

Hub là policy enforcement point duy nhất. Mọi entry point tạo `RequestContext`; application service thực hiện trong transaction `authorize → mutate → audit → publish`. Event chỉ publish sau commit. Realtime subscription được đánh chỉ mục theo actor/resource để re-evaluate và disconnect khi grant hết hạn/revoke, Team membership đổi hoặc user bị disable.

Machine runtime state là projection 1:1 của Runner, không phải security principal. Mọi record Shared Hub có `organizationId`; namespace không còn là ownership/ACL. Secret plaintext chỉ xuất hiện một lần, không log/audit, database chỉ lưu keyed hash. Thời gian persistence là Unix milliseconds.

## Mô hình dữ liệu

- `organizations`, `identities`, `memberships`, `teams`, `team_memberships`
- `invitations`, `web_sessions`
- `runners`, `runner_credentials`, `runner_enrollments`, `runner_tombstones`
- `resource_grants` (principal user/team; resource runner/session; capability; expiry)
- `audit_events` append-only
- `machines.runner_id UNIQUE NOT NULL` cho projection 1:1

Foreign keys bật; unique constraints cho identity issuer+subject, verified email claim, active Runner machine/profile; indexes cho expiry, principal/resource resolution và audit chronology. Startup chỉ chấp nhận schema marker Shared Hub; schema legacy báo lỗi có đường dẫn backup và hướng dẫn tạo database mới.

## Interfaces

### Identity/browser

- `GET /api/auth/login`, `POST /api/auth/login` (invitation bearer in JSON body), `GET /api/auth/callback`, `POST /api/auth/logout`
- `GET /api/auth/session`; invitation hash is bound to one-time OIDC state and claimed atomically with session creation during callback. Invitation bearer material never enters URLs or cookies.
- Authorization Code + PKCE, state/nonce one-time, discovery allowlist, exact redirect URI.
- Bootstrap Admin duy nhất qua email đã verify trong config; bảo vệ Admin cuối cùng.

### Administration

- CRUD có policy cho users, Teams/memberships, Runners, grants, invitations và audit query.
- Disable user/revoke/Team removal commit trước, sau đó invalidation bus đóng SSE, Socket.IO rooms, terminal attachments và RPC đang chờ.

### Runner enrollment

- `POST /api/runner-enrollments`, `GET/DELETE /api/runner-enrollments/:id`, `POST /api/runner-enrollments/exchange`.
- Code entropy cao, TTL 15 phút, hash-only, consume atomic; exchange trả credential đúng một lần.
- `hapi runner enroll --hub <url> --code <code> --profile <name>`; profile cô lập config/state/lock/log/service.
- Linux user-systemd và macOS LaunchAgent; bootstrap chọn artifact theo OS/arch, verify SHA-256 trước execute.

## Ma trận permission/action

| Actor/nguồn | view | interact | spawn | operate | manage | lifecycle owner-only |
|---|---:|---:|---:|---:|---:|---:|
| Admin | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Runner owner | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Direct/Team grant | theo capability cộng dồn | theo grant | theo grant | theo grant | theo grant | ✗ |
| Viewer org role | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Session read-only grant | session/messages | ✗ | ✗ | ✗ | ✗ | ✗ |

`interact`: gửi prompt/permission response. `spawn`: tạo session. `operate`: terminal/editor write/Git/RPC control. `manage`: grants và metadata. Lifecycle owner-only: transfer, archive, revoke, credential rotation/destructive cleanup. Team Owner quản lý Team membership nhưng không vượt capability resource.

## Failure/revoke contracts

- OIDC discovery/Keycloak unavailable: fail closed; session còn hạn chỉ dùng đến khi local session policy yêu cầu refresh.
- State/nonce/code replay, expired invitation/enrollment, CSRF mismatch: fail closed, stable error code, no secret echo.
- Runner offline khi revoke: mark revoked + tombstone transactionally; từ chối reconnect; cleanup directive chạy trước mọi work khi reconnect bằng credential cũ/rotation handoff.
- Grant expiry/revoke, Team removal, disable: quyền mới có hiệu lực tại commit; streams/control bị đóng ngay; read-only historical audit không chứa payload riêng tư.
- Concurrent enrollment claim: đúng một consumer thắng; loser nhận conflict/used.

## UX và acceptance vận hành

- Web: Keycloak login/invitation; nav Workspace/Runners/Teams/Admin theo quyền; hiển thị owner, nguồn quyền, expiry, effective capability và cảnh báo whole-Runner access.
- Linux: bootstrap → checksum → enroll profile → user systemd enable/start; status/log path rõ ràng; uninstall không xóa workspace.
- macOS: bootstrap → checksum → enroll profile → LaunchAgent load; plist permissions đúng; status/log path rõ ràng.
- Không hiển thị command chứa secret sau lần tạo; copy UI tự hết hạn. Error có remediation, không có stack/token/path riêng tư.

## Phases và test gates

0. Chốt brief/spine/contracts. Gate: document review.
1. Persistence + transaction services. Gate: schema/store/migration-safety tests.
2. OIDC/cookie/CSRF/invitations. Gate: replay/expiry/bootstrap/last-Admin tests.
3. Teams/grants. Gate: exhaustive matrix + dynamic Team resolution tests.
4. Enrollment/profile/services. Gate: concurrency/reconnect/cleanup/redaction tests trên Linux/macOS adapters.
5. Data-plane enforcement. Gate: REST/SSE/Socket.IO/terminal/RPC/editor/files/Git/Team Chat cross-user isolation.
6. Pilot UI. Gate: component + browser flows.
7. Hardening. Gate: origin/CORS/headers/rate-limit/log review, backup restore, full typecheck/tests, manual E2E.

Mỗi checkpoint: GitNexus impact trước edit symbol, focused tests, `gitnexus_detect_changes`, checklist evidence. HIGH/CRITICAL phải cảnh báo trước edit.

## Rollout

1. Freeze và copy database legacy thành offline encrypted backup; tạo database Shared Hub mới.
2. Deploy Keycloak client + Hub canary; bootstrap Admin; tạo hai pilot users/Team.
3. Enroll một Linux và một macOS Runner; test grants/revoke/disable/offline reconnect.
4. Pilot nhỏ, theo dõi auth failures, disconnect latency, enrollment success và audit completeness.
5. Mở 100 users/10 Teams chỉ sau readiness verdict `ready`.

## Recovery

- Hub failure: stop instance, preserve DB/WAL/SHM, restore encrypted backup vào volume mới, integrity check, start một instance.
- Bad release: stop, rollback binary/config; schema changes phải forward-only và release gate có restore rehearsal.
- Credential exposure: revoke Runner credential/session family, disconnect, rotate pepper only qua controlled mass re-enrollment.
- Keycloak outage: fail closed cho login/refresh; không bật fallback token.
- Authorization incident: disable actor/revoke grant, force invalidation, preserve sanitized audit, export forensic snapshot.

## Readiness verdict rule

Chỉ `ready` khi automated gates pass và ba manual E2E (Linux/macOS enrollment, two-user realtime revoke, disable/Team removal/offline reconnect) đã thực hiện. Nếu manual chưa chạy: verdict tối đa `not-ready — manual validation pending`.
