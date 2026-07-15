---
title: "Product Brief: HAPI Shared Hub"
status: approved
created: 2026-07-13
updated: 2026-07-14
source: "../../../brainstorming/brainstorm-shared-hub-2026-07-13/brainstorm-intent.md"
---

# Product Brief: HAPI Shared Hub

## Tóm tắt

HAPI hiện giúp một người chạy các AI coding agent trên máy có Runner và điều khiển từ web hoặc điện thoại. Khi số người dùng tăng, mỗi người vẫn tự cài đặt, vận hành và chia sẻ theo cách riêng; phòng chưa có nơi chung để quản lý ai được dùng Runner nào, quyền kéo dài bao lâu và phải thu hồi thế nào khi thành viên thay đổi.

HAPI Shared Hub mở rộng HAPI thành hạ tầng nội bộ đa người dùng. Người dùng đăng nhập bằng danh tính công ty, thêm Runner bằng một lệnh copy-paste, rồi chia sẻ Runner cho cá nhân hoặc Team với quyền và thời hạn rõ ràng. Shared Hub bổ sung lớp danh tính, phân quyền và quản trị quanh luồng agent hiện tại; không viết lại terminal, editor, git, session hoặc cơ chế điều khiển Runner nếu không cần.

Pilot hướng tới **100 người dùng và 10 Team**. Nếu thành công, Shared Hub trở thành điểm truy cập chung cho AI coding agent trong phòng và có thể mở rộng cho toàn công ty.

## Vấn đề cần giải quyết

### Người dùng

- Phải tự hiểu cách cài và cấu hình HAPI trước khi dùng.
- Khó chuyển từ máy cá nhân sang Hub chung mà không nhầm cấu hình.
- Không có cách rõ ràng để chia sẻ Runner cho đồng nghiệp hoặc Team trong một khoảng thời gian.
- Không biết quyền đang đến trực tiếp hay qua Team, còn hiệu lực bao lâu và phạm vi truy cập thực tế tới đâu.

### Team và quản trị viên

- Chưa có danh tính người dùng, vai trò tổ chức và Team membership thực sự.
- Chưa quản lý tập trung chủ sở hữu, trạng thái và quyền truy cập Runner.
- Thu hồi quyền khi người dùng rời Team hoặc rời công ty chưa thành một luồng đáng tin cậy.
- Chưa có nhật ký quản trị để biết ai đã mời người dùng, chia sẻ, chuyển chủ hoặc thu hồi Runner.

Giữ nguyên hiện trạng khiến triển khai rộng phụ thuộc hỗ trợ thủ công, quyền truy cập dễ tồn tại quá lâu và mỗi nhóm có thể hình thành cách vận hành riêng khó kiểm soát.

## Giải pháp đề xuất

Shared Hub cung cấp một HAPI web app thống nhất cho cả sử dụng và quản trị:

1. Người dùng được mời và đăng nhập qua Keycloak bằng Google hoặc VietID.
2. Người dùng thêm Runner bằng lệnh dành cho Linux hoặc macOS; lệnh tải artifact đã kiểm SHA-256 và kết nối đúng Hub.
3. Mỗi Runner có chủ sở hữu cá nhân và có thể được chia sẻ cho User hoặc Team.
4. Quyền chia sẻ có mức truy cập, nguồn cấp và thời hạn rõ ràng; thu hồi có hiệu lực ngay.
5. Admin quản lý User, Team, Runner, quyền và nhật ký, đồng thời có toàn quyền vận hành mọi Runner trong pilot.
6. Agents, sessions, terminal, editor và git tiếp tục dùng trải nghiệm HAPI hiện tại.

Trải nghiệm cốt lõi: **nhận lời mời → đăng nhập → thêm hoặc chọn Runner → chạy agent → chia sẻ khi cần → Hub tự áp quyền và thời hạn**.

## Người dùng mục tiêu

- **Thành viên kỹ thuật:** bắt đầu chạy agent nhanh trên Runner của mình hoặc Runner được chia sẻ.
- **Chủ sở hữu Runner:** biết ai có quyền gì, đến bao giờ và thu hồi được ngay.
- **Team Owner:** quản lý thành viên và quyền qua Team.
- **Admin:** quản lý danh tính, Team, Runner và offboarding tập trung.
- **Viewer:** theo dõi thông tin được chia sẻ nhưng không điều khiển máy.

## Giá trị khác biệt

- **Xây trên HAPI đang chạy:** giữ lại luồng Runner và agent hiện tại thay vì tạo một nền tảng thực thi mới.
- **Onboarding gần như không cần cài đặt thủ công:** người dùng copy-paste một lệnh do Hub tạo.
- **Chia sẻ ở đúng biên bảo mật:** quyền điều khiển đặt ở cấp Runner, không giả vờ giới hạn filesystem ở cấp Session.
- **Quản trị pilot có toàn quyền vận hành:** Admin là emergency operator cho mọi Runner; mọi mutation nhạy cảm vẫn được audit.
- **Một trải nghiệm thống nhất:** khu làm việc, Team và quản trị dùng chung một ứng dụng, menu thay đổi theo vai trò.

## Phạm vi MVP

