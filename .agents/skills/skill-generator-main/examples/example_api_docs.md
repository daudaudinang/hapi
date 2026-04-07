# Ví dụ: Tài liệu API Documentation Standards → Skill `api-docs-generator`

## Tài liệu đầu vào (input của user)

> **Tiêu chuẩn tài liệu API của team:**
>
> Mỗi endpoint API phải có đầy đủ:
>
> 1. HTTP Method + Path
> 2. Mô tả chức năng
> 3. Authentication requirements
> 4. Request headers
> 5. Request body (với type cho từng field)
> 6. Success response (code + body)
> 7. Error responses (tất cả error codes có thể)
> 8. Ít nhất 1 example request với cURL
> 9. Ít nhất 1 example response
>
> Format theo chuẩn OpenAPI 3.0. File đặt tại `docs/api/<module>.md`.
> Sắp xếp endpoint theo nhóm chức năng (Auth, Users, Products...).

---

## Skill được sinh ra (output)

### Cấu trúc thư mục

```
skills/api-docs-generator/
├── SKILL.md
└── resources/
    └── endpoint_template.md
```

### Nội dung SKILL.md

```markdown
---
name: api-docs-generator
description: Sinh tài liệu API tự động từ mã nguồn hoặc mô tả endpoint. Tạo tài liệu theo chuẩn OpenAPI 3.0 với ví dụ request/response đầy đủ. Kích hoạt khi user yêu cầu "tạo API docs", "document endpoints", hoặc "viết tài liệu API".
---

# Goal
Tự động sinh tài liệu API hoàn chỉnh, chuẩn OpenAPI 3.0, cho mọi endpoint trong dự án.

# Instructions
1. Scan các file API route trong dự án (VD: `app/api/`, `pages/api/`, `routes/`).
2. Với mỗi endpoint, trích xuất thông tin:
   - HTTP Method (GET/POST/PUT/DELETE/PATCH)
   - Path và path parameters
   - Request headers (đặc biệt là Authorization)
   - Request body schema
   - Response schema (success + error)
3. Nhóm endpoints theo module chức năng (Auth, Users, Products...).
4. Sinh tài liệu theo template `resources/endpoint_template.md`.
5. Thêm ít nhất 1 cURL example và 1 response example cho mỗi endpoint.
6. Lưu file tại `docs/api/<tên-module>.md`.

# Examples

## Ví dụ 1: Endpoint đăng ký
**Input:** File `app/api/auth/register/route.ts` chứa POST handler nhận name, email, password.

**Output:**
### POST /api/auth/register
- **Description:** Đăng ký tài khoản mới
- **Auth:** Không yêu cầu
- **Request Body:**
  | Field | Type | Required | Description |
  |---|---|---|---|
  | name | string | ✅ | Tên hiển thị |
  | email | string | ✅ | Email đăng nhập |
  | password | string | ✅ | Mật khẩu (≥8 ký tự) |
- **Success (201):**
  ```json
  { "id": "uuid-1234", "email": "user@example.com", "name": "Nguyen Van A" }
  ```

- **Error (400):** `{ "error": "Email already exists" }`
- **Error (422):** `{ "error": "Password must be at least 8 characters" }`
- **cURL:**

  ```bash
  curl -X POST https://api.example.com/api/auth/register \
    -H "Content-Type: application/json" \
    -d '{"name":"Test","email":"test@example.com","password":"12345678"}'
  ```

## Ví dụ 2: Endpoint lấy danh sách

**Input:** File `app/api/users/route.ts` chứa GET handler với pagination.

**Output:**

### GET /api/users

- **Description:** Lấy danh sách người dùng (phân trang)
- **Auth:** Required (Bearer Token, Role: Admin)
- **Query Params:**

  | Param | Type | Default | Description |
  |---|---|---|---|
  | page | number | 1 | Trang hiện tại |
  | limit | number | 10 | Số lượng mỗi trang |

- **Success (200):**

  ```json
  { "users": [...], "total": 150, "page": 1, "totalPages": 15 }
  ```

- **Error (401):** `{ "error": "Unauthorized" }`
- **Error (403):** `{ "error": "Forbidden - Admin only" }`

# Constraints

- KHÔNG ĐƯỢC bỏ qua error codes — phải liệt kê TẤT CẢ error có thể xảy ra
- KHÔNG ĐƯỢC tạo endpoint doc mà không có ví dụ cURL
- KHÔNG ĐƯỢC bỏ qua Authentication requirements
- LUÔN LUÔN nhóm endpoints theo module
- LUÔN LUÔN ghi rõ type và required cho mỗi field

```

---

## Phân tích quá trình chuyển đổi

| Yếu tố tài liệu | Phần trong SKILL.md |
|---|---|
| 9 tiêu chí bắt buộc | Instructions bước 2-5 |
| Format OpenAPI 3.0 | Description + Instructions |
| Đường dẫn file `docs/api/` | Instructions bước 6 |
| Nhóm theo chức năng | Instructions bước 3 |
| "Ít nhất 1 example" | Constraints + Examples |
