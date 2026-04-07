# /implement – Quy trình triển khai code an toàn \& Chính xác

Command này hướng dẫn Agent thực hiện các thay đổi code từ mức độ nhỏ (refactor) đến lớn (feature mới) theo quy trình khép kín, ưu tiên độ chính xác và an toàn.

## Cách dùng

```text
/implement <mô tả yêu cầu hoặc tham chiếu tới kết quả của /debug, /review-fe>
```


***

## Phase 0: Setup & Context (Chuẩn bị)

**Mục tiêu:** Đảm bảo Agent đang ở đúng workspace, có checklist rõ ràng và hiểu cơ bản cấu trúc dự án trước khi đánh giá yêu cầu.

- **Xác nhận môi trường:** Dùng `run_terminal_cmd` với `pwd` hoặc `list_dir` để chắc chắn đang thao tác trong workspace mà user mô tả; báo lại ngay nếu khác biệt.
- **Khởi tạo Todo:** Tạo danh sách công việc bằng `todo_write` (tối thiểu 2 task) và cập nhật trạng thái sau mỗi bước để user nắm tiến độ.
- **Thu thập bối cảnh:** Nếu chưa rõ module liên quan, ưu tiên `glob_file_search`/`list_dir` để định vị thư mục rồi dùng `read_file` (có offset/limit) đọc nhanh kiến trúc trước khi sang Phase 1.

***

## Phase 1: Verification \& Feasibility (Thẩm định)

**Mục tiêu:** Đảm bảo yêu cầu là hợp lý và chưa được thực hiện. Tránh việc Agent "viết lại những thứ đã có".

### 1.1 Kiểm tra hiện trạng

Agent phải thực hiện các hành động:

- **Search Codebase:** Tìm kiếm xem tính năng/logic này đã tồn tại chưa?  
  - Nếu cần tìm theo ngữ nghĩa → ưu tiên `codebase_search`.  
  - Nếu biết chính xác từ khóa/symbol → dùng `rg` hoặc `glob_file_search`.  
  - Khi phát hiện code liên quan, trích dẫn bằng `read_file` để làm bằng chứng.
- **Check Dependencies:** Kiểm tra xem các thư viện cần thiết đã có chưa hay cần cài thêm?  
  - Đọc `package.json`, `bun.lockb` bằng `read_file`.  
  - Nếu cần xác thực phiên bản thực tế → `run_terminal_cmd` với `bun pm ls <package>`.  
  - Chưa cài thêm dependency mới cho tới sau Phase 2.
- **Mental Simulation:** Hình dung logic yêu cầu sẽ lắp vào đâu trong kiến trúc hiện tại.  
  - Dùng `read_file` (kết hợp offset/limit) để xem Controller/Service/Repository liên quan.  
  - Mô tả ngắn trong phần reasoning về cách feature ghép vào kiến trúc nhiều lớp trước khi ra quyết định.


### 1.2 Quyết định (Decision Gate)

- **NẾU** tính năng đã tồn tại hoặc logic hiện tại đã đúng:
    - **DỪNG LẠI NGAY**.
    - Báo cáo: "Tính năng này đã tồn tại ở file `[filepath]`. Code hiện tại đã đáp ứng yêu cầu. Bạn có muốn tôi review lại cách dùng không?"
- **NẾU** yêu cầu mâu thuẫn với architecture hiện tại (ví dụ: yêu cầu sửa trực tiếp file `node_modules`):
    - **DỪNG LẠI** và cảnh báo rủi ro.
- **NẾU** hợp lệ: Chuyển sang Phase 2.

***

## Phase 2: Detailed Planning (Lập kế hoạch chi tiết)

**Mục tiêu:** "Measure twice, cut once" (Đo hai lần, cắt một lần). Không viết code khi chưa có bản vẽ.

Agent phải:

- Dẫn nguồn cụ thể cho từng file (đường dẫn + trích đoạn `read_file`/`codebase_search`) trong phần phạm vi tác động.
- Nếu cần kiểm tra symbol → dùng lại `rg`/`glob_file_search` để bảo đảm không bỏ sót module.
- Ghi rõ lệnh test/lint dự kiến sẽ chạy trong Phase 3 (`bun test`, `bun run lint`, ...).

Sau đó xuất ra output kế hoạch theo format sau:

