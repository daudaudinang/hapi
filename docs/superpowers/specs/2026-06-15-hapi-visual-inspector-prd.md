# HAPI Visual Inspector PRD

**Status:** Draft for review  
**Date:** 2026-06-15  
**Owner:** HAPI  
**Feature area:** Web/PWA, CLI browser control, debugging workflow, agent collaboration

---

## 1. Tóm tắt

HAPI cần một **Visual Inspector** để user chỉ điểm lỗi web bằng mắt và gửi ngữ cảnh debug chính xác cho agent. Feature này không thay thế Playwright, Chrome DevTools, hay HTML Preview skill. Giá trị chính là kết nối ba thứ HAPI đã có: phiên agent, web/PWA remote control, và CLI chạy local cùng workspace.

MVP dùng **screenshot-based browser panel** trong HAPI. User mở một URL local, xem ảnh chụp mới nhất của browser thật, bật Inspect mode để tap/click vùng lỗi, hoặc bật Control mode tối thiểu để click/scroll/reload app thật. HAPI gom element context, screenshot crop, console errors, failed network requests, URL, viewport, và gửi thành **Debug Card** vào session chat cho agent xử lý.

Quyết định MVP:

- Dùng screenshot/latest-view, chưa nhúng app thật bằng iframe.
- Có Inspect mode ngay từ đầu.
- Có Control mode tối thiểu: reload, click, scroll.
- Chưa làm DevTools đầy đủ, CSS editor, breakpoint debugger, performance profiler sâu.
- Playwright/Chrome DevTools Protocol có thể là engine bên dưới, nhưng sản phẩm là user-first debug workflow trong HAPI.

---

## 2. Vấn đề cần giải quyết

Khi user thấy lỗi giao diện hoặc lỗi tương tác trong web app, feedback thường mơ hồ:

- “Nút này lệch.”
- “Bấm vào đây không chạy.”
- “Mobile bị vỡ layout.”
- “Có lỗi gì đó sau khi submit form.”

Agent có thể dùng Playwright để tự kiểm tra, nhưng agent thường không biết chính xác user đang nhìn chỗ nào hoặc kỳ vọng gì. User cũng không muốn viết selector, mô tả DOM, copy console log, hay mở Chrome DevTools trên điện thoại.

HAPI cần biến thao tác rất tự nhiên của user:

```text
Nhìn thấy lỗi → tap/click đúng chỗ → ghi chú ngắn
```

thành một gói debug đủ kỹ thuật để agent sửa đúng nguyên nhân.

---

## 3. Mục tiêu

### 3.1 Mục tiêu sản phẩm

1. Cho phép user mở và xem app web đang chạy local thông qua HAPI.
2. Cho phép user chỉ điểm element/vùng lỗi bằng tap/click trên ảnh chụp.
3. Tạo Debug Card có đủ ngữ cảnh để agent sửa lỗi mà không cần user mô tả kỹ thuật.
4. Cho phép user điều khiển app thật ở mức tối thiểu: reload, click, scroll.
5. Làm tốt trên mobile/PWA vì đây là lợi thế tự nhiên của HAPI.
6. Lưu debug evidence trong session chat để user và agent cùng review được.

### 3.2 Mục tiêu kỹ thuật

1. Không clone Chrome DevTools.
2. Không phụ thuộc vào framework frontend cụ thể.
3. Không yêu cầu dev app hỗ trợ iframe hoặc thay đổi code.
4. Tận dụng CLI local để điều khiển browser cùng máy với dev server.
5. Che dữ liệu nhạy cảm trong console/network trước khi gửi lên Hub/Web.
6. Giữ kết nối browser có thể reconnect khi tab/browser/dev server bị restart.

---

## 4. Không làm trong MVP

1. Không làm live streaming video liên tục.
2. Không nhúng app thật bằng iframe làm mặc định.
3. Không làm full Chrome DevTools panel.
4. Không làm CSS editor trực tiếp trên HAPI.
5. Không làm JavaScript breakpoint debugger.
6. Không làm performance profiler sâu.
7. Không tự động sửa code chỉ vì user click inspect; agent vẫn cần phân tích và sửa trong session.
8. Không public share preview link ngoài HAPI auth.

