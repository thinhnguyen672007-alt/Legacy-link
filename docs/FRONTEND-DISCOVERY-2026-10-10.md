# Đề xuất frontend Legacy-link — 10/10/2026

Cập nhật sau duyệt ngày 10/10/2026: người dùng yêu cầu nhánh `feature/frontend`, triển khai theo đề xuất A và demo trên máy backend bằng Docker Compose sau khoảng 10 ngày (dự kiến 20/10). Bản P0 đã triển khai; xem [báo cáo kiểm thử](../frontend/docs/ACCEPTANCE.md). Các mục khảo sát bên dưới giữ bối cảnh lúc discovery; trạng thái hiện hành nằm trong báo cáo nghiệm thu.

## 1. Hiểu dự án và trạng thái Git

- Repo thực tế: `/home/nezine/Code/Legacy-link`, remote `https://github.com/thinhnguyen672007-alt/Legacy-link`.
- Đã fetch GitHub. `origin/main`: `fb68875`; `origin/feature/backend-base`: `d91b0db`. Cây `backend/` của hai ref giống nhau.
- Nhánh khảo sát ban đầu `codex/frontend-design`, từ `origin/main`; đã tạo nhánh triển khai `feature/frontend` theo yêu cầu người dùng, cùng worktree `/home/nezine/.codex/worktrees/frontend-design/Legacy-link`.
- Checkout ban đầu ở `feature/firmware-base`, commit `276d8ee`, có sửa đổi chưa commit tại `firmware/legacy-link-core/.vscode/extensions.json`; giữ nguyên.
- Không tìm thấy AGENTS.md trong checkout mới qua danh sách file repo; áp dụng hướng dẫn tiếng Việt do người dùng cung cấp.
- `frontend/` đã được xóa khỏi nhánh backend và main bởi commit `0a24a93` (14/09/2026). Không cần tạo commit xóa lần nữa. Thư mục trong checkout cũ chỉ còn `dist/` và `node_modules/` bị Git bỏ qua; chúng không phải source trong nhánh backend.
- Chưa push, tạo PR hoặc merge.

Người dùng ưu tiên: người vận hành cần biết thiết bị nào còn liên lạc, số đo nào còn mới và cảnh báo nào cần xem; kỹ thuật viên cần đọc thử và áp dụng cấu hình có bằng chứng. Người quản lý dùng cùng dữ liệu tổng quan, chưa có BI/OEE.

Luồng thực tế: Modbus simulator → ESP32 → MQTT → backend → PostgreSQL → HTTP API → frontend cần xây.

Nguồn chính ở `fb68875`: [handoff](FRONTEND-HANDOFF.md), [OpenAPI 0.5.0](../backend/openapi.json), [client mẫu](../backend/examples/frontend-client.js), HTTP handler/security/rate limit, DB read models, control service, Compose/proxy và các báo cáo bên dưới.

[Báo cáo firmware mới nhất](../firmware/legacy-link-core/docs/physical-acceptance-2026-10-10.md) ghi nhận ESP32 thật + CH340 TTL + simulator, backend `0ad8243`, firmware `1c5809d`: số đo, alarm, profile A/B, mất ACK, queue đầy và power cycle đã được kiểm tra với các giới hạn riêng. Không phải CNC/RS-485 thật, chưa có nghiệm thu frontend. Đây là bằng chứng được đọc từ báo cáo, không phải test phần cứng chạy lại trong lượt này. [Báo cáo hạ tầng](../infrastructure/docs/acceptance-2026-10-10.md) là một lần chạy riêng và ghi rõ phiên bản trước hợp nhất.

## 2. Khả năng và gaps

Tất cả đường dẫn source dưới đây thuộc commit khảo sát `fb68875`. “Có code/test” không đồng nghĩa giao diện đã hoạt động end-to-end.

