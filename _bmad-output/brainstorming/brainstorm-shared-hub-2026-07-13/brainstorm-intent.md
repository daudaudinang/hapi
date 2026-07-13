# Tổng kết Brainstorm — HAPI Shared Hub

**Ngày:** 13/07/2026  
**Trạng thái:** Hoàn tất brainstorm, sẵn sàng chuyển sang Product Brief  
**Phạm vi:** Hạ tầng nội bộ cho phòng, hướng mở rộng toàn công ty  
**Nguồn quyết định:** `.memlog.md`

## 1. Ý tưởng cốt lõi

HAPI Shared Hub là một Hub dùng chung để nhiều người và nhiều Team trong công ty kết nối, sử dụng và quản lý các Runner. Đây là năng lực nội bộ, không phải sản phẩm thương mại.

Hướng đã chốt:

```text
Một Shared Hub trung tâm
→ người dùng đăng nhập bằng danh tính công ty
→ mỗi Runner vẫn thuộc một cá nhân
→ chủ sở hữu chia sẻ Runner cho User hoặc Team
→ Hub kiểm soát quyền, vòng đời và nhật ký quản trị
→ giữ nguyên tối đa luồng agent, session, terminal, editor và git hiện tại
```

## 2. Mục tiêu pilot

- Phục vụ khoảng **100 người dùng** và **10 Team**.
- Giúp người dùng thêm Runner mà không phải tự tìm hiểu cách cài HAPI.
- Cho phép chia sẻ Runner có kiểm soát giữa cá nhân và Team.
- Quản trị tập trung người dùng, Team, Runner và quyền truy cập.
- Giữ trải nghiệm chạy agent hiện tại; tránh viết lại data plane khi chưa cần.

## 3. Nguyên tắc sản phẩm và kiến trúc

1. **Mở rộng tối thiểu:** thêm danh tính, tổ chức, Team, quyền, enrollment và quản trị; không redesign luồng đồng bộ hiện tại.
2. **Runner vẫn là biên thực thi:** người được điều khiển Runner có quyền dùng toàn bộ file/project mà process Runner truy cập được.
3. **Không giả lập sandbox:** UI phải cảnh báo rõ phạm vi truy cập thay vì hứa giới hạn workspace không tồn tại.
4. **Một Runner process kết nối một Hub:** nhiều Hub trên cùng máy tương ứng nhiều Runner service độc lập.
5. **Một ứng dụng web:** khu làm việc và khu quản trị cùng nằm trong HAPI; menu hiện theo vai trò.
6. **Admin quản lý quyền nhưng không mặc định được điều khiển Runner:** quyền quản trị và quyền sử dụng tài nguyên là hai việc khác nhau.

## 4. Mô hình người dùng và Team

### Vai trò toàn hệ thống

- **Admin:** quản lý User, Team, Runner, grant và vòng đời tài nguyên.
- **Member:** sử dụng Runner mình sở hữu hoặc được chia sẻ.
- **Viewer:** luôn bị giới hạn ở quyền **Chỉ xem**, kể cả khi Team nhận quyền cao hơn.

Hệ thống phải luôn còn ít nhất một Admin. Không cho xóa, vô hiệu hóa hoặc hạ vai trò Admin cuối cùng.

### Vai trò trong Team

- **Team Owner**
- **Team Member**

Team phải luôn có ít nhất một Team Owner. Owner cuối muốn rời phải chuyển quyền; nếu không thể thì lưu trữ Team.

### Thành viên và offboarding

- MVP quản lý Team thủ công trong HAPI; chưa đồng bộ Google Workspace, Entra ID hoặc LDAP.
- Team membership là động: rời Team thì quyền nhận qua Team mất hiệu lực ngay.
- Quyền được cấp trực tiếp cho User vẫn còn khi User rời Team; giao diện phải thể hiện rõ nguồn quyền.
- User rời công ty được chuyển sang trạng thái `disabled`.
- Team bị xóa theo kiểu lưu trữ: grant của Team mất hiệu lực nhưng lịch sử được giữ lại.

