# Desktop Terminal Search Lifecycle

## Mục tiêu

Trên desktop, việc tạm ẩn thanh Search không được làm mất từ khoá, kết quả
hoặc vùng tô sáng. Chỉ thao tác đóng rõ ràng hoặc đổi ngữ cảnh terminal mới
xoá phiên tìm kiếm.

Mobile giữ nguyên hành vi hiện tại.

## Hành vi

| Tương tác desktop | Kết quả |
|---|---|
| Nhấn icon Search hoặc `Ctrl/Cmd+F` | Mở Search; nếu đã có phiên tìm kiếm thì khôi phục nguyên trạng |
| Nhấn lại icon Search | Thu gọn giao diện; giữ từ khoá, kết quả và vùng tô sáng |
| Nhấn vào terminal body | Không đóng và không xoá Search |
| Mở Snippets | Ẩn Search; giữ phiên tìm kiếm |
| Nhấn `×` trong Search | Đóng và xoá phiên tìm kiếm |
| Đổi terminal tab | Xoá phiên tìm kiếm |
| Đóng terminal | Xoá phiên tìm kiếm |
| Nhấn `Esc` | HAPI không can thiệp |

## Thiết kế trạng thái

- Tách **công cụ đang hiển thị** khỏi **phiên Search đang tồn tại**.
- Khi Search chỉ bị thu gọn, component Search vẫn được giữ để bảo toàn trạng
  thái cục bộ; SearchAddon vẫn gắn với terminal hiện tại.
- Khi xảy ra thao tác xoá, SearchAddon xoá decorations và component Search
  được unmount để reset từ khoá/kết quả.
- Khi đổi terminal identity, phiên Search cũ phải bị huỷ trước khi terminal mới
  nhận controller tìm kiếm.

## Phạm vi

Sửa trong lớp web terminal:

- Điều phối vòng đời Search trong `SessionTerminalTabs`.
- Cách mount/ẩn panel trong `TerminalControlDock`.
- Test cho icon, body click, `Ctrl/Cmd+F`, dấu `×`, đổi tab và đóng terminal.

Không thay đổi Hub, CLI, API snippets hoặc giao thức terminal.

## Rủi ro và kiểm chứng

1. Search ẩn nhưng bắt sự kiện chuột hoặc chiếm layout.
   - Panel ẩn phải không hiển thị, không nhận pointer và không chiếm diện tích.
2. Phiên Search cũ rò sang terminal khác.
   - Đổi tab/terminal phải clear controller, decorations và state.
3. Desktop fix làm đổi mobile.
   - Test riêng breakpoint desktop; test mobile dismissal hiện có vẫn phải đạt.

