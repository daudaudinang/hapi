# Phụ lục Product Brief — HAPI Shared Hub

Phụ lục giữ các quyết định kỹ thuật/nghiệp vụ đã chốt trong brainstorm nhưng quá chi tiết cho Product Brief. PRD, UX và Architecture phải dùng lại các quyết định này; không xem đây là thiết kế triển khai cuối cùng.

## Quyền và chia sẻ

- Grant có principal là User hoặc Team; Team membership động.
- Thời hạn tùy chỉnh; mặc định Team grant là 30 ngày.
- Nhiều grant trên cùng Runner: quyền hiệu lực là mức cao nhất còn hiệu lực.
- Thu hồi một grant không xóa quyền đến từ grant khác.
- Rời Team chỉ mất quyền qua Team; direct grant vẫn còn.
- Chỉ owner hoặc Admin được share/revoke.
- Các mức quyền định hướng: view, interact, spawn, operate, manage.
- Session chỉ được chia sẻ read-only.

## Enrollment và multi-Hub

- Enrollment code one-time, short-lived, bind Hub và owner.
- Không có approve lần hai.
- Consume đồng thời: first-success-wins.
- Một Runner service kết nối một Hub.
- Mỗi service có Hub URL, credential, HAPI_HOME, state, lock và log riêng.
- MVP dùng chung binary; per-Runner binary/version deferred.

## Vòng đời Runner

- Revoke: vô hiệu credential, dừng managed agent/terminal, ghi tombstone và clean exit.
- Offline revoke: Hub chặn ngay, Runner thực hiện dừng khi reconnect.
- Không tự uninstall local service.
- Re-enroll cùng Hub dùng lại profile/service nhưng tạo Runner record và credential mới.
- Record, session và audit cũ được giữ; grant cũ không sống lại.
- Owner disabled: Runner owner_disabled, suspend grants, Admin transfer hoặc archive.
- Transfer ownership giữ nguyên grant còn hiệu lực.

## Danh tính

- HAPI tin Keycloak OIDC `issuer + subject`, không dùng email làm identity key.
- Invitation gắn đúng người nhận; link forward không đủ để kích hoạt.
- Thiếu claim đã xác minh thì Admin xác nhận lần đầu.
- HAPI sở hữu invitation, membership, role, Team, ownership và grant; Keycloak sở hữu login/session/account linking.

## Audit MVP

Ghi invitation, role, Team/member changes, Runner enroll/revoke/archive/transfer và grant create/change/expire/revoke. Không ghi từng command terminal, file read, message hoặc SSE event.

## Artifact không có hiệu lực triển khai

Các file sau được tạo quá sớm và chỉ là scratch input:

- `_bmad-output/planning-artifacts/architecture/architecture-hapi-shared-hub-2026-07-13/ARCHITECTURE-SPINE.md`
- `docs/superpowers/plans/2026-07-13-shared-hub-roadmap.md`
