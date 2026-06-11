# Desktop Focus Session Modal Design

## 1. Mục tiêu

Trong Agent Mode trên desktop, khi người dùng pin 3 hoặc 4 session, mỗi khung chat trở nên nhỏ và khó đọc. Thêm nút Focus trong header của từng pinned session để mở session đó trong một modal lớn, giúp đọc và tương tác tạm thời mà không phá layout pin hiện tại.

## 2. Phạm vi

### Làm

- Chỉ hiển thị nút Focus ở giao diện desktop.
- Chỉ hiển thị trong compact header của pinned session trong Agent Mode.
- Khi bấm Focus, mở modal lớn chứa cùng session chat.
- Modal cho phép đọc chat, gửi tin, retry, load more, và resume inactive session theo logic hiện có.
- Đóng modal thì quay lại Agent Mode với danh sách pin giữ nguyên.

### Không làm

- Không thêm Focus cho mobile.
- Không thay đổi giới hạn pin 4 session.
- Không đổi layout grid 3/4 session.
- Không đổi Team Chat, quyền, database, API hoặc backend.
- Không thay đổi hành vi của Files/Terminal/Editor/Team buttons hiện có.

## 3. Luồng nghiệp vụ

1. User đang ở Agent Mode trên desktop.
2. User đã pin nhiều session, thường là 3 hoặc 4.
3. User bấm nút Focus trong header nhỏ của một session.
4. Hệ thống mở modal lớn cho đúng session đó.
5. User đọc hoặc gửi tin trong modal.
6. User đóng modal và quay lại layout pin như cũ.

## 4. Luồng hệ thống

`Dashboard` giữ state session đang focus.

`PinnedPanel` truyền callback focus xuống `SessionChat` / `SessionHeader`.

`SessionHeader` compact mode render nút Focus khi được phép và khi viewport là desktop.

Modal focus dùng lại logic session chat lớn:

`FocusedSessionChatModal` → fetch session/messages → render `SessionChat` với `hideHeader=true` → gửi tin qua `useSendMessage`.

## 5. Cách triển khai khuyến nghị

Tạo modal dùng chung cho session chat, rồi để Team Chat modal và Agent Mode focus modal dùng lại phần chung nếu việc tách không làm diff quá lớn.

Nếu tách modal chung làm phạm vi quá rộng, phương án an toàn là tạo `FocusedSessionChatModal` mới dựa trên cấu trúc `TeamSessionChatModal`, nhưng phải tránh copy wording “Direct chat”.

Ưu tiên cuối cùng: ít rủi ro, dễ review, không đổi hành vi Team Chat.

## 6. Các khối bị ảnh hưởng

| File/Khối | Vai trò | Sửa gì | Rủi ro / cần kiểm tra |
|---|---|---|---|
| `web/src/components/Dashboard/index.tsx` | Agent Mode và pinned sessions | Thêm state focus modal, truyền callback xuống pinned panel, render modal | Cần không làm mất trạng thái pin/active pin |
| `web/src/components/SessionHeader.tsx` | Header session, gồm compact header | Thêm prop focus và nút Focus desktop-only | Header compact có thể chật |
| `web/src/components/TeamChat/TeamSessionChatModal.tsx` hoặc modal mới | Modal chat lớn hiện có | Tái sử dụng/tách logic hoặc tạo modal focus tương tự | Tránh đổi hành vi Team Chat ngoài ý muốn |
| `web/src/components/Dashboard/dashboard.css` | Style Agent Mode/pinned header | Style nút Focus và ẩn trên mobile | Cần kiểm tra desktop/mobile breakpoint |

## 7. Quyết định đã chốt

- Nút Focus chỉ cần cho desktop.
- Mobile không cần nút Focus.
- Nút nằm trong header của pinned session trong Agent Mode.
- Modal nên là modal chat lớn, tương tự trải nghiệm bấm member trong Team Chat, nhưng wording là Focus session.

## 8. Rủi ro

### Vàng

- Compact header vốn đã nhiều nút; thêm Focus có thể làm title ngắn hơn.
- Nếu copy modal Team Chat quá nhiều, có thể lệch wording hoặc logic về “direct chat”.
- Nếu dùng CSS breakpoint không đúng, nút có thể xuất hiện trên mobile.

### Xanh

- Không đụng backend/API/database.
- Không thay đổi dữ liệu session.
- Có thể rollback bằng cách bỏ nút và modal focus.

## 9. Kiểm chứng tối thiểu

### Test nên có

1. Desktop, pin 3 session: nút Focus xuất hiện, bấm mở đúng session trong modal.
2. Desktop, pin 4 session: modal vẫn mở đúng và layout pin phía sau không đổi.
3. Mobile viewport: nút Focus không xuất hiện.
4. Trong modal: gửi message hoạt động như session gốc.
5. Đóng modal: quay lại Agent Mode, pinned sessions vẫn giữ nguyên.

### Kiểm chứng thủ công nên chạy

- `bun typecheck`
- Test liên quan nếu có hoặc thêm test nhỏ cho header/dashboard khi hợp lý.
- Kiểm tra nhanh bằng browser ở desktop và mobile viewport.

## 10. Rollback

Nếu có lỗi UI hoặc modal gây nhiễu:

- Gỡ prop/callback focus khỏi `SessionHeader` và `PinnedPanel`.
- Gỡ state/render modal khỏi `Dashboard`.
- Gỡ CSS của nút Focus nếu có.
- Không cần rollback dữ liệu vì thay đổi chỉ ở frontend UI.