## 5. Mô hình sở hữu và chia sẻ Runner

- Mỗi Runner luôn có một chủ sở hữu cá nhân.
- Chỉ chủ sở hữu hoặc Admin được tạo và thu hồi quyền chia sẻ.
- Có thể chia sẻ Runner cho một User hoặc một Team.
- Team grant áp dụng theo membership hiện tại, không chụp cố định danh sách thành viên.
- Thời hạn grant được tùy chỉnh; mặc định cho Team là **30 ngày**.
- Session chỉ được chia sẻ để xem; không cấp quyền tương tác ở cấp Session.

### Mức quyền định hướng

- **Chỉ xem** (`view`)
- **Tương tác** (`interact`)
- **Tạo phiên** (`spawn`)
- **Điều khiển Runner** (`operate`)
- **Quản lý** (`manage`)

Tên gọi và ma trận quyền chi tiết sẽ được chuẩn hóa trong PRD/Architecture. Quyết định nền không đổi: quyền thực thi áp dụng ở cấp Runner.

### Ý nghĩa của “Điều khiển Runner”

Người có quyền này có thể:

- Tạo và điều khiển session.
- Gửi message và approve agent.
- Sử dụng terminal, editor và git.
- Truy cập toàn bộ file/project mà Runner process có thể truy cập.

Đây là quyền tin cậy cao, gần tương đương khả năng của HAPI process trên máy.

## 6. Cách tính và thu hồi quyền

- Nếu một User nhận nhiều grant tới cùng Runner, quyền hiệu lực là mức cao nhất trong các grant còn hiệu lực.
- Thu hồi một grant không làm mất quyền đến từ grant khác.
- Vai trò Viewer là giới hạn cứng: quyền hiệu lực không được vượt quá Chỉ xem.
- Grant hết hạn hoặc bị thu hồi phải ngắt ngay terminal, editor, SSE và RPC điều khiển của User.
- Grant của User hết hạn không tự động giết agent đang chạy; chỉ ngắt quyền điều khiển của User đó.

## 7. Thêm Runner — zero-touch enrollment

Luồng chính:

```text
User đăng nhập
→ chọn Add Runner và hệ điều hành
→ Hub tạo lệnh có enrollment code
→ User copy-paste lệnh trên Windows/Linux/macOS
→ script tải hoặc cập nhật HAPI
→ Runner tự cấu hình service và kết nối đúng Hub
→ dùng được ngay
```

Quyết định đã chốt:

- Không có bước approve lần hai; hành động tạo enrollment command chính là chấp thuận.
- Enrollment code dùng một lần, sống ngắn và gắn với Hub/chủ sở hữu đã xác định.
- Lệnh phải chứa Hub đích để Runner không kết nối nhầm.
- Nếu code bị dùng đồng thời, lần xử lý thành công đầu tiên thắng.

## 8. Một Runner — một Hub

- Một Runner process chỉ kết nối một Hub.
- Một máy có thể kết nối nhiều Hub bằng nhiều Runner service/process.
- Mỗi Runner có riêng Hub URL, credential, `HAPI_HOME`, state, lock và log.
- Local profile phải unique theo `hubId`.
- MVP dùng chung một HAPI binary trên máy cho các Runner service.
- Binary/version riêng từng Runner được hoãn để tránh phức tạp sớm.

Hướng này bổ sung profile/service mới quanh Runner hiện tại, không yêu cầu phá luồng kết nối cũ.

## 9. Vòng đời Runner

### Remove/revoke

```text
Hub vô hiệu credential và quyền truy cập
→ yêu cầu Runner dừng agent/terminal do Runner quản lý
→ Runner ghi trạng thái bị thu hồi và thoát sạch
→ record cũ được lưu trữ
→ không tự uninstall local service
```