```markdown
## KẾ HOẠCH TRIỂN KHAI

### 1. Phạm vi tác động (Impact Analysis)
- **Files cần tạo mới:**
  - `path/to/new_file.ts` (Mục đích: ...)
- **Files cần sửa đổi:**
  - `path/to/existing_file.ts` (Thay đổi: ...)
- **Files bị ảnh hưởng gián tiếp:** (Configs, Tests, Types)

### 2. Chiến lược Test (Test Strategy)
- **Unit Test:** Cần test hàm nào? Input/Output mong đợi là gì?
- **Integration Test:** Cần verify luồng nào?
- **Edge Cases cần lưu ý:** (Null, Empty List, Network Error, Timeout...)

### 3. Các bước thực hiện (Step-by-Step Plan)
*Lưu ý: Mỗi bước phải độc lập nhất có thể.*

- **Bước 1: [Tên bước - ví dụ: Định nghĩa Interface/DTO]**
  - Input: `current_types.ts`
  - Output: Cập nhật types mới.
  - Validation: Không có lỗi Type check.

- **Bước 2: [Tên bước - ví dụ: Implement Logic Core]**
  - Input: Interface từ B1 + Logic yêu cầu.
  - Output: Code function trong file Controller.
  - Validation: Unit test đơn giản pass.

- **Bước 3: [Tên bước - ví dụ: UI Integration / Wiring]**
  - ...
```

**DỪNG LẠI** ở đây và hỏi user: *"Kế hoạch này đã ổn chưa? Cậu có muốn bổ sung test case nào không?"*

***

## Phase 3: Execution (Thực thi code)

Sau khi user "Approve", Agent thực hiện code lần lượt từng bước trong kế hoạch.

**Nguyên tắc Code:**

1. **Atomic Changes:** Thay đổi từng file/function nhỏ, không paste đè cả file lớn nếu không cần thiết.
2. **Style Compliance:** Tuân thủ `.cursorrules` (Naming, Typing, Formatting).
3. **No Broken Code:** Code sinh ra không được làm gãy các phần khác (check imports, types).
4. **Comment:** Chỉ comment những logic phức tạp, không comment những thứ hiển nhiên.
5. **Tooling Discipline:** Ưu tiên `apply_patch` cho file text, `edit_notebook` cho notebook; không dùng shell `cat` để xem file mà phải `read_file`. Chạy các lệnh `bun test`, `bun run lint`, ... thông qua `run_terminal_cmd` ngay khi hoàn thành mỗi bước lớn và cập nhật `todo_write`.
6. **Browser Workflow:** Khi cần test UI, chỉ sử dụng browser tools (`browser_navigate`, `browser_snapshot`, ...) và ghi rõ thao tác trong phần báo cáo.

***

## Phase 4: Post-Implementation Review (Tự kiểm tra)

**Mục tiêu:** Agent tự đóng vai "Người khó tính" để review code mình vừa viết. Tuyệt đối không bỏ qua bước này.

Agent tự đặt câu hỏi và quét lại code vừa sinh:

1. **Logic Check:** Code này có chạy đúng logic user yêu cầu không?
2. **Security Check:** Có hardcode secret key không? Có validate input user chưa?
3. **Performance Check:** Có vòng lặp lồng nhau (O(n^2)) không cần thiết không? Có query DB trong vòng lặp không?
4. **Clean Code:** Có biến nào đặt tên tối nghĩa không? Hàm có quá dài không?
5. **Tool Check:** Bắt buộc chạy `read_lints` cho file vừa chỉnh; nếu có logic mới phải chạy `bun test` (hoặc command phù hợp) bằng `run_terminal_cmd` và ghi lại kết quả. Dò `rg TODO`/`FIXME` trong phạm vi chỉnh sửa để tránh bỏ sót.

***

## Phase 5: Final Report (Báo cáo tổng kết)

Agent xuất báo cáo cuối cùng cho user:

```markdown
# BÁO CÁO TRIỂN KHAI

✅ **Trạng thái:** [Hoàn thành / Hoàn thành một phần]

### 📋 Công việc đã làm
- [x] Đã tạo file `X`
- [x] Đã sửa logic function `Y`
- [x] Đã thêm test case `Z`

### ⚠️ Risk Assessment & Edge Cases (Quan trọng)

| Mức độ | Rủi ro / Vấn đề tồn đọng | Edge Cases chưa cover | Đề xuất xử lý |
| :--- | :--- | :--- | :--- |
| 🔴 High | (Ví dụ: Chưa xử lý transaction khi DB lỗi) | Mất kết nối mạng giữa chừng | Cần thêm try/catch và rollback mechanism |
| 🟡 Med | (Ví dụ: Performance có thể chậm nếu list > 10k items) | List user rỗng | Cần thêm phân trang (Pagination) |
| 🟢 Low | (Ví dụ: Thiếu TSDoc cho hàm internal) | - | Có thể bổ sung sau |

### 🚀 Next Steps
- Tóm tắt kết quả của mọi command đã chạy (`bun test`, `bun run lint`, ...) thay vì dán toàn bộ log; nếu có lỗi cần ghi rõ cách xử lý/diễn giải.
- Nếu có kiểm thử thủ công/UI, đính kèm mô tả thao tác cùng kết quả snapshot (nếu dùng browser tool).
- User cần chạy lệnh: `bun run db:migrate` (ví dụ)
- User cần config thêm env: `API_KEY=...`
