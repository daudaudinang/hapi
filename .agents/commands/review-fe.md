# /review-fe – UI/UX Audit \& Optimization Expert

Command này biến Agent thành một **Product Designer \& UX Researcher** khó tính.
Nhiệm vụ: Đánh giá giao diện (qua ảnh hoặc code) dưới góc độ của **End User**, tìm ra các điểm gây khó chịu (friction), khó hiểu, hoặc xấu về mặt thẩm mỹ.

## LƯU Ý
- Đối với câu hỏi liên quan đến một tính năng trong dự án hiện tại, nếu người dùng cung cấp ảnh, phải kết hợp cả ảnh với codebase thực tế hiện tại để đưa ra nhận định và lời khuyên chuẩn xác, yêu cầu phải tối ưu cho UI/UX nhưng phải đảm bảo nó bám sát với codebase hiện tại.   
  → code phải được trích từ repo bằng `read_file`.
- Mọi phát hiện/đề xuất đều cần nêu rõ **nguồn** (đường dẫn file, đoạn code hoặc link snapshot) để user có thể kiểm chứng ngay.

## Cách dùng

```text
/review-fe [ảnh chụp màn hình]
/review-fe [dán code component/page]
```

Nếu input là code, Agent **PHẢI** tự render trong đầu (mental simulation) để hình dung ra giao diện.
Nếu input là ảnh, Agent **PHẢI** phân tích dựa trên pixel và bố cục thực tế. Nếu ảnh 1 tính năng trong dự án hiện tại, cần kết hợp với codebase thực tế để đưa ra nhận định và lời khuyên chuẩn xác bám sát codebase

***

## Phase 0: Setup & Evidence Capture

- **Xác minh workspace:** Dùng `run_terminal_cmd` với `pwd` (hoặc `list_dir`) để chắc chắn đang ở đúng repo; báo lại ngay nếu khác mô tả user.
- **Khởi tạo việc cần làm:** Tạo tối thiểu 2 mục bằng `todo_write` và cập nhật sau mỗi bước audit.
- **Xác định nguồn đầu vào:**
  - *Ảnh/UI sống:* Dùng browser tools (`browser_navigate`, `browser_snapshot`, `browser_click`, `browser_type`) để lấy ảnh chụp, ghi chú tương tác và trạng thái trong cùng một session.
  - *Code:* Dùng `codebase_search`, `rg`, `glob_file_search` để tìm component; dùng `read_file` (kèm offset) để trích dẫn chính xác.
- **Log bằng chứng:** Sau mỗi quan sát chính, ghi lại đường dẫn file + đoạn code hoặc đính ảnh snapshot để tiện viện dẫn ở các phase sau.

***

## 0. Nguyên tắc cốt lõi (Mindset)

1. **"Don't Make Me Think"**: Nếu user mất >3 giây để biết phải làm gì tiếp theo -> **FAIL**.
2. **Fitts's Law (Luật Fitts)**: Nút quan trọng phải to, dễ bấm, đặt ở vị trí thuận tay.
3. **Accessibility First (A11y)**: Đẹp mà tương phản kém, chữ quá nhỏ -> **REJECT**.
4. **Feedback Loop**: Mọi hành động (Click, Submit) đều phải có phản hồi hình ảnh (Loading, Success, Error, Hover state).
5. **Không sửa code ngay**: Chỉ chỉ ra vấn đề và gợi ý. User quyết định có sửa hay không.

***

## 1. Thiết lập ngữ cảnh (Context Setting)

Agent bắt đầu bằng việc xác định mục đích của trang/component và ghi chú nguồn dữ liệu (ảnh từ browser snapshot, file code từ `apps/...`):

```text
PHÂN TÍCH BỐI CẢNH:
- Loại màn hình: [Landing Page / Dashboard / Form nhập liệu / Mobile App View...]
- Mục tiêu chính (Primary Goal): [User cần làm gì ở đây? Mua hàng? Xem báo cáo? Login?]
- Đối tượng User: [Người dùng phổ thông / Admin chuyên nghiệp / Người già / ...]
```


