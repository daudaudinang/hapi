# Dynamic Claude Model Discovery Design

**Ngày:** 2026-07-21  
**Trạng thái:** Chờ user duyệt đặc tả  
**Mục tiêu:** HAPI hiển thị danh sách model Claude theo Anthropic-compatible provider đang hoạt động, tương tự luồng Codex, nhưng giữ fallback an toàn khi provider không hỗ trợ khám phá model.

## 1. Quyết định đã chốt

- Hỗ trợ tải động cho gateway dùng `ANTHROPIC_BASE_URL` và Anthropic trực tiếp khi có `ANTHROPIC_API_KEY`.
- Credential chỉ được dùng trong tiến trình CLI trên máy người dùng; Hub và Web chỉ nhận metadata model đã làm sạch.
- OAuth/claude.ai subscription và các provider cloud như Bedrock, Vertex, Foundry chưa có cơ chế chung trong phạm vi này; tiếp tục dùng preset hiện tại.
- Khi khám phá thất bại, không chặn tạo hoặc sử dụng phiên Claude; giao diện dùng danh sách mặc định và hiển thị cảnh báo nhẹ.

## 2. Các phương án đã cân nhắc

### A. CLI HAPI gọi trực tiếp Models API — chọn

CLI xác định endpoint và credential từ môi trường đang chạy, gọi `GET /v1/models`, chuẩn hóa kết quả rồi trả qua RPC hiện có.

- Ưu: hoạt động độc lập với phiên bản Claude Code; cùng ranh giới bảo mật với Codex; dễ kiểm thử; dùng được ở màn tạo phiên trước khi Claude khởi động.
- Nhược: HAPI phải duy trì logic request tương thích gateway.

### B. Đọc cache nội bộ của Claude Code

Đọc `~/.claude/cache/gateway-models.json` do Claude Code tạo.

- Ưu: không tự xử lý credential hoặc request.
- Nhược: yêu cầu Claude Code `2.1.129+`, cần bật discovery, cache có thể cũ/chưa tồn tại, và định dạng file nội bộ không phải contract ổn định.

### C. Chỉ cho cấu hình preset thủ công

Giữ danh sách tĩnh nhưng cho người dùng thêm model trong HAPI config.

- Ưu: đơn giản.
- Nhược: không đạt mục tiêu cập nhật theo provider; vẫn cần bảo trì thủ công.

## 3. Luồng hệ thống

### Màn tạo phiên

```text
Web chọn machine + Claude
→ Hub gọi RPC listClaudeModels trên machine
→ CLI phát hiện provider hỗ trợ
→ CLI gọi GET /v1/models?limit=1000
→ CLI trả danh sách { id, displayName }
→ Web ghép Default + danh sách động
→ Nếu không hỗ trợ/lỗi: Web dùng preset Claude hiện tại
```

### Phiên đang hoạt động

```text
Web mở cài đặt model
→ Hub gọi RPC listClaudeModels trên session
→ CLI dùng đúng môi trường của session
→ Kết quả được hiển thị và cache vào metadata session
```

Phiên đã dừng chỉ đọc snapshot đã cache. Nếu không có snapshot, dùng preset hiện tại.

## 4. Phát hiện provider

CLI tạo một kết quả nội bộ gồm `supported`, `baseUrl`, `headers` và `source`.

Thứ tự:

1. Nếu có biến `CLAUDE_CODE_USE_*` mang giá trị bật, trả `supported: false`; provider cloud nằm ngoài phạm vi.
2. Nếu có `ANTHROPIC_BASE_URL`, dùng URL đó.
3. Nếu không có base URL nhưng có `ANTHROPIC_API_KEY`, dùng `https://api.anthropic.com`.
4. Nếu không có credential được hỗ trợ, trả `supported: false` và dùng fallback.

Credential:

- `ANTHROPIC_AUTH_TOKEN` → `Authorization: Bearer ...` cho gateway.
- Nếu không có auth token, `ANTHROPIC_API_KEY` → `x-api-key: ...`.
- Luôn gửi `anthropic-version: 2023-06-01`.
- Parse `ANTHROPIC_CUSTOM_HEADERS` theo từng dòng `Name: Value`; header credential do HAPI chọn không được phép bị custom header ghi đè.
- Không dùng hoặc gửi `CLAUDE_CODE_OAUTH_TOKEN` trong discovery.

## 5. Giao thức và chuẩn hóa