| Tính năng | Bằng chứng | Trạng thái / mức kiểm thử | FE cần làm / gap |
|---|---|---|---|
| Kết nối API | `backend/src/http/security.js`, `rate-limit.js`; bearer token, CORS | Implemented; unit test chạy qua lượt này | Nhập URL + token lúc chạy; token trong bộ nhớ; phân biệt lỗi HTTP/mạng |
| Danh sách, chi tiết máy | GET `/machines`, `/machines/:id`; `backend/src/db/machines.js` | Implemented; báo cáo bench có API trạng thái | Tách gatewayOnline, dataFresh, readHealth, deliveryHealth và kết nối FE→API |
| Lịch sử | GET `/machines/:id/telemetry`; `backend/src/db/dashboard.js`, `http/params.js` | Implemented; dữ liệu đã có trong báo cáo bench; chưa browser test | Cursor, ID chuỗi, tối đa 31 ngày/truy vấn, 500 dòng/trang; chart theo từng metric |
| Cảnh báo, xác nhận | GET `/alarms`, POST `/alarms/:id/ack`; `db/dashboard.js` | Implemented; alarm vật lý đã được báo cáo; thao tác FE ACK chưa nghiệm thu | Bộ lọc, nút “Đã xem”, giữ thời điểm xác nhận từ DB; không nói máy đã an toàn |
| Diagnostics | Trường `Machine.diagnostics`, `validation/diagnostics.js` | Implemented; báo cáo bench có lỗi đọc, queue đầy và phục hồi | Giải thích pending/capacity/rejection, counter theo boot; không biến unknown thành healthy |
| Preview → probe → apply | POST `/config/preview`, `/gateways/:id/probe`, `/gateways/:id/apply`, GET `/operations/:id`; `control/service.js`, `db/profiles.js` | Implemented; control unit test chạy qua; profile A/B đã kiểm tra bằng bench, chưa UI | Form theo profile; snapshot cấu hình; 202 chưa thành công; probe hợp lệ trong 60 giây, đúng boot và đúng config |
| Profile | GET `/profiles`, `/profiles/:id/export`, POST `/profiles/import`; `db/profiles.js` | Implemented; chưa chạy nghiệm thu riêng lượt này | P0 chọn/xuất profile đã có để cấu hình; quản lý/import đầy đủ ở P1 |
| Lịch sử thao tác, hệ thống | GET `/operations`, `/system/metrics`, `/uptime`; `db/operations.js`, `http/server.js` | Implemented; chưa live test lượt này | P0 dùng operation ID và lịch sử để tra kết quả chưa rõ; trang nâng cao ở P1; uptime là consumer |

### Sai khác và quyết định tích hợp

1. **Client mẫu luôn `response.json()`.** `backend/examples/frontend-client.js` sẽ lỗi khi proxy trả HTML hoặc body rỗng. FE cần client riêng trong phạm vi `frontend/`, đọc status/content/body an toàn, giữ status để phân loại lỗi. Không cần sửa backend để làm P0.
2. **Retry-After chưa được expose qua CORS.** `security.js` chỉ đặt Allow-Origin/Methods/Headers. FE khác origin có thể không đọc được header này; dùng backoff có giới hạn. Backend/infra có thể bổ sung `Access-Control-Expose-Headers: Retry-After` sau; không chặn P0 nếu có fallback.
3. **Summary OpenAPI của GET `/operations/{id}` đã cũ:** nói chỉ lưu RAM và hết hạn sau một giờ. `control/client.js` thực tế truyền `operationStore`; `control/service.js` đọc DB khi truy vấn; `db/operations.js` lưu PostgreSQL. Một giờ là phần dọn cache RAM, không thể dùng làm TTL lịch sử chung. Đề nghị chủ backend sửa mô tả; FE đọc trạng thái theo ID và xử lý 404 thực tế.
4. **`deliveryDelayMs` lệch mô tả:** OpenAPI nói có thể âm, `db/dashboard.js` dùng `Math.max(0, receivedAt - timestamp)`. FE hiển thị giá trị API, không dùng số 0 để kết luận đồng hồ chính xác; nếu so thời điểm, ghi rõ là phép so riêng. Đề nghị backend chốt source/hợp đồng.
5. **Không phải mọi thời gian là epoch milliseconds:** `Telemetry.timestamp`, `Alarm.timestamp`, operation startedAt/finishedAt là số; receivedAt, lastMeasurementAt, acknowledgedAt là chuỗi date-time. Types/parser phải theo từng field.
6. **Hai khái niệm online có cửa sổ khác nhau:** danh sách máy dựa heartbeat/LWT + 90 giây; `/gateways` dành cho control yêu cầu trạng thái trong 35 giây và MQTT kết nối. Có thể thấy máy online nhưng chưa đủ điều kiện cấu hình; UI giải thích “Chưa đủ trạng thái mới để cấu hình”.
7. **`applied` chưa đủ chứng minh lưu bền:** kiểm tra `persisted`; `persisted:false` phải báo đã áp dụng nhưng chưa lưu được vào flash. `restoredAfterRestart` là bằng chứng riêng khi backend quan sát boot mới, không tự hứa trước reboot.
8. **Đã chốt Docker Compose trên máy backend.** Node local và Compose có thể khác DB/token. URL mặc định `http://localhost:3000`, origin FE `http://127.0.0.1:5173`. Kiểm tra live cho thấy container API chưa đặt CORS_ORIGINS; vận hành cần cho phép origin này trước nghiệm thu browser. Không cần gửi token vào chat: nhập trực tiếp trong UI lúc chạy.
9. **Không có revision cấu hình theo từng mẫu.** Không tự gán đơn vị/scale mới cho mọi dữ liệu lịch sử sau khi đổi profile; gắn chú thích giới hạn, giữ dữ liệu số gốc và metadata thật sẵn có.

