# /implement-plan <plan_file_path>

> **🔗 SKILL BẮT BUỘC**: Trước khi thực hiện workflow này, PHẢI đọc skill file tương ứng bằng `view_file`:
> 1. **Workspace**: `.agents/skills/implement-plan/SKILL.md` (ưu tiên nếu tồn tại)
> 2. **Global**: `~/.gemini/antigravity/skills/implement-plan/SKILL.md` (fallback)
>
> Skill file chứa instructions chi tiết, TDD/Direct flow, walkthrough template, examples, quy tắc **Execution Boundary** và **Verification**.
> KHÔNG ĐƯỢC BỎ QUA BƯỚC ĐỌC SKILL FILE.

Workflow triển khai plan dành cho IDE Agent. Agent sẽ đọc plan, đánh giá tính khả thi, tuân thủ Execution Boundary, triển khai tuần tự từng phase, và verify Acceptance Criteria.

---

## ⚡ Quick Overview

1.  **Phase 0: Khởi tạo & Đánh giá**: Nạp Context, đọc plan, kiểm tra Dependencies, ghi nhận Execution Boundary, **chạy Pre-flight Check**, đánh giá khả thi. Có áp dụng Context Sharding đối với plan Tier L.
2.  **Phase N: Triển khai & Verify**:
    *   **Đọc Implementation Order** → implement đúng thứ tự dependency.
    *   Thực hiện code theo flow TDD (enriched) hoặc Direct Implementation.
    *   **Progress tracking**: báo trước/sau mỗi task.
    *   **BẮT BUỘC**: Chạy các Verify Command trong Acceptance Criteria sau khi implement.
    *   **BẮT BUỘC**: Không sửa các file bị cấm trong danh sách Do NOT Modify.
    *   Tạo file walkthrough báo cáo chi tiết sau mỗi phase.
3.  **Nếu thất bại**: Flow Debug (3 lần) → **Rollback Protocol** (revert/giữ lại/rollback toàn bộ).
4.  **Hoàn thành**: Cung cấp tổng kết, báo cáo trạng thái AC Verification và hướng dẫn manual test trải nghiệm.

**CHI TIẾT VÀ CÁC QUY TẮC NGẶT NGHÈO XEM TẠI FILE `SKILL.md`.**