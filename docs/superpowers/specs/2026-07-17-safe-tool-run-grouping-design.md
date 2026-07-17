# Gom nhóm tool an toàn, không mất nội dung chat

## Mục tiêu

Làm luồng thao tác agent gọn hơn bằng cách gom **các tool neutral liền kề** thành nhóm trình bày; không làm mất, thay thế hoặc đảo thứ tự reasoning, text, event hay tool.

## Quy tắc bất biến về dữ liệu

1. `ChatBlock[]` là nguồn dữ liệu duy nhất và phải được truyền nguyên vẹn, đúng thứ tự, vào chat runtime.
2. Mỗi block text, reasoning, event, user message và tool vẫn có message/render path riêng; không tạo assistant message rỗng để đại diện cho nhóm.
3. Nhóm chỉ là metadata/trạng thái của lớp trình bày. Nó không lọc, nối, clone hay thay thế block gốc.
4. Reasoning, text và event luôn render đủ một lần, đúng vị trí tương đối trong stream. Chúng không bị thu gọn bởi nhóm tool.
5. Một nhóm được người dùng đóng chỉ che các hàng tool thuộc nhóm đó; dữ liệu vẫn giữ trong runtime và mở lại được ngay.

## Điều kiện được gom

Chỉ gom một chuỗi tool thỏa tất cả điều kiện:

- tool neutral, không có quyền chờ duyệt, không phải câu hỏi/nhập liệu;
- không phải `Task`, Plan, Diff, hay tool có children;
- liền kề trong cùng lượt phản hồi agent;
- gặp text, reasoning, event, user message, Plan, Diff, Task, permission, câu hỏi, lỗi hoặc ranh giới lượt agent thì kết thúc nhóm.

Các block không đủ điều kiện vẫn dùng renderer hiện tại và luôn đứng riêng.

## Trình bày

- Text và reasoning: không bọc trong box/card.
- Nhóm tool: `width: 100%; max-width: 600px`; header nêu số thao tác, trạng thái, thời lượng và tóm tắt ngắn.
- Nhóm hoàn tất mặc định thu gọn. Nhóm đang chạy, lỗi hoặc cần hành động mặc định mở.
- Khi mở nhóm: mỗi tool là một hàng gọn, vẫn theo thứ tự gốc.
- Tool không có output/chi tiết: hàng tĩnh, không có affordance mở rộng.
- `Apply Changes`: hiển thị file đã tác động và trạng thái; chỉ mở khi có output lỗi/text thật.
- `Diff`: luôn có affordance xem diff.
- Terminal/Diff/result có nội dung: bung ngay dưới hàng tương ứng, full chiều ngang nhóm (tối đa 600px); `max-height: 300px; overflow: auto`. Dòng log/code quá dài cuộn ngang, không ép wrap.

## Kiến trúc dự kiến

`useHappyRuntime` và `toThreadMessageLike` giữ mapping một-một giữa `ChatBlock` và assistant-ui message. Một resolver trình bày chỉ đọc stream để tính ranh giới/chỉ mục nhóm. Renderer dùng metadata đó để vẽ header, hàng và trạng thái đóng/mở; không được thay message list của assistant-ui.

Trước khi implement phải xác nhận API renderer assistant-ui cho phép bọc các tool liền kề mà không bỏ root/message sibling. Nếu không cho phép, dùng một presentation layer bên ngoài renderer nhưng vẫn render từng `ChatBlock` nguyên trạng; không quay lại cách tạo `activity-group` synthetic message.

## Rủi ro và cách chặn

| Rủi ro | Chặn |
|---|---|
| Mất reasoning/text do đổi message stream | Không biến đổi `ChatBlock[]`; test sequence xen kẽ. |
| Gom nhầm tool quan trọng | Predicate bảo thủ; mọi tool có permission, children hoặc tone đặc biệt là boundary. |
| UI gọn nhưng không xem được kết quả | Chỉ output thật mới có affordance; test mở Terminal, Diff và lỗi. |
| Nội dung log làm vỡ layout | Giới hạn chiều cao 300px, cuộn dọc/ngang, kiểm tra màn hẹp. |

## Kiểm chứng tối thiểu

1. Stream xen kẽ `reasoning → neutral tools → text → neutral tools → event`: mọi reasoning/text/event xuất hiện đúng một lần và đúng thứ tự; chỉ hai run tool được nhóm.
2. Plan, Diff, Task, permission, câu hỏi và tool có children không nằm trong nhóm neutral.
3. Nhóm đóng/mở không làm mất tool; Terminal có output mở full chiều ngang nhóm và cuộn sau 300px; tool không output không có control mở.
4. Browser check trên phiên thật: không còn synthetic/blank message, không lỗi console, nội dung agent trước/sau nhóm hiển thị đầy đủ.

## Ngoài phạm vi

- Không thay đổi logic agent, hub, persistence hay schema dữ liệu.
- Không thay đổi nội dung raw output do provider gửi.
- Không gom reasoning/text thành nhóm hoặc card.
