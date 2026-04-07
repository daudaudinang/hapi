# Ví dụ: Tài liệu Database Migration → Skill `db-migration-helper`

## Tài liệu đầu vào (input của user)

> **Quy trình Migration Database của team:**
>
> **Nguyên tắc chung:**
>
> - Mọi thay đổi schema phải qua migration file, KHÔNG sửa trực tiếp production DB.
> - Migration file đặt tên theo format: `YYYYMMDDHHMMSS_mô_tả_ngắn.sql`
> - Mỗi migration phải có cả phần UP (apply) và DOWN (rollback).
> - KHÔNG BAO GIỜ xóa bảng hoặc cột có dữ liệu trên production mà không backup trước.
> - Dữ liệu migration (seed data) phải tách riêng khỏi schema migration.
>
> **Quy trình:**
>
> 1. Tạo migration file mới
> 2. Viết SQL cho phần UP
> 3. Viết SQL cho phần DOWN (rollback)
> 4. Test trên local/staging trước
> 5. Review bởi tech lead
> 6. Apply lên production
>
> **Các loại migration:**
>
> - **Schema migration**: CREATE/ALTER/DROP TABLE, ADD/DROP COLUMN, ADD INDEX
> - **Data migration**: INSERT/UPDATE/DELETE dữ liệu
> - **Seed migration**: Dữ liệu mặc định (roles, permissions, categories)
>
> **Quy tắc đặt tên cột:**
>
> - Dùng snake_case
> - Boolean bắt đầu bằng `is_` hoặc `has_` (VD: `is_active`, `has_verified`)
> - Timestamp kết thúc bằng `_at` (VD: `created_at`, `updated_at`)
> - Foreign key kết thúc bằng `_id` (VD: `user_id`, `category_id`)
>
> **An toàn:**
>
> - DROP TABLE/COLUMN trên production → PHẢI có backup
> - Rename column → KHÔNG dùng RENAME, mà tạo cột mới → copy data → xóa cột cũ
> - Thay đổi kiểu dữ liệu → Tạo cột mới → cast data → xóa cột cũ

---

## Skill được sinh ra (output)

### Cấu trúc thư mục

```
skills/db-migration-helper/
├── SKILL.md
├── resources/
│   ├── migration_template.sql        ← Template file migration chuẩn
│   ├── naming_conventions.md         ← Quy tắc đặt tên bảng/cột
│   ├── dangerous_operations.md       ← Danh sách thao tác nguy hiểm
│   └── common_patterns.md            ← Các pattern SQL thường dùng
├── examples/
│   ├── add_column.md                 ← Ví dụ: Thêm cột mới
│   ├── create_table.md               ← Ví dụ: Tạo bảng mới
│   └── rename_column_safe.md         ← Ví dụ: Đổi tên cột an toàn
└── scripts/
    └── generate_migration.py         ← Script sinh file migration
```

### Nội dung SKILL.md

```markdown
---
name: db-migration-helper
description: |
  Tạo và quản lý database migration files. Hỗ trợ sinh SQL migration an toàn 
  với cả phần UP (apply) và DOWN (rollback). Phát hiện và cảnh báo thao tác 
  nguy hiểm trên production (DROP TABLE, DELETE data). Kích hoạt khi user 
  yêu cầu "tạo migration", "thay đổi database schema", "thêm cột", "tạo bảng mới".
---

# Goal

Sinh database migration files an toàn, có rollback, tuân thủ naming conventions 
và best practices để tránh mất dữ liệu trên production.

# Instructions

## Bước 0: Safety Check (BẮT BUỘC)
1. Đọc `resources/dangerous_operations.md` để biết thao tác nào cần cảnh báo.
2. Nếu user yêu cầu DROP TABLE/COLUMN trên production → DỪNG → Cảnh báo → Yêu cầu backup.
3. Nếu user yêu cầu RENAME COLUMN → Hướng dẫn cách an toàn (tạo mới → copy → xóa cũ).

## Bước 1: Thu thập yêu cầu
1. Hỏi user: "Cần thay đổi gì trong database?"
2. Xác định loại migration: Schema / Data / Seed.
3. Xác định môi trường: Development / Staging / Production.

## Bước 2: Sinh Migration File
1. Tạo tên file theo format: `YYYYMMDDHHMMSS_mô_tả_ngắn.sql`.
2. Sử dụng template từ `resources/migration_template.sql`.
3. Viết phần UP (áp dụng thay đổi).
4. Viết phần DOWN (rollback thay đổi).
5. Tuân thủ naming conventions từ `resources/naming_conventions.md`.

## Bước 3: Kiểm tra chất lượng
1. Đảm bảo có cả UP và DOWN.
2. Đảm bảo DOWN thực sự rollback được (không chỉ là placeholder).
3. Kiểm tra naming conventions (snake_case, is_/has_ prefix, _at suffix, _id suffix).
4. Kiểm tra index cho foreign keys.
5. Kiểm tra NOT NULL constraints có default value không.

## Bước 4: Trình bày kết quả
1. Hiển thị SQL migration hoàn chỉnh.
2. Giải thích từng phần.
3. Cảnh báo nếu có thao tác cần lưu ý.
4. Gợi ý: "Test trên local trước, sau đó nhờ tech lead review."

# Examples

## Ví dụ 1: Thêm cột vào bảng users

**Input:** "Thêm cột phone_number vào bảng users"

**Output:**
```sql
-- Migration: 20260303120000_add_phone_number_to_users.sql