### Bao gồm

- Invitation-only; không public signup.
- Keycloak làm identity broker cho Google và VietID.
- Vai trò tổ chức: Admin, Member, Viewer.
- Vai trò Team: Team Owner, Team Member.
- Tạo và quản lý Team thủ công trong HAPI.
- Danh sách Runner theo quyền của người dùng.
- Zero-touch enrollment cho Linux và macOS; Windows theo sau pilot.
- Một Runner process kết nối một Hub; nhiều Hub dùng nhiều Runner service độc lập.
- Runner ownership, chia sẻ cho User/Team, thời hạn và thu hồi.
- Session sharing ở chế độ Chỉ xem.
- Xử lý owner bị vô hiệu hóa, chuyển chủ, lưu trữ và re-enroll.
- Khu quản trị User, Team, Runner và quyền.
- Audit các thay đổi quản trị và quyền.
- Public HTTPS/WSS cho pilot.
- Database Shared Hub mới; database legacy chỉ giữ làm offline backup.
- Browser session opaque cookie; invitation khóa verified email và claim vào Keycloak issuer + subject.

### Không bao gồm trong MVP

- Email/password và public signup.
- Đồng bộ Team từ Google Workspace, Entra ID hoặc LDAP.
- Admin Portal riêng.
- Binary/version riêng cho từng Runner.
- Bắt buộc VPN hoặc private access gateway.
- High availability, horizontal scaling hoặc rollout toàn công ty.
- Redesign data plane của session, message, terminal, editor và git.
- Audit từng command, file read hoặc agent event.
- Sandbox filesystem khi chưa có cơ chế cô lập cấp hệ điều hành.

## Nguyên tắc an toàn

Quyền điều khiển Runner bao phủ toàn bộ file/project mà Runner process truy cập được; giao diện phải cảnh báo rõ. Viewer luôn bị hard-cap ở `view`; session share chỉ read-only. Quyền hết hạn hoặc bị thu hồi phải ngắt điều khiển ngay. Thu hồi Runner phải dừng agent/terminal do Runner quản lý, thực hiện khi kết nối lại nếu Runner đang offline. Hệ thống không cho phép mất Admin cuối cùng hoặc Team Owner cuối cùng mà chưa có người thay thế. Owner có thể delegate `manage`, nhưng delegated manager không được transfer, archive hoặc revoke Runner.

## Tiêu chí thành công của pilot

Các chỉ số dưới đây là **đề xuất để chốt trong Product Brief**, chưa phải cam kết SLA:

1. Pilot hỗ trợ được **100 tài khoản và 10 Team** trong một Shared Hub.
2. Ít nhất **80% người tham gia pilot** tự thêm Runner thành công mà không cần người quản trị thao tác trực tiếp trên máy.
3. Ít nhất **90% enrollment thành công trong lần chạy đầu hoặc sau một lần thử lại có hướng dẫn lỗi rõ ràng**.
4. Mọi thao tác grant, revoke, transfer và disable đều tạo audit record.
5. Người rời Team mất quyền qua Team ngay; User bị disabled không thể tiếp tục điều khiển Runner.
6. Không có sự cố truy cập Runner trái quyền ở mức nghiêm trọng trong pilot.
7. Nhóm vận hành có thể xác định chủ sở hữu, nguồn quyền và trạng thái của mọi Runner từ Hub.

## Rủi ro và điều chưa xác minh

- VietID cần được xác minh về OAuth/OIDC endpoint, claims, định danh ổn định và dữ liệu đã xác thực.
- Public Hub làm tăng yêu cầu bảo vệ credential, rate limit, session và Keycloak Admin Console.
- Quyền điều khiển Runner có phạm vi lớn; câu chữ và cảnh báo UX phải ngăn người dùng hiểu nhầm là chỉ chia sẻ một project.
- SQLite WAL là ứng viên cho pilot single-instance, nhưng lựa chọn database và ngưỡng chuyển PostgreSQL thuộc quyết định Architecture.
- Ma trận quyền chi tiết và hành vi khi Keycloak, Hub hoặc Runner mất kết nối cần được đặc tả trong PRD.

## Tầm nhìn

Nếu pilot thành công, Shared Hub trở thành lớp điều phối AI coding agent dùng chung trong công ty: người dùng giữ môi trường local phù hợp, Team cộng tác qua quyền có kiểm soát, còn tổ chức quản lý tập trung danh tính, tài nguyên và offboarding. Việc mở rộng không được phá trải nghiệm local-first của HAPI.

## Quyết định đã duyệt

1. Pilot một phòng, tối đa 100 tài khoản và 10 Team; giữ mục tiêu onboarding 80% và enrollment 90%.
2. Shared Hub thay hoàn toàn shared-token/namespace authentication; không có personal deployment mode.
3. Pilot dùng một organization, một Hub instance và SQLite WAL; database legacy không migrate.
4. Capability cộng dồn `view → interact → spawn → operate → manage`; quyền có thể đến trực tiếp hoặc động qua Team.
5. Linux/macOS nằm trong pilot; Windows, updater channels, HA/PostgreSQL, directory sync và Telegram identity linking được hoãn.
