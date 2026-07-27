# Terminal Modal-Only Design

## Mục tiêu

- Giữ người dùng trong ngữ cảnh session chat khi mở terminal.
- Loại bỏ hoàn toàn trang terminal riêng.
- Giảm một dòng chiều cao trong terminal bằng cách đặt tab và trạng thái kết nối cùng hàng.

## Hành vi

### Mở terminal từ session chat

- Nút Terminal trong ô nhập mở `TerminalModal` bằng trạng thái modal trên URL hiện tại.
- Không điều hướng tới `/sessions/:sessionId/terminal`.
- Đóng modal trả người dùng về đúng session chat đang xem.

### Loại bỏ route cũ

- Xóa route `/sessions/:sessionId/terminal`.
- Xóa component và test chỉ phục vụ trang terminal riêng.
- Không thêm redirect hoặc lớp tương thích cho URL cũ.
- Terminal panel trong editor mode không thay đổi.

### Thanh tab và trạng thái

- Tab terminal và nút tạo terminal nằm bên trái, có thể cuộn ngang.
- Trạng thái kết nối và số terminal đang chạy nằm cố định bên phải trên cùng hàng.
- Trạng thái không bị cuộn theo danh sách tab.
- Thông báo lỗi dài hoặc trạng thái bất thường vẫn được hiển thị riêng khi cần, tránh ép mất vùng tab.

## Phạm vi code dự kiến

- `web/src/components/SessionChat.tsx`: đổi thao tác Terminal sang mở modal.
- `web/src/components/Terminal/SessionTerminalTabs.tsx`: gộp tab và trạng thái vào một hàng.
- `web/src/router.tsx`: xóa đăng ký route terminal.
- `web/src/routes/sessions/terminal.tsx` và test: xóa.
- Các test liên quan: thêm kiểm thử hồi quy cho modal và bố cục thanh terminal.

## Không thay đổi

- Vòng đời terminal, socket, tạo/đóng tab và bộ đệm output.
- Terminal panel trong editor mode.
- Terminal modal mở từ session header.
- Giới hạn tối đa ba terminal.

## Kiểm chứng

1. Nhấn Terminal trong ô nhập mở modal và URL không chuyển sang route terminal cũ.
2. Tab nằm trái, trạng thái nằm phải trên cùng hàng; tab vẫn cuộn được khi tràn.
3. Route terminal không còn trong router và không còn component trang riêng.
4. Test web, typecheck và build web/PWA hoàn tất.