- Endpoint: `{baseUrl không có dấu / cuối}/v1/models?limit=1000`.
- Timeout: 3 giây.
- Không theo redirect để tránh rò credential sang host khác.
- Chấp nhận `data` là mảng; mỗi phần tử cần `id` không rỗng.
- `displayName` lấy từ `display_name`, sau đó `displayName`, cuối cùng dùng `id`.
- Loại bản ghi sai định dạng và loại ID trùng, giữ thứ tự provider trả về.
- Không tự giới hạn prefix model ở HAPI. Gateway đang hoạt động là nguồn sự thật; việc model có chạy được sẽ do provider xác nhận khi tạo request.
- Response RPC/API chỉ chứa `id`, `displayName`, `source`; tuyệt đối không chứa URL có credential, header hoặc token.

## 6. Giao diện và fallback

- `Default` luôn đứng đầu.
- Khi có kết quả động, hiển thị model động; nếu model hiện tại không nằm trong danh sách, chèn model hiện tại để không làm mất trạng thái phiên.
- Khi provider không hỗ trợ discovery, dùng `CLAUDE_MODEL_PRESETS` hiện tại và không hiện lỗi.
- Khi provider có hỗ trợ nhưng request thất bại, dùng preset và hiện cảnh báo tải model thất bại; người dùng vẫn tạo/gửi phiên được.
- Không polling. Query có cache ngắn tương tự Codex và làm mới khi mở lại màn hình sau thời gian stale.

## 7. Ranh giới module

| Khối | Trách nhiệm |
|---|---|
| `cli/src/modules/common/claudeModels.ts` | Phát hiện provider, tạo request, chuẩn hóa model |
| `cli/src/modules/common/handlers/claudeModels.ts` | RPC `listClaudeModels` và chuyển lỗi thành response an toàn |
| `hub/src/sync/rpcGateway.ts`, `syncEngine.ts` | Chuyển RPC machine/session và cache snapshot |
| `hub/src/web/routes/machines.ts`, `sessions.ts` | REST endpoint cho Web |
| `shared/src/schemas.ts` | Schema metadata cache Claude |
| `web/src/hooks/queries/useClaudeModels.ts` | Query machine/session, trạng thái dynamic/fallback/error |
| `web/src/components/NewSession/*` | Danh sách model khi tạo phiên |
| `web/src/components/SessionChat.tsx`, `TeamChatRightPanel.tsx` | Danh sách model trong phiên |

## 8. Kiểm thử tối thiểu

1. **Gateway bearer token:** base URL và auth token hợp lệ → gọi đúng endpoint/header, trả model động, không lộ token trong response.
2. **Anthropic API key:** không có base URL nhưng có API key → gọi `api.anthropic.com/v1/models` bằng `x-api-key`.
3. **Fallback an toàn:** OAuth-only, cloud provider, HTTP lỗi, timeout, redirect hoặc payload sai → không chặn sử dụng Claude; trả trạng thái để Web dùng preset.
4. **Chuẩn hóa:** bỏ record sai, loại ID trùng, giữ display name và thứ tự.
5. **Luồng Web:** model động xuất hiện; lỗi discovery vẫn hiển thị preset và form không bị disable.
6. **Bảo mật:** Hub/Web response và log không chứa credential hoặc custom header value.

Tất cả logic mới đi theo TDD: test thất bại trước, implementation tối thiểu sau.

## 9. Phạm vi dự kiến không thay đổi

- Không thay đổi cách Claude thực thi request hoặc đổi model giữa các lượt.
- Không thay đổi auth/login Claude.
- Không thêm hỗ trợ discovery riêng cho Bedrock, Vertex, Foundry hoặc Claude Platform on AWS.
- Không thay đổi dynamic discovery của Codex/OpenCode.
- Không yêu cầu nâng phiên bản Claude Code tối thiểu vì HAPI tự gọi Models API.

## 10. Khôi phục

Thay đổi chỉ bổ sung đường đọc metadata. Có thể rollback toàn bộ code và endpoint mới mà không migration dữ liệu. Cache metadata là tùy chọn; bản cũ bỏ qua trường không biết. Nếu dynamic discovery gây sự cố, fallback preset vẫn giữ luồng tạo và sử dụng phiên Claude.

## 11. Nguồn tham chiếu

- Claude Code gateway model discovery: <https://code.claude.com/docs/en/llm-gateway-protocol#model-discovery>
- Anthropic Models API: <https://platform.claude.com/docs/en/api/models/list>