Không có gap source đã thấy buộc sửa backend mới bắt đầu P0. Việc gọi là sẵn sàng demo vẫn cần nghiệm thu FE với API và ESP32 thật.

## 3. Thiết kế khuyến nghị

Đã mở trực tiếp [website DENSO Factory Hacks](https://densohackathon.vn/home) bằng trình duyệt. Ở viewport hẹp đã quan sát: nền xanh tím đậm, xanh lá sáng, vùng chuyển xanh dương/xanh lá, chữ lớn và hình minh họa. Đây là quan sát website cuộc thi, không phải xác minh brand guideline DENSO, font chính thức hay mã màu chuẩn. Chưa xác minh tiêu chí chấm giải từ nguồn BTC; dùng bốn nhóm tiêu chí trong brief như thông tin đội cung cấp.

**Đề xuất A — Sổ vận hành**, hướng khuyến nghị: nền sáng trung tính, bảng thiết bị là nội dung chính, một panel chi tiết liên tục. Hợp người vận hành đọc thường xuyên; tạo liên hệ với cuộc thi bằng xanh chàm ở navigation và một điểm nhấn xanh lá nhỏ trong dấu nhận diện, tách khỏi thông báo thành công. Rủi ro: ít kịch tính ở ảnh chụp đơn; bù bằng luồng dữ liệu và commissioning rõ ràng khi demo.

Hai lựa chọn khác: **B — Nhật ký kỹ thuật**, chia đôi danh sách sự kiện theo thời gian và chi tiết thiết bị, tốt khi điều tra lỗi nhưng khó quét nhiều máy; **C — Phòng giám sát**, nền đậm và vùng trạng thái lớn, hợp trình chiếu xa nhưng phải kiểm tra độ đọc của form/bảng khi dùng lâu. Chỉ chọn một hướng trước triển khai.

Sơ đồ màn hình:

```text
Kết nối API
└─ Thiết bị
   ├─ Chi tiết /machines/:id → Số đo | Lịch sử | Chẩn đoán
   ├─ Cảnh báo /alarms → lọc → xác nhận đã xem
   └─ Cấu hình /commissioning → chọn gateway/profile
      → kiểm tra cấu hình → đọc thử → xem thay đổi → áp dụng → kết quả
P1: Thư viện profile | Lịch sử thao tác đầy đủ | Hệ thống
```

Wireframe đề xuất cho laptop/desktop; giá trị trong ngoặc là vị trí dữ liệu, không phải số live:

```text
LEGACY-LINK          Thiết bị  Cảnh báo  Cấu hình      API: [trạng thái]
Thiết bị                                              [+ Cấu hình thiết bị]
[Tìm theo tên hoặc ID] [Tất cả / Cần chú ý]          Cập nhật: [thời điểm]
─────────────────────────────────────────────────────────────────────────
Thiết bị   Liên lạc   Số đo mới   Đọc thiết bị   Gửi dữ liệu   Lần đo gần nhất
BENCH-01   [API]      [API]       [API]         [API]         [thời gian]
─────────────────────────────────────────────────────────────────────────
BENCH-01 / nguồn: ESP32 đọc simulator        [Số đo] [Lịch sử] [Chẩn đoán]
Nhiệt độ [giá trị + đơn vị catalog]      Thời điểm đo: […] / nhận: […]
[Biểu đồ metric đang chọn; khoảng trống khi thiếu dữ liệu]
Gửi dữ liệu: [pending/capacity] · [thời điểm báo cáo] · [boot ID mở rộng]
[Cảnh báo liên quan]                                   [Xem cấu hình]
```

Desktop 1440px: bảng + panel chi tiết; 1024px: panel xuống dưới hoặc trang chi tiết riêng; 390px: mỗi thiết bị thành hàng xếp dọc có nhãn, chi tiết mở trang, bảng kỹ thuật cuộn trong vùng riêng. URL giữ được thiết bị đang xem. Không poll làm mất focus hoặc nội dung form.

Tokens đề xuất, chưa kiểm tra tương phản trong UI: nền `#F5F6F8`, surface `#FFFFFF`, chữ `#172033`, chữ phụ `#526074`, viền `#D7DEE7`, action/chàm `#3446A8`. Lỗi `#B42318`, cảnh báo `#9A6700`, thành công `#147D64`, chưa biết `#667085`; luôn kèm chữ và icon. Màu nhận diện xanh lá không dùng làm chữ trên nền trắng. Font Be Vietnam Pro cho UI; IBM Plex Mono cho ID/thông số. Cỡ thân 14–16px, tiêu đề 24–28px, nhịp khoảng cách 4/8/12/16/24/32px, hàng bảng 48–56px, nút ít nhất khoảng 40–44px. Font và màu là lựa chọn đề xuất cho Legacy-link.

Hai điểm nhấn phục vụ sản phẩm:

- Dải “gửi dữ liệu” hiển thị số mẫu đang chờ và counter đã được xác nhận theo boot, kèm thời điểm báo cáo. Không diễn hoạt giả từng mẫu hoặc gọi counter là tổng row DB.
- Commissioning theo các bước có kết quả thật; màn cuối tách “Đã áp dụng”, “Đã lưu vào flash”, “Đã quan sát khôi phục sau khởi động lại”.

Skills: đã đọc Impeccable local 4.5.0 (SKILL, shape, init, new-work), chạy context thành công và dùng ưu tiên Operate/scanability, trạng thái và phân cấp nội dung. Đã đọc README, AGENTS, HUONG-DAN, SOURCES, Impeccable vendored và định nghĩa Pro Max/Taste trong [frontend-agent-kit](https://github.com/phamTuan207/frontend-agent-kit) commit `d49b541`. Pro Max/Taste chỉ được đánh giá mức phù hợp, chưa tra thư viện thiết kế; Taste không hợp trọng tâm bảng dữ liệu/form nhiều bước. Chưa dùng GSAP/ThreeUI vì P0 không có nhu cầu tương xứng. Không chạy installer hay thay cấu hình global. Ở thời điểm discovery chưa có design contract; sau duyệt đã ghi [hướng thiết kế](../frontend/docs/surface-brief.md). Không coi việc đọc skill là nghiệm thu UI.

## 4. Kế hoạch thực hiện và kiểm thử

Stack đề xuất: React + TypeScript + Vite cho app riêng `frontend/`; TanStack Query quản lý request/cache; React Router cho URL; Lucide cho icon; một bộ primitive Radix nhất quán cho dialog/tab/select, CSS tokens riêng; chart dùng một thư viện phù hợp biểu đồ đường, chốt dependency khi triển khai. Không cần SSR, auth server hoặc framework nội bộ.

- **P0:** client an toàn + nhập token → danh sách/chi tiết/lịch sử → alarm/diagnostics → chọn profile/config form + preview/probe/apply → nghiệm thu và chỉnh giao diện.
- **P1:** quản lý/import/export profile đầy đủ, lịch sử nâng cao, hệ thống, so sánh config sâu.
- **P2:** hiệu ứng bổ sung sau P0. Không đưa OEE, ROI, AI dự đoán, RBAC hay 3D vào phạm vi hiện tại.

Cấu trúc dự kiến: `frontend/src/api`, `queries`, `pages`, `components`, `styles`, `test`; README, `.env.example` chỉ chứa base URL và các tài liệu trong `frontend/docs`. Không cần sửa root manifest/CI/deploy cho P0 local. Nếu cần CI hoặc service Compose, đề xuất riêng `.github/workflows/frontend.yml` và cấu hình deploy trước khi sửa ngoài phạm vi.

Polling: machines mỗi 5 giây, chi tiết 3–5 giây; operation đang chờ 2 giây và dừng khi terminal. Không poll lịch sử toàn đội máy. Dừng khi tab ẩn, tránh chồng request, hủy khi đổi route/filter, giữ dữ liệu tốt gần nhất kèm nhãn cũ. Ví dụ mức tải một tab hoạt động: danh sách 12 + chi tiết 20 + operation 30 = 62 GET/phút trước request thủ công; nhiều tab/client sau proxy cùng chia giới hạn 300. Backoff 429/5xx có giới hạn; POST không tự retry.

Kiểm thử sau duyệt: build/typecheck/lint; unit cho parse response và trạng thái; component cho empty/error/stale; browser test luồng 202 → kết quả cuối, sửa config phải probe lại, POST timeout không gửi lại, operation lỗi, đổi máy trong lúc request chạy, HTML/body rỗng, token đọc không ghi, giữ dữ liệu sau lỗi. Kiểm tra keyboard/focus/dialog/reduced-motion/overflow ở 1440/1024/390px. Cuối cùng đọc/ghi với API thật và bench, ghi rõ từng lớp bằng chứng. Không ngắt dịch vụ thật để fault test nếu chưa phối hợp.

Đã chạy trong discovery:

```sh
node --test backend/src/http/handler.test.js backend/src/http/security.test.js backend/src/http/rate-limit.test.js backend/src/http/params.test.js backend/src/control/service.test.js
```

Kết quả: 5 file test pass, 0 fail. Đây là test tự động trên máy, không phải integration với DB/MQTT hoặc nghiệm thu UI. Chưa gọi API live, chưa có frontend để build/browser-test. Không đọc `.env` riêng hay evidence chứa secrets.

## 5. Demo đề xuất 3–5 phút

1. 0:00–0:40: mở BENCH-01, nói rõ ESP32 thật đọc simulator; chỉ ra liên lạc và độ mới là hai điều khác nhau.
2. 0:40–1:30: thay giá trị simulator qua người phụ trách bench, xem số đo và lịch sử cùng đơn vị/thời điểm.
3. 1:30–2:10: mở alarm thật, xác nhận “Đã xem”; giải thích thao tác không xử lý nguyên nhân vật lý.
4. 2:10–3:50: chọn profile đã chuẩn bị, preview → probe → so thay đổi → apply; chỉ kết luận sau trạng thái cuối và kiểm tra persisted.
5. 3:50–4:30: xem diagnostics/hàng đợi nếu có trạng thái thật phù hợp; nêu RAM không giữ mẫu qua mất điện. Không tạo outage chỉ để có hiệu ứng.

Demo phụ thuộc profile, API và phần cứng được người vận hành chuẩn bị; chưa tuyên bố sẵn sàng.

## 6. Quyết định người dùng đã chốt

1. Tạo nhánh `feature/frontend` và triển khai theo đề xuất A, stack và P0.
2. Demo trên máy backend dùng Docker Compose. Mặc định API localhost:3000; origin frontend 127.0.0.1:5173 cần phía vận hành thêm vào CORS. Token nhập tại runtime.
3. Demo khoảng 10 ngày sau, dự kiến 20/10/2026; giờ chính xác chưa có. P1/P2 vẫn ngoài bản P0 này.
