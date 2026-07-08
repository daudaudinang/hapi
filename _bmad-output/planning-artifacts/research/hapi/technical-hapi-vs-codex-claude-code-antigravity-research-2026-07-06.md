# HAPI giải quyết nỗi đau khi dùng AI coding agent

**Date:** 2026-07-06
**Author:** littlepea
**Research Type:** So sánh tính năng cho người dùng

---

## Research Overview

[Research overview and methodology will be appended here]

---

<!-- Content will be appended sequentially through research workflow steps -->


## Phạm vi tài liệu

**Chủ đề:** HAPI giải quyết nỗi đau khi dùng Codex, Claude Code, và Antigravity.

**Người đọc:** Người dùng ít kỹ thuật, muốn hiểu nhanh HAPI giúp gì trong công việc hằng ngày.

**Mục tiêu:**

- Nói rõ người dùng đang vướng gì khi dùng các AI coding agent hiện nay.
- Nói rõ HAPI giúp giải quyết bằng tính năng nào.
- Tránh thuật ngữ kỹ thuật nếu không cần.
- Dùng bảng, ví dụ đời thường, sơ đồ đơn giản.
- Giữ thông tin đúng bằng nguồn chính thức.

**Không đưa vào bản chính:**

- Công nghệ bên dưới.
- Cấu trúc source code.
- Tên framework, database, protocol.
- Chi tiết dành cho developer vận hành hệ thống.

**Đã chốt phạm vi:** 2026-07-06


## Định hướng tài liệu dành cho người dùng ít kỹ thuật

### Nguyên tắc viết mới

Tài liệu này sẽ không đi sâu vào công nghệ bên dưới. Người đọc không cần biết Socket.IO, SSE, SQLite, MCP, runner, API hay framework.

Thay vào đó, tài liệu sẽ trả lời 3 câu hỏi dễ hiểu:

1. Khi dùng Codex / Claude Code / Antigravity, người dùng đang vướng gì?
2. HAPI giúp đỡ ở điểm nào?
3. Khi dùng HAPI, cuộc sống hằng ngày của người dùng dễ hơn ra sao?

### Cách gọi HAPI cho dễ hiểu

**HAPI = bảng điều khiển từ xa cho các AI coding agent.**

Nói đời thường:

- Codex / Claude Code / Gemini giống như “người thợ AI” đang làm việc trên máy.
- HAPI giống như “bộ điều khiển từ xa” để xem, nhắc, duyệt, dừng, tiếp tục người thợ đó từ điện thoại hoặc trình duyệt.
- HAPI không cố thay thế Codex hay Claude Code. HAPI giúp dùng chúng thuận tiện hơn.

### Trọng tâm so sánh mới

Không so theo kiểu:

- công nghệ nào dùng gì,
- code bên dưới chạy ra sao,
- kiến trúc chi tiết thế nào.

Sẽ so theo kiểu người dùng:

| Nỗi đau người dùng | HAPI giải quyết bằng gì | Lợi ích dễ hiểu |
|---|---|---|
| Đang đi ra ngoài mà agent hỏi quyền sửa file | Duyệt quyền trên điện thoại | Không phải quay lại máy tính |
| Agent chạy lâu, không biết xong chưa | Theo dõi session trên web/mobile | Biết việc đang tới đâu |
| Mỗi agent nằm một chỗ khác nhau | Gom Claude Code, Codex, Gemini, OpenCode vào một nơi | Đỡ nhảy qua nhiều app |
| Muốn chạy lệnh nhanh khi xa máy | Terminal từ xa | Xử lý việc nhỏ ngay trên điện thoại |
| Muốn tiếp tục phiên đang chạy | Handoff local ↔ remote | Không mất mạch làm việc |
| Muốn xem file/diff khi agent sửa code | File browser và git diff trên web | Dễ kiểm tra trước khi duyệt |
| Team cần biết agent đang làm gì | Session list, trạng thái, thông báo | Dễ phối hợp hơn |

### Sơ đồ sẽ dùng trong bản cuối

```text
Người dùng
  ↓
Điện thoại / Trình duyệt / Telegram
  ↓
HAPI
  ↓
Máy đang chạy agent
  ↓
Codex / Claude Code / Gemini / OpenCode
  ↓
Kết quả quay lại HAPI để người dùng xem và duyệt
```

### Thông điệp chính

**HAPI giải quyết nỗi đau “AI agent chạy được nhưng khó điều khiển khi rời máy”.**

Với người dùng ít kỹ thuật, thông điệp nên là:

> Dùng Codex hay Claude Code rất mạnh, nhưng thường bị kẹt ở cái máy đang mở terminal. HAPI giúp bạn mang bảng điều khiển agent lên điện thoại và trình duyệt: xem tiến độ, gửi tin nhắn, duyệt quyền, xem file, mở terminal, và tiếp tục công việc mà không cần ngồi trước máy.

### Những phần cần loại khỏi bản người dùng

Các phần sau chỉ để phụ lục nội bộ, không đưa vào bản chính:

- tên framework frontend/backend,
- giao thức realtime,
- database,
- chi tiết route/API,
- chi tiết Socket.IO/SSE/RPC,
- cấu trúc thư mục source code,
- cách build/test,
- phân tích implementation.

### Những phần nên giữ

- HAPI dùng để làm gì.
- Người dùng đang đau ở đâu.
- HAPI giảm đau thế nào.
- HAPI khác Codex / Claude Code / Antigravity ở trải nghiệm sử dụng ra sao.
- Sơ đồ đơn giản.
- Bảng so sánh theo tình huống đời thường.
- Nguồn chính thức để bảo đảm thông tin đúng.
