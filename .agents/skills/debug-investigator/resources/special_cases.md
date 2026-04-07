# Cases Đặc Biệt khi Debug

Tham khảo tài liệu này khi gặp các trường hợp phức tạp trong quá trình điều tra.

---

## 1. Không thể xác định nguyên nhân rõ ràng

**Khi nào:** Sau khi trace hết files/luồng mà vẫn không tìm được nguyên nhân đủ mạnh.

**Cách xử lý:**
1. Ghi rõ:
   - Đã đọc/trace những file/luồng nào
   - Những rủi ro nào đã bị LOẠI TRỪ (vì không khớp triệu chứng)
   - Những hypothesis còn lại nhưng thiếu dữ liệu xác nhận
2. Đề xuất cụ thể cho user:
   - Thêm log ở đâu, log gì (dùng `logger.info`/`logger.warn`)
   - User cần cung cấp thêm: cấu hình, version, môi trường, data sample
   - Browser DevTools: Network tab, Console tab, nếu frontend

**Template output:**
```text
KHÔNG THỂ XÁC ĐỊNH CHẮC CHẮN.

Đã điều tra:
- [N] files/modules
- Loại trừ: [hypothesis A, B vì ...]

Hypothesis còn lại:
1. [...] (Confidence ~40%) — thiếu [data gì] để xác nhận

Đề xuất user hành động:
- [ ] Thêm logger.info tại [file:line] — log [variables]
- [ ] Reproduce lại và chụp Network tab
- [ ] Cung cấp: [env config, data sample, ...]
```

---

## 2. Lỗi do nhiều yếu tố kết hợp

**Khi nào:** Bug là kết quả của nhiều nguyên nhân nhỏ kết hợp.

**Cách xử lý:**
1. Liệt kê TỪNG nguyên nhân + mức đóng góp (tương đối):
   ```text
   Nguyên nhân kết hợp:
   1. [Data format sai] — đóng góp 40% — file:line
   2. [Timing issue] — đóng góp 35% — file:line
   3. [Missing validation] — đóng góp 25% — file:line
   ```
2. Mô tả mối quan hệ (chain of events):
   - Nguyên nhân 1 + 2 → tạo điều kiện cho → Nguyên nhân 3 → gây lỗi
3. Đề xuất thứ tự fix:
   - Fix nguyên nhân ảnh hưởng nhiều nhất / ít risk nhất TRƯỚC
   - Giải thích tại sao thứ tự này

---

## 3. Race Condition / Timing Issue

**Triệu chứng nhận biết:**
- Không xảy ra 100% — phụ thuộc timing
- Xảy ra với load cao / actions nhanh liên tiếp
- Reload lại thì hết (vì state reset)

**Cách điều tra:**
1. Mô tả luồng thời gian (timeline) của events/async tasks:
   ```text
   Timeline bình thường:
   t0: User click "Add" → t1: Request A sent → t2: Response A → t3: State update

   Timeline lỗi (khi 2 clicks gần nhau):
   t0: User click "Add" → t1: Request A sent
   t0.5: User click "Add" lần 2 → t1.5: Request B sent
   t2: Response A → State update (data cũ)
   t2.5: Response B → State update (override response A) → SAI!
   ```
2. Xác định điểm conflict (state bị đọc trước khi update xong)
3. Đề xuất options:
   - **Debounce/throttle**: Limit frequency of triggers
   - **Queue**: Serialize requests
   - **Optimistic lock**: Version check trước update
   - **AbortController**: Cancel request cũ khi có request mới
   - **Mutex/Semaphore**: Đồng bộ hóa access

---

## 4. Frontend Re-render / State Issue

**Triệu chứng nhận biết:**
- State không update đúng
- UI nháy/giật, cập nhật sai thời điểm
- Stale data hiển thị

**Cách điều tra:**
1. Check parent → child data flow:
   - Props drilling có mất data?
   - Context provider có đúng scope?
2. Check hooks:
   - `useEffect` dependencies đúng/thiếu?
   - `useState` setter dùng callback form?
   - Custom hook có side effects?
3. Xác định nguồn re-render:
   - Object/array reference thay đổi mỗi render?
   - Context update gây re-render toàn bộ?

**Đề xuất fix:**
- `useMemo` / `useCallback` cho computed values
- `React.memo` cho child components
- Tách context nhỏ hơn (avoid monolith context)
- `useRef` cho values không cần trigger re-render

---

## 5. Performance Issue

**Triệu chứng nhận biết:**
- Chậm, lag, tốn CPU/memory/bandwidth bất thường
- Freeze UI, timeout API

**Cách điều tra:**
1. Xác định bottleneck:
   - Vòng lặp O(n²) hoặc nặng hơn
   - N+1 query (ORM)
   - Xử lý đồng bộ blocking main thread
   - Large payload (serialize/deserialize)
   - Memory leak (event listeners, subscriptions)
2. Đo lường (nếu có thể):
   - Console timing: `performance.now()`
   - Network tab: response time, payload size

**Đề xuất fix:**
Quick wins:
- Cache (in-memory, Redis, HTTP cache)
- Database index
- Batch operations
- Pagination / lazy loading
- Debounce / throttle

Long-term:
- Refactor algorithm (reduce complexity)
- Tách service / background job
- Stream processing thay vì load all
- CDN cho static assets