---

## 5. Người dùng chính

### 5.1 Developer dùng HAPI từ máy khác hoặc điện thoại

Muốn nhìn app, chỉ lỗi, và để agent sửa khi đang AFK hoặc không muốn mở laptop.

### 5.2 PM/designer kỹ thuật nhẹ

Muốn comment vào vùng UI sai mà không cần biết selector, DOM, network tab.

### 5.3 Agent trong HAPI session

Cần nhận bằng chứng debug rõ ràng:

- user chỉ chỗ nào;
- element thật là gì;
- lỗi console/network nào xảy ra gần đó;
- ảnh trước/sau action;
- viewport và route tại thời điểm lỗi.

---

## 6. Khái niệm cốt lõi

### 6.1 Visual Inspector

Một panel/drawer trong session HAPI dùng để xem và tương tác với browser local qua ảnh chụp mới nhất.

Trên desktop, panel có thể nằm cạnh chat hoặc mở dạng drawer lớn. Trên mobile, panel nên mở gần full-screen.

### 6.2 Browser Target

Một tab/browser do CLI quản lý để mở URL cần debug.

Ví dụ:

- `http://localhost:5173`
- `http://localhost:3000/dashboard`
- URL staging nếu user chỉ định

### 6.3 Latest View

Ảnh screenshot mới nhất của Browser Target, kèm metadata:

- URL hiện tại;
- title;
- viewport;
- device scale factor;
- timestamp;
- scroll position nếu có;
- kích thước ảnh gốc.

Latest View không phải video stream. Nó được cập nhật khi user reload, click, scroll, hoặc bấm refresh capture.

### 6.4 Inspect Mode

Mode chỉ dùng để chỉ điểm lỗi. Tap/click trên screenshot không click thật vào app.

HAPI quy đổi tọa độ ảnh sang tọa độ viewport thật, hỏi browser element tại điểm đó, rồi mở form comment ngắn cho user.

### 6.5 Control Mode

Mode điều khiển app thật tối thiểu. Tap/click trên screenshot sẽ gửi action xuống CLI để click vào browser local thật. Scroll/reload cũng tác động lên browser thật. Sau mỗi action, HAPI chụp lại Latest View.

### 6.6 Debug Card

Một message có cấu trúc được gửi vào session chat, chứa feedback của user và evidence kỹ thuật.

Debug Card là sản phẩm chính của MVP.

---

## 7. Luồng chính

### 7.1 Mở Visual Inspector

```text
User ở session HAPI
→ bấm Open Visual Inspector
→ nhập/chọn URL
→ Hub RPC xuống CLI
→ CLI mở browser local
→ CLI chụp screenshot
→ Web hiển thị Latest View
```

### 7.2 Inspect lỗi bằng mắt

```text
User bật Inspect mode
→ tap/click vùng lỗi trên screenshot
→ Web gửi tọa độ ảnh lên Hub
→ Hub RPC xuống CLI
→ CLI map tọa độ sang viewport thật
→ CLI lấy element context tại điểm đó
→ HAPI mở form comment
→ user nhập ghi chú
→ HAPI tạo Debug Card gửi vào session chat
```

### 7.3 Control tối thiểu

```text
User bật Control mode
→ tap/click trên screenshot
→ Web gửi click action lên Hub
→ Hub RPC xuống CLI
→ CLI click vào browser thật
→ CLI thu console/network mới phát sinh
→ CLI chụp screenshot mới
→ Web cập nhật Latest View
```

### 7.4 Agent xử lý Debug Card

```text
Agent đọc Debug Card
→ xác định file/source có khả năng liên quan
→ sửa code
→ chạy test/lint/build hoặc kiểm chứng phù hợp
→ user mở lại Visual Inspector
→ reload/capture lại để review
```

---

## 8. Giao diện MVP

### 8.1 Entry point

Trong session header hoặc menu:

```text
Open Visual Inspector
```

Nếu session có workspace path và HAPI phát hiện dev server, có thể gợi ý URL. Nếu không, user nhập URL thủ công.

### 8.2 Layout desktop

```text
┌────────────────────────────────────────────────────┐
│ URL: http://localhost:5173/settings  [Reload]      │
│ Mode: [Inspect] [Control] [Refresh Capture]        │
├────────────────────────────────────────────────────┤
│                                                    │
│                Latest View Screenshot              │
│                                                    │
├────────────────────────────────────────────────────┤
│ Console: 2 errors    Network: 1 failed    Mobile   │
└────────────────────────────────────────────────────┘
```

### 8.3 Layout mobile

Mobile dùng full-screen drawer:

- top bar: URL rút gọn, reload, close;
- mode switch rõ ràng;
- ảnh screenshot fit chiều ngang;
- bottom sheet khi inspect element;
- status chips: console errors, failed network, viewport.

### 8.4 Inspect bottom sheet

Khi user tap element trong Inspect mode:

```text
Element: button "Save"
Selector: button[data-testid="save-settings"]
Vùng: 128x40 tại x=212,y=604

Bạn muốn báo gì với agent?
[ textarea ]

[Send Debug Card] [Cancel]
```

Không cần hiển thị quá nhiều kỹ thuật mặc định. Chi tiết kỹ thuật có thể collapse.

---

## 9. Debug Card

Debug Card cần đủ cho agent sửa lỗi, nhưng không làm user bị ngợp.

### 9.1 Nội dung user thấy

```text
User reported a UI issue
Comment: "Nút Save không bấm được trên mobile"
URL: /settings
Element: button "Save"
Viewport: 390x844
Console: 1 error
Network: PATCH /api/settings 500
```

### 9.2 Nội dung kỹ thuật agent nhận

```ts
type VisualInspectorDebugCard = {
    id: string
    sessionId: string
    browserTargetId: string
    createdAt: number
    mode: 'inspect' | 'control'
    userComment: string
    page: {
        url: string
        title: string
        viewport: {
            width: number
            height: number
            deviceScaleFactor: number
            isMobile: boolean
        }
        scroll: {
            x: number
            y: number
        }
    }
    target: {
        point: { x: number; y: number }
        selector: string | null
        text: string | null
        tagName: string | null
        role: string | null
        testId: string | null
        boundingBox: {
            x: number
            y: number
            width: number
            height: number
        } | null
        outerHtmlExcerpt: string | null
        computedStyle: Record<string, string>
    }
    evidence: {
        screenshotId: string
        cropScreenshotId: string | null
        console: BrowserConsoleEntry[]
        network: BrowserNetworkEntry[]
    }
}
```

### 9.3 Evidence nên thu trong MVP

- Screenshot toàn trang nhìn thấy.
- Crop quanh element nếu có target.
- `console.error` và `console.warn` gần thời điểm action/inspect.
- Failed network requests hoặc status `>= 400` gần thời điểm action/inspect.
- Basic request info: method, URL đã mask query nhạy cảm, status, timing.
- Response body chỉ lưu preview ngắn và phải mask dữ liệu nhạy cảm.

---

## 10. Kiến trúc hệ thống

Luồng tổng thể:

```text
HAPI Web/PWA
→ Hub REST/RPC
→ CLI Browser Debug Bridge
→ Local Browser qua CDP/Playwright
→ screenshot/DOM/log/network
→ Hub
→ Web + Session Chat
```

### 10.1 Web

Web chịu trách nhiệm:

- render Visual Inspector panel;
- hiển thị Latest View;
- chuyển đổi tọa độ click trên ảnh sang tọa độ ảnh gốc;
- gửi inspect/control action;
- hiển thị status console/network;
- tạo comment form;
- hiển thị Debug Card trong chat.

### 10.2 Hub

Hub chịu trách nhiệm:

- xác thực request;
- kiểm tra namespace/session/machine;
- route RPC xuống CLI đúng máy;
- lưu metadata Debug Card/message;
- phát SSE update cho web;
- không trực tiếp điều khiển browser.

### 10.3 CLI

CLI chịu trách nhiệm:

- mở/attach browser;
- quản lý Browser Target;
- chụp screenshot;
- map tọa độ sang element;
- thực hiện click/scroll/reload;
- đọc console/network;
- mask dữ liệu nhạy cảm trước khi gửi lên Hub;
- reconnect khi browser/tab stale.

### 10.4 Browser Engine

Engine bên dưới có thể là Playwright hoặc Chrome DevTools Protocol. PRD không bắt buộc chọn engine cuối cùng, nhưng API nội bộ nên che chi tiết engine để sau này đổi được.

---

## 11. API/RPC dự kiến

Tên chỉ là đề xuất, implementation có thể đổi nhưng cần giữ intent.

```ts
type BrowserTarget = {
    id: string
    sessionId: string
    machineId: string
    url: string
    title: string | null
    status: 'starting' | 'ready' | 'stale' | 'closed' | 'error'
    createdAt: number
    updatedAt: number
}
```

RPC từ Hub xuống CLI:

```ts
browser.openTarget({ sessionId, url, viewport? })
browser.capture({ targetId })
browser.inspectAt({ targetId, point })
browser.controlClick({ targetId, point })
browser.controlScroll({ targetId, deltaX, deltaY })
browser.reload({ targetId })
browser.closeTarget({ targetId })
```

HTTP/API từ Web lên Hub:

```text
POST /api/sessions/:id/browser-targets
GET  /api/sessions/:id/browser-targets
POST /api/sessions/:id/browser-targets/:targetId/capture
POST /api/sessions/:id/browser-targets/:targetId/inspect
POST /api/sessions/:id/browser-targets/:targetId/control
POST /api/sessions/:id/debug-cards
```

---

## 12. Bảo mật và quyền riêng tư

Visual Inspector chạm vào browser và network payload, nên MVP phải xử lý như tính năng nhạy cảm.

Yêu cầu:

1. Mọi request phải scoped theo namespace, session, machine.
2. Web client không được tự chọn máy hoặc tab ngoài session scope.
3. Không expose cookie, authorization header, token, password, secret.
4. Mask các header nhạy cảm: `authorization`, `cookie`, `set-cookie`, `x-api-key`.
5. Mask field nhạy cảm trong body/query: `token`, `password`, `secret`, `key`, `authorization`, `session`.
6. Control mode phải có UI mode rõ ràng để tránh click nhầm.
7. Không public URL preview/debug khi chưa có auth.
8. Debug Card nên lưu evidence vừa đủ, không lưu toàn bộ response body dài.

---

## 13. Rủi ro và cách giảm

| Rủi ro | Mức | Cách giảm |
|---|---:|---|
| Tính năng bị phình thành clone DevTools | Cao | MVP chỉ screenshot, inspect, reload/click/scroll, console/network lỗi |
| Lộ token/cookie trong network evidence | Cao | Mask ở CLI trước khi gửi Hub |
| Click nhầm gây thay đổi state app | Trung bình | Tách Inspect mode và Control mode, Control có trạng thái UI nổi bật |
| Mapping tọa độ sai do scale/scroll/device pixel ratio | Trung bình | Lưu metadata ảnh gốc, viewport, scale; test mobile/desktop |
| Browser/tab bị stale | Trung bình | Target status, reconnect, nút reopen/reload rõ ràng |
| App local không truy cập được từ phone | Thấp | Browser chạy trên CLI machine; phone chỉ xem screenshot qua HAPI |
| User kỳ vọng live browser mượt như remote desktop | Trung bình | Truyền thông rõ “latest view”, không phải video stream |

---

## 14. Kiểm chứng tối thiểu

### 14.1 Tình huống 1: Inspect element lệch UI

Cho trước app đang chạy ở `localhost:5173` và HAPI mở Visual Inspector. Khi user bật Inspect mode và tap vào một button trên screenshot, HAPI phải tạo Debug Card có selector/text/bounding box và screenshot crop.

Nếu không test tình huống này, MVP không chứng minh được giá trị user-first.

### 14.2 Tình huống 2: Control click tạo network lỗi

Cho trước một button submit gọi API trả `500`. Khi user bật Control mode và click button trên screenshot, HAPI phải click browser thật, bắt failed request, chụp screenshot mới, và đưa lỗi network vào Debug Card hoặc activity log.

Nếu không test tình huống này, Control mode có thể chỉ là click mù không hỗ trợ debug.

### 14.3 Tình huống 3: Mobile viewport

Cho trước viewport mobile 390x844. Khi user tap trên screenshot đã bị scale để fit màn hình điện thoại, HAPI phải map đúng tọa độ về element thật.

Nếu không test tình huống này, feature mất lợi thế chính là dùng tốt trên PWA/mobile.

### 14.4 Tình huống 4: Mask dữ liệu nhạy cảm

Cho trước request có `Authorization` header và query/body chứa `token`. Khi HAPI thu network evidence, Debug Card không được chứa giá trị thật.

Nếu không test tình huống này, rủi ro bảo mật quá cao để bật mặc định.

---

## 15. Phạm vi không thay đổi

Dự kiến không thay đổi trong MVP:

- Không thay đổi chat/session flow hiện có ngoài việc thêm Debug Card message.
- Không thay đổi file browser/editor hiện có.
- Không thay đổi permission mode của agent.
- Không yêu cầu dev app sửa code để được inspect.
- Không thay thế Playwright skill hoặc HTML Preview skill.
- Không thay đổi cách HAPI chạy dev server; user hoặc agent vẫn tự start dev server như hiện tại.

Chưa xác nhận cho implementation:

- Engine cuối cùng dùng Playwright, CDP trực tiếp, hay wrapper hỗn hợp.
- Evidence screenshot lưu trong DB, filesystem HAPI_HOME, hay artifact store nội bộ.
- UI cuối cùng là route riêng hay drawer trong session route.

---

## 16. Roadmap đề xuất

### Phase 1 — MVP: Visual Inspector cơ bản

- Open URL.
- Capture latest screenshot.
- Inspect mode: tap/click → element context → comment → Debug Card.
- Control mode tối thiểu: reload, click, scroll.
- Console errors và failed network requests.
- Mask dữ liệu nhạy cảm.

### Phase 2 — Review loop tốt hơn

- Capture before/after theo từng action.
- Gắn Debug Card với file/diff agent sửa.
- User mark resolved/unresolved.
- Lịch sử debug cards theo session.
- Auto-suggest URL từ dev server đang chạy.

### Phase 3 — Tương tác sâu hơn

- Fill input qua action sheet.
- Multi-step action recording.
- Basic accessibility snapshot.
- So sánh screenshot trước/sau.
- Optional live refresh interval.

### Phase 4 — DevTools nâng cao có chọn lọc

- Performance summary nhẹ.
- CSS computed diff hữu ích cho layout bug.
- Source map hints nếu app hỗ trợ.
- Không làm full breakpoint debugger trừ khi có nhu cầu rõ.

---

## 17. Tiêu chí thành công

MVP được coi là thành công nếu:

1. User trên mobile có thể mở app local qua HAPI mà không cần app đó public ra internet.
2. User có thể tap vào vùng lỗi và gửi feedback trong dưới 10 giây.
3. Agent nhận Debug Card đủ thông tin để biết element, route, viewport, và lỗi runtime/network liên quan.
4. Control click/reload/scroll hoạt động ổn định với screenshot cập nhật sau action.
5. Không lộ token/cookie/password trong Debug Card.
6. Feature không làm session chat, terminal, file browser hiện có bị ảnh hưởng khi không dùng Visual Inspector.

---

## 18. Kết luận

HAPI Visual Inspector nên là năng lực core vì nó tận dụng đúng lợi thế của HAPI: local-first agent, web/PWA remote control, session context, và workflow user-agent cộng tác. Điểm khác Playwright không nằm ở engine điều khiển browser, mà ở trải nghiệm user-first: user nhìn thấy lỗi, tap đúng chỗ, HAPI tự đóng gói evidence kỹ thuật cho agent.

MVP nên đi theo hướng screenshot-based latest view để tránh rủi ro iframe/live browser, đồng thời vẫn có Control mode tối thiểu đủ dùng cho debug tương tác.
