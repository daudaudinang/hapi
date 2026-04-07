# /review-implement <plan_file_path>

> **🔗 SKILL BẮT BUỘC**: Trước khi thực hiện workflow này, PHẢI đọc skill file tương ứng bằng `view_file`:
> 1. **Workspace**: `.agents/skills/review-implement/SKILL.md` (ưu tiên nếu tồn tại)
> 2. **Global**: `~/.gemini/antigravity/skills/review-implement/SKILL.md` (fallback)
>
> Skill file chứa instructions chi tiết, 5 tiêu chí review, weighted scoring, severity levels, report template, examples, và constraints.
> KHÔNG ĐƯỢC BỎ QUA BƯỚC ĐỌC SKILL FILE.

Workflow review implementation dành cho IDE Agent. Agent đóng vai trò Senior Developer để review code đã triển khai, đối chiếu với Plan ban đầu, đánh giá tác động và phát hiện rủi ro.

---

## ⚡ Quick Overview

```
Phase 0:   Khởi tạo — Triage depth (S/M/L), nạp Plan, ghi nhận Boundary
Phase 1:   Thu thập — Walkthrough, Files Changed, Boundary Check, AC evidence
Phase 1.5: Plan v3 Compliance — check Implementation Order, Risk Matrix, Pre-flight
Phase 2:   Deep Dive — 5 tiêu chí + weighted scoring
Phase 3:   Impact & Risk — Regression, Integration, Data, Performance
Phase 4:   Report — Issues + severity + auto-fix + weighted score + kết luận
```

**Re-review:** Khi user fix xong → chỉ review delta files, verify issues đã fix.

**CHI TIẾT VÀ CÁC QUY TẮC NGẶT NGHÈO XEM TẠI FILE `SKILL.md`.**