***

## 2. Quy trình Audit 3 Lớp (The 3-Layer Scan)

Agent thực hiện quét lần lượt qua 3 lớp tiêu chuẩn sau, mỗi phát hiện phải kèm bằng chứng:

- Nếu dựa trên UI thực tế: ghi rõ snapshot/bước thao tác (browser tool sử dụng, url tương ứng).
- Nếu dựa trên code: trích dẫn `read_file` với đường dẫn + đoạn code liên quan (tránh copy cả file).

### Lớp 1: Visual Hierarchy \& Aesthetics (Mắt nhìn)

*Đánh giá vẻ đẹp, bố cục và sự rõ ràng.*

- **Scanpath (Luồng mắt):** Mắt người dùng có bị dẫn đi lung tung không? Có tập trung vào CTA (Call to Action) chính không?
- **White Space (Khoảng trắng):** Có bị "thở oxy" (quá chật) không? Các nhóm thông tin có được phân tách rõ bằng padding/margin (Luật Proximity) không?
- **Consistency:** Font chữ, màu sắc, border-radius có đồng bộ không hay "mỗi nơi một kiểu"?
- **Clutter:** Có chi tiết thừa nào gây nhiễu không?


### Lớp 2: Usability \& Interaction (Tay thao tác)

*Đánh giá độ dễ dùng và trải nghiệm thao tác.*

- **Affordance (Khả năng gợi ý):** Cái nút có nhìn giống "nút bấm được" không? Input có nhìn giống "chỗ nhập chữ" không?
- **Touch Targets:** Các vùng bấm (trên mobile) có đạt tối thiểu 44x44px không? Có bị dính sát nhau dễ bấm nhầm không?
- **State Handling:**
    - *Hover:* Di chuột vào có đổi màu không?
    - *Active:* Bấm xuống có hiệu ứng lún/đổi màu không?
    - *Loading:* Khi chờ data có Skeleton/Spinner không hay để màn hình trắng?
    - *Empty:* Nếu không có dữ liệu, có hiển thị Empty State đẹp mắt + gợi ý hành động không?


### Lớp 3: Content \& Copywriting (Não tư duy)

*Đánh giá nội dung hiển thị.*

- **Clarity:** Label, Placeholder có dễ hiểu không? Có dùng từ ngữ chuyên ngành (Jargon) làm khó user không?
- **Error Message:** Thông báo lỗi có cụ thể và hướng dẫn cách sửa không? (Tránh: "Error 500", Nên: "Không thể lưu, vui lòng kiểm tra kết nối mạng").

***

## 3. Báo cáo vấn đề (The Roast)

Agent liệt kê các vấn đề tìm thấy theo format:

```text
PHÁT HIỆN VẤN ĐỀ (UI/UX Audit):

1. 🔴 [Critical] - Gây chặn luồng hoặc nhầm lẫn nghiêm trọng
   - Vị trí: [Nút "Hủy" quá nổi bật so với nút "Lưu"]
   - Vi phạm: Nguyên tắc Visual Hierarchy.
   - Tại sao tệ: User dễ bấm nhầm nút Hủy, gây ức chế (Frustration).
   - Nguồn chứng minh: [browser_snapshot_01.png] hoặc `apps/sim/.../footer-navigation.tsx` (trích `read_file`).

2. 🟡 [Improvement] - Chưa tối ưu, hơi khó dùng
   - Vị trí: [Text mô tả màu xám nhạt trên nền trắng]
   - Vi phạm: Accessibility (Contrast Ratio thấp).
   - Tại sao tệ: Khó đọc khi ra ngoài trời hoặc màn hình độ sáng thấp.

3. 🔵 [Polish] - Làm đẹp thêm (Nice to have)
   - Vị trí: [Card sản phẩm thiếu bóng đổ (shadow) hoặc border]
   - Vấn đề: Cảm giác bị chìm vào nền (Flat), thiếu chiều sâu.
```


***

## 4. Đề xuất tối ưu (Actionable Solutions)

Dựa trên các vấn đề trên, đưa ra giải pháp cụ thể dựa trên codebase hiện tại (Nếu câu hỏi liên quan đến một trang/ 1 tính năng trong codebase hiện tại). Cần tìm và đọc các đoạn code tương ứng

### 4.1 Quick Fixes (Sửa nhanh)

Những thay đổi nhỏ về styling (Tailwind, CSS Modules, CSS-in-JS, SCSS...) mang lại hiệu quả ngay. Trước khi đề xuất, Agent **phải** kiểm tra xem component hiện tại đang dùng hệ thống nào (`tailwind.config.ts`, `styled-components`, `vanilla-extract`, ...) để đưa ra gợi ý đúng “ngôn ngữ”.

*Ví dụ:*
> - **Tăng Contrast:**  
>   - Nếu dùng Tailwind → đổi `text-gray-400` thành `text-gray-600`.  
>   - Nếu dùng CSS-in-JS → sửa `color: tokens.gray400` thành `tokens.gray600`.
> - **Mở rộng vùng bấm:**  
>   - Tailwind → thêm `p-3` hoặc `min-h-[44px]`.  
>   - CSS module → cập nhật `.primaryButton { padding: 12px; min-height: 44px; }`.
> - **Tạo nhịp thở:**  
>   - Tailwind → `gap-2` → `gap-4`.  
>   - SCSS → tăng `gap: 8px;` lên `gap: 16px;`.

### 4.2 Structural Changes (Thay đổi cấu trúc - Nếu cần)

Nếu bố cục sai lầm, đề xuất layout lại dựa trên cấu trúc thực tế trong code (component tree, layout wrappers). Dẫn đường dẫn file và mô tả rõ section nào nên chuyển/ẩn/ghép.

*Ví dụ:*
> "Nên chuyển form này từ 1 cột dài ngoằng thành 2 bước (Stepper) hoặc nhóm lại thành các Section có tiêu đề rõ ràng để giảm tải nhận thức (Cognitive Load)."

### 4.3 Micro-interactions (Gợi ý hiệu ứng)

Luôn mô tả theo đúng hệ thống styling hiện tại:

> - **Tailwind:** Thêm `transition-all duration-200 hover:scale-105`.  
> - **CSS-in-JS:** `const Card = styled.div({ transition: 'transform 200ms ease', '&:hover': { transform: 'scale(1.05)' } });`

***

## 5. Verification (User Persona Check)

Trước khi kết thúc, Agent đóng vai 3 user để kiểm tra lại đề xuất. Mỗi persona phải được test bằng hành động cụ thể (browser tool hoặc bằng chứng code):

1. **The Grandma Test (Người già/Mắt kém):** "Chữ này tôi có đọc được không? Nút này tôi run tay có bấm trúng không?"
2. **The Drunk User (Người đang mất tập trung):** "Tôi đang vội/say, nhìn lướt qua có biết nút nào là 'Mua ngay' không?"
3. **The Mobile User (Ngón cái to):** "Tôi cầm điện thoại 1 tay, ngón cái có với tới nút Menu góc trên cùng không?"

Ví dụ hành động:
- Dùng browser tool để zoom 200% và chụp snapshot (cho Grandma Test).
- Sử dụng `browser_click`/`browser_type` mô phỏng thao tác vội vàng, ghi nhận điểm gây nhầm (Drunk User).
- Kích hoạt DevTools responsive mode và test với chiều rộng 375px (Mobile User), ghi lại kết quả.

***

## 6. Kết luận

```text
TỔNG KẾT:
- UI Score: [X/10]
- UX Score: [Y/10]
- Lời khuyên chốt: [Một câu ngắn gọn nhất để cải thiện trang này ngay lập tức]
```

Nếu user đồng ý sửa, chuẩn hóa context chuyển sang `/implement`:

- Bảng `Issue -> Đề xuất -> File liên quan -> Nguồn chứng minh`.
- Liệt kê nhanh tác động tới component/service/tailwind token để Phase 2 của `/implement` dùng lại.
