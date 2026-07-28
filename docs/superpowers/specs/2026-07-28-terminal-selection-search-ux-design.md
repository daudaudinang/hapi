# Terminal Selection and Search UX

## Mục tiêu

Đồng bộ giao diện chọn text với bubble nhập liệu, làm vùng chọn dễ nhìn và sửa Search trên bàn phím mobile.

## Bubble vùng chọn

- Bubble `Sao chép | Chọn tất cả | Hủy` dùng cùng nền, bo góc, bóng, padding, font và đường phân cách với bubble `Nhập | Enter | Chọn`.
- Vùng chạm của mỗi thao tác vẫn tối thiểu 44px.
- Không thay đổi vị trí bám vùng chọn hoặc vòng đời chọn/copy hiện tại.

## Màu vùng chọn

- Thêm màu selection riêng cho terminal thay vì dùng `--app-subtle-bg` 5%.
- Light và dark đều dùng nền tím/xanh có độ tương phản khoảng 35–40%.
- Text trong vùng chọn vẫn đọc được; không thay đổi màu nền tổng thể của terminal.

## Search

- Panel Search chuyển thành hai hàng:
  - Hàng 1: ô nhập chiếm phần lớn chiều rộng và nút đóng.
  - Hàng 2: số kết quả, `Aa`, kết quả trước và kết quả sau.
- Ô nhập dùng `enterKeyHint="search"`.
- Gõ từ khóa vẫn tự tìm sau 150ms.
- Nhấn Search/Enter trên bàn phím ảo tìm ngay và chuyển tới kết quả tiếp theo.
- Submit hủy lượt debounce đang chờ để không nhảy hai kết quả.
- Từ khóa đang composition/IME được lấy từ giá trị thực tế của input tại thời điểm submit.
- Truy vấn rỗng không tìm và xóa highlight hiện tại.

## Phạm vi

Chỉ sửa Web: overlay mobile terminal, theme xterm, panel Search và test trực tiếp liên quan. Không đổi Hub, CLI, terminal transport, scroll, selection handles, Search addon hoặc API.

## Kiểm chứng

- Hai bubble có cùng visual nhưng giữ vùng chạm 44px.
- Selection dễ thấy trên light và dark.
- Search input rộng, không tràn màn hình mobile.
- Search/Enter gọi đúng một lượt `findNext` ngay lập tức.
- Debounce, nút trước/sau, `Aa`, đóng panel và copy/select cũ không hồi quy.