-- ============ UP ============
ALTER TABLE users 
ADD COLUMN phone_number VARCHAR(20) DEFAULT NULL;

CREATE INDEX idx_users_phone_number ON users(phone_number);

-- ============ DOWN ============
DROP INDEX IF EXISTS idx_users_phone_number;

ALTER TABLE users 
DROP COLUMN IF EXISTS phone_number;
```

## Ví dụ 2: Tạo bảng mới với relationships

**Input:** "Tạo bảng orders liên kết với users và products"

**Output:**

```sql
-- Migration: 20260303120100_create_orders_table.sql

-- ============ UP ============
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_product_id ON orders(product_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);

-- Trigger auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_orders_updated_at 
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============ DOWN ============
DROP TRIGGER IF EXISTS update_orders_updated_at ON orders;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS orders;
```

## Ví dụ 3: Đổi tên cột an toàn (production-safe)

**Input:** "Đổi tên cột `name` thành `full_name` trong bảng users (production)"

**Output:**
⚠️ **CẢNH BÁO:** Rename column trên production không nên dùng `RENAME COLUMN`
vì có thể break ứng dụng đang chạy. Sử dụng phương pháp an toàn (3 bước):

```sql
-- Migration 1: 20260303120200_add_full_name_to_users.sql

-- ============ UP ============
-- Bước 1: Tạo cột mới
ALTER TABLE users ADD COLUMN full_name VARCHAR(255);

-- Bước 2: Copy dữ liệu
UPDATE users SET full_name = name WHERE full_name IS NULL;

-- Bước 3: Đặt NOT NULL (sau khi đảm bảo data đã copy)
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;

-- ============ DOWN ============
ALTER TABLE users DROP COLUMN IF EXISTS full_name;
```

```sql
-- Migration 2: 20260303120300_remove_old_name_from_users.sql
-- ⚠️ Chỉ chạy SAU KHI đã cập nhật code để dùng full_name

-- ============ UP ============
ALTER TABLE users DROP COLUMN name;

-- ============ DOWN ============  
ALTER TABLE users ADD COLUMN name VARCHAR(255);
UPDATE users SET name = full_name;
ALTER TABLE users ALTER COLUMN name SET NOT NULL;
```

# Constraints

- 🚫 TUYỆT ĐỐI KHÔNG chạy DROP TABLE/COLUMN trên production mà không hỏi backup
- 🚫 TUYỆT ĐỐI KHÔNG dùng RENAME COLUMN trên production — dùng phương pháp 3 bước
- 🚫 KHÔNG tạo migration chỉ có UP mà không có DOWN
- ⚠️ Mọi migration PHẢI đặt tên theo format: `YYYYMMDDHHMMSS_mô_tả.sql`
- ⚠️ Boolean PHẢI bắt đầu bằng `is_` hoặc `has_`
- ⚠️ Timestamp PHẢI kết thúc bằng `_at` và dùng TIMESTAMPTZ
- ⚠️ Foreign key PHẢI có index và kết thúc bằng `_id`
- ✅ LUÔN LUÔN thêm `created_at` và `updated_at` cho mọi bảng mới
- ✅ LUÔN LUÔN thêm CHECK constraint cho enum-like columns
- ✅ LUÔN LUÔN tạo index cho foreign keys và cột hay query

```

---

## Tài nguyên bổ sung được sinh

### `resources/migration_template.sql`

```sql
-- Migration: YYYYMMDDHHMMSS_mô_tả_ngắn.sql
-- Tác giả: [Tên]
-- Mô tả: [Mô tả thay đổi]
-- Loại: [Schema / Data / Seed]

-- ============ UP (Apply) ============


-- ============ DOWN (Rollback) ============

```

### `resources/naming_conventions.md`

```markdown
# Naming Conventions — Database

| Loại | Quy tắc | Ví dụ |
|---|---|---|
| Tên bảng | snake_case, số nhiều | `users`, `order_items` |
| Tên cột | snake_case | `first_name`, `phone_number` |
| Boolean | Prefix `is_` hoặc `has_` | `is_active`, `has_verified` |
| Timestamp | Suffix `_at` | `created_at`, `deleted_at` |
| Foreign key | Suffix `_id` | `user_id`, `category_id` |
| Index | `idx_<table>_<column>` | `idx_users_email` |
| Primary key | `id` (UUID hoặc BIGSERIAL) | `id UUID PRIMARY KEY` |
```

---

## Phân tích quá trình chuyển đổi

| Yếu tố tài liệu | Phần trong SKILL.md |
|---|---|
| Quy trình 6 bước | Instructions (Bước 1-4) |
| Nguyên tắc "KHÔNG xóa bảng" | Bước 0: Safety Check + Constraints |
| Format tên file `YYYYMMDDHHMMSS` | Instructions Bước 2.1 + Constraints |
| Quy tắc đặt tên cột | Constraints (snake_case, is_, _at,_id) |
| "Phải có UP và DOWN" | Constraints + Template |
| "Rename an toàn" | Example 3 (3-step migration) |
| 3 loại migration | Instructions Bước 1.2 |
| "Test trên local trước" | Instructions Bước 4.4 |

### Độ phức tạp: ⭐⭐⭐⭐ (4/5)

- Ví dụ này tạo ra skill có **Safety Check** (Pattern 4)
- Có **multi-resource** (Pattern 2): template, naming conventions, dangerous operations
- Có **scripts** (Pattern 1): generate_migration.py
- Tổng: 1 SKILL.md + 4 resources + 3 examples + 1 script = **9 files**