- Không tác động process khác trên máy hoặc Runner khác.
- Nếu Runner offline, Hub chặn truy cập ngay và giữ trạng thái chờ dừng.
- Khi kết nối lại, Runner nhận revoke, dừng managed processes, tự vô hiệu hóa rồi thoát.
- Service dùng restart-on-failure để clean exit không tạo process ma.

### Re-enroll

- Code cũ không được dùng lại.
- Có thể dùng lại local service/profile theo `hubId`.
- Hub tạo Runner record và credential mới.
- Record cũ tiếp tục được lưu trữ.
- Grant cũ không sống lại.
- Session và audit cũ vẫn thuộc record cũ.

### Chủ sở hữu thay đổi trạng thái

- Owner bị disabled: Runner chuyển `owner_disabled`, toàn bộ quyền chia sẻ bị tạm dừng.
- Admin phải chuyển chủ sở hữu hoặc lưu trữ Runner.
- Khi chuyển chủ sở hữu, các grant còn hiệu lực được giữ nguyên; chủ mới có thể xem lại và thu hồi.

## 10. Xác thực và lời mời

### Keycloak

```text
Google ───┐
          ├── Keycloak ── OIDC ── HAPI Shared Hub
VietID ───┘
```

- Chỉ hỗ trợ đăng nhập qua Google và VietID thông qua Keycloak.
- Không hỗ trợ email/password trong HAPI.
- Keycloak quản lý xác thực, phiên đăng nhập và liên kết identity.
- HAPI quản lý invitation, User, vai trò, Team, Runner ownership và grants.
- Danh tính chính dựa trên `issuer + subject`; không dùng email làm khóa danh tính.

### Invitation-only

- Không có public signup.
- Invitation gắn với người nhận cụ thể; chuyển link cho người khác không cấp được quyền.
- Nếu Keycloak không cung cấp claim đủ tin cậy, cần Admin xác nhận danh tính lần đầu.
- Invitation dùng một lần; xử lý đồng thời theo nguyên tắc lần thành công đầu tiên thắng.

### Điểm cần nghiên cứu tiếp

Cần xác minh tài liệu tích hợp VietID: OAuth/OIDC endpoints, claims, định danh ổn định, verified email và cơ chế refresh/revoke.

## 11. Kết nối mạng

- Pilot triển khai Shared Hub qua public HTTPS.
- Runner chủ động kết nối outbound bằng WSS; không bắt buộc VPN.
- Cần TLS, rate limit, CORS allowlist, credential riêng từng Runner và bảo vệ Keycloak Admin Console.
- Public gateway/private Hub là hướng nâng cấp, không phải yêu cầu pilot.

## 12. Giao diện Shared Hub

Chỉ có **một HAPI web app**, không tách ứng dụng sử dụng và Admin Portal.

```text
HAPI Shared Hub
├── Không gian làm việc
│   ├── Agents / Sessions
│   ├── Runners
│   └── Session được chia sẻ
├── Teams
│   ├── Team của tôi
│   ├── Thành viên
│   └── Runner được chia sẻ
└── Quản trị
    ├── Users
    ├── Teams
    ├── Runners
    ├── Quyền chia sẻ
    └── Nhật ký quản trị
```

- Viewer và Member chỉ thấy khu vực phù hợp quyền.
- Team Owner có thêm chức năng quản lý Team mình.
- Admin có thêm khu Quản trị.
- Giao diện hiện tại phải mở rộng khung điều hướng, danh tính người dùng, danh sách Runner và khu quản trị.
- Giữ nguyên tối đa màn hình làm việc với agent, terminal, editor và git.
- Việc dùng page, tab, drawer hay modal sẽ được quyết định trong giai đoạn UX.

## 13. Quản trị và audit trong MVP

Khu quản trị cần bao phủ:

- Users.
- Teams và membership.
- Runners và chủ sở hữu.
- Grants và thời hạn.

Audit chỉ ghi các hành động quản trị và quyền:

- Tạo/sử dụng invitation.
- Thay đổi role.
- Thay đổi Team và thành viên.
- Enroll, revoke, archive và transfer Runner.
- Tạo, sửa, hết hạn và thu hồi grant.

Không mở rộng audit xuống từng terminal command, file read, message hoặc SSE event trong MVP.

## 14. Phạm vi chủ động hoãn

- Email/password authentication.
- Public signup.
- Đồng bộ Team từ hệ thống danh tính công ty.
- Tách Admin Portal thành ứng dụng riêng.
- Per-Runner binary và version isolation.
- VPN bắt buộc hoặc private access gateway.
- High availability và horizontal scaling.
- Redesign session/message/terminal/editor/git data plane.
- Thay đổi retention/storage chỉ để phục vụ Shared Hub.
- Audit từng thao tác terminal, file hoặc agent event.
- Sandbox giới hạn filesystem khi chưa có cơ chế cô lập cấp hệ điều hành.

## 15. Rủi ro và giả định cần mang sang Product Brief/PRD

1. **VietID:** chưa xác minh đầy đủ hợp đồng OAuth/OIDC và claims.
2. **Quyền điều khiển:** chia sẻ Runner đồng nghĩa chia sẻ phạm vi file mà process có thể truy cập; UX cảnh báo phải rõ.
3. **Public Hub:** cần kiểm soát rate limit, credential, session và bề mặt quản trị Keycloak.
4. **Quy mô pilot:** mục tiêu 100 User/10 Team đã chốt, nhưng tiêu chí tải và thành công vận hành chưa được định lượng.
5. **Cơ sở dữ liệu:** SQLite WAL là ứng viên cho pilot single-instance; quyết định chính thức và ngưỡng chuyển PostgreSQL phải được đánh giá ở Architecture.
6. **Mức quyền:** tên preset và capability chi tiết cần được chuẩn hóa, tránh quyền chồng chéo khó hiểu.

## 16. Các quyết định cần hoàn thiện ở giai đoạn tiếp theo

### Product Brief

- Giá trị và kết quả mong đợi của pilot.
- Nhóm người dùng đầu tiên và quy trình rollout.
- Tiêu chí pilot thành công/thất bại.
- Ranh giới MVP chính thức.

### PRD

- Luồng chi tiết theo từng vai trò.
- Ma trận quyền và trạng thái tài nguyên.
- Yêu cầu chức năng, phi chức năng và acceptance criteria.
- Hành vi khi Keycloak/VietID/Hub mất kết nối.

### UX

- Information architecture của một web app thống nhất.
- Luồng Add Runner, Share Runner, cảnh báo quyền toàn máy và quản trị.
- Cách thể hiện nguồn quyền trực tiếp/Team và thời hạn.

### Architecture

- Mô hình dữ liệu, authorization enforcement và audit.
- Tích hợp Keycloak/VietID.
- Enrollment protocol và Runner credential lifecycle.
- Multi-profile/service layout trên Windows, Linux và macOS.
- Capacity, database và deployment topology cho pilot.

## 17. Kết luận hội tụ

Shared Hub sẽ mở rộng HAPI từ mô hình một người dùng thành nền tảng nội bộ đa người dùng, nhưng không viết lại lõi thực thi hiện tại. Trọng tâm MVP là:

```text
Danh tính và lời mời
+ User/Team roles
+ Runner ownership và sharing
+ zero-touch enrollment
+ authorization/revoke xuyên suốt
+ quản trị và audit tối thiểu
+ một giao diện HAPI thống nhất
```

Tài liệu này là đầu vào chính thức cho **BMad Product Brief**. Hai tài liệu architecture spine và roadmap được tạo trước đó chỉ là scratch, không phải artifact triển khai đã duyệt.
