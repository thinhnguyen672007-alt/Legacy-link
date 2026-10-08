# API frontend và sửa C10

Nhánh triển khai: `feature/backend-base`. Phần C7–C9 trong `backend-c7-c8-c9.md` đi cùng thay đổi này.

## Vấn đề cốt lõi của C10

Hình dung nhà hàng có bảng hướng dẫn đúng nhưng nhân viên lại dùng một cuốn sổ khác. Trước đây `http/handler.js` có các route đã test, nhưng `http/server.js` tự viết bộ route thứ hai và không dùng handler đó. Vì vậy endpoint trong test có thể không xuất hiện trên HTTP thật.

Ngoài ra `/health` chỉ nói tiến trình đang trả lời, dù database/consumer đã hỏng; cổng cố định 3000; URL được parse ngoài khối bắt lỗi và dựa vào Host do người gọi gửi. Một URL lỗi có thể thoát khỏi đường xử lý lỗi bình thường.

Đã sửa: server chỉ khởi động HTTP và nối dependency vào **một** handler được test; URL được parse trong try/catch với origin cố định; endpoint có method rõ ràng và header Allow; lỗi trả JSON; cổng/host cấu hình bằng env; cổng đang bận thì log EADDRINUSE và thoát có mã lỗi.

`/health/live` giống câu hỏi “nhân viên còn ở quầy không?”. `/health/ready` giống “quầy, sổ kho và người nhận hàng đều sẵn sàng chưa?”. HTTP có thể còn sống nhưng chưa sẵn sàng phục vụ toàn hệ thống.

## API cho frontend

Base URL mặc định: `http://localhost:3000`. Dùng địa chỉ máy chạy HTTP khi frontend chạy ở máy khác. Tất cả response ứng dụng là JSON; lỗi dạng `{error, code}` (một số lỗi nghiệp vụ có thêm requestId). OPTIONS trả 204, method sai trả 405 và Allow. CORS hiện cho phép mọi origin phục vụ demo trên mạng của nhóm; API chưa có đăng nhập/phân quyền (C15).

| Method | Endpoint | Dùng để |
|---|---|---|
| GET | `/machines` | Danh sách máy đã đăng ký, trạng thái mới nhất |
| GET | `/machines/{deviceId}` | Một máy; 404 nếu chưa đăng ký |
| GET | `/machines/{deviceId}/telemetry` | Lịch sử số đo cho biểu đồ |
| GET | `/machines/{deviceId}/alarms` | Cảnh báo của một máy |
| GET | `/alarms` | Cảnh báo toàn hệ thống, lọc deviceId/severity/acknowledged |
| POST | `/alarms/{id}/ack` | Người dùng xác nhận đã xem cảnh báo, gọi lặp không đổi thời điểm đầu tiên |
| GET | `/gateways` | ESP32 đang báo trạng thái |
| GET | `/catalog?deviceId=BENCH-01` | Cấu hình catalog của máy |
| POST | `/gateways/{gatewayId}/probe` | Đọc thử register map |
| POST | `/gateways/{gatewayId}/apply` | Áp dụng đúng cấu hình vừa probe thành công |
| GET | `/operations/{id}` | Theo dõi probe/apply |
| POST | `/devices/{deviceId}/config` | Gửi catalog hiện có qua luồng config-request cũ |
| GET | `/config-requests/{requestId}` | Theo dõi yêu cầu catalog trong database |
| GET | `/uptime?limit=20` | Lịch sử chạy consumer, limit 1–100 |
| GET | `/health` hoặc `/health/live` | Tiến trình HTTP còn sống |
| GET | `/health/ready` | Database, MQTT HTTP, consumer đều sẵn sàng |

Thông số chính xác và schema: `backend/openapi.json` (import vào Postman/Swagger). Client JS: `backend/examples/frontend-client.js`.

### Dashboard và biểu đồ

`/machines` trả mảng. Các trường chính: deviceId, name, gatewayOnline, metrics, dataAgeSeconds, lastMeasurementAt, lastTelemetryAt, gatewayId, diagnostics. Máy online không đồng nghĩa số đo mới: hiển thị cả tuổi số đo. `dataAgeSeconds` tính từ lúc đo, tránh dữ liệu gửi bù bị hiểu là vừa đo.

Lịch sử và danh sách alarm trả:

```json
{"items": [], "from": 1791450000000, "to": 1791453600000, "nextCursor": null}
```

- `from`, `to`: epoch milliseconds, inclusive. Mặc định 24 giờ gần nhất; mỗi lần truy vấn tối đa 31 ngày.
- `limit`: 1–500, mặc định 100.
- `cursor`: dùng nguyên nextCursor. Giữ nguyên from/to và các bộ lọc khi lấy trang sau. nextCursor=null là hết trang.
- Thứ tự mới nhất trước (timestamp giảm dần, ID giảm dần khi cùng thời điểm). Đảo thứ tự khi vẽ biểu đồ tăng theo thời gian.
- ID bản ghi database là **chuỗi** để tránh mất chính xác số lớn trong JavaScript. Timestamp số đo là **số milliseconds**; receivedAt/acknowledgedAt là ISO date-time.
- Alarm filter: severity=low|medium|high|critical, acknowledged=true|false. Device chưa đăng ký trả 404; query sai trả 400.
- POST alarm ACK là thao tác người dùng “đã xem”, không tắt máy, không xóa sự kiện, không phải ingestion ACK gửi ESP32.

```js
import { createLegacyLinkApi } from './frontend-client.js';
const api = createLegacyLinkApi('http://localhost:3000');
const machines = await api.machines();
const to = Date.now();
const history = await api.telemetry('BENCH-01', {
  from: to - 3600000, to, limit: 100
});
const chartPoints = history.items.slice().reverse();
const pending = await api.alarms({ acknowledged: false, limit: 50 });
// Gọi khi người dùng bấm xác nhận, không tự động khi mở trang:
// await api.acknowledgeAlarm(pending.items[0].id);
```

Polling dashboard mỗi 2–5 giây là đủ cho demo. Chờ request trước xong mới gọi tiếp; xử lý 503 bằng thông báo mất kết nối và thử lại có khoảng nghỉ. Không dùng `/health/ready` thất bại để che toàn bộ dữ liệu lịch sử: database vẫn có thể đọc được khi MQTT mất kết nối.

### Cấu hình firmware từ frontend

Luồng khuyến nghị: GET gateways → người dùng chọn gateway online → POST probe với `{config}` → poll operations đến `completed` → hiển thị kết quả đọc → POST apply với `{config, probeRequestId, machineType, acceptWarnings}` → poll operations đến trạng thái cuối.

Config phải khớp nguyên cấu hình đã probe; probe thành công trong 60 giây và cùng boot ESP32. Probe có register đọc lỗi thì không được apply; số đo ngoài khoảng dự kiến cần người dùng xác nhận acceptWarnings=true. Không tự chuyển flag này thành true.

202 chỉ là “đã nhận yêu cầu”, chưa phải áp dụng thành công. `applied` với persisted=false nghĩa là chỉ áp dụng trong RAM. `timed_out` hoặc lỗi publish có thể là chưa biết kết quả; kiểm tra gateway state trước khi gửi lại. Operations nằm trong RAM của HTTP, hết hạn sau một giờ và mất khi HTTP restart; 404 thì đọc lại gateway state. Giữ một HTTP instance cho flow này trong demo.

POST devices/{id}/config là luồng cũ gửi lại catalog đã lưu, trả requestId và poll config-requests. Không trộn ID của hai luồng. Publish chờ tối đa 5 giây để request không treo vô hạn; hết thời gian được ghi nhận là kết quả chưa xác định, không khẳng định ESP32 đã từ chối.

## Cho Hoàng Anh — firmware

HTTP API dùng bởi frontend. ESP32 tiếp tục MQTT, không cần chuyển sang gọi REST.

- Probe/config: topic và schema hiện tại được giữ, frontend dùng các endpoint ở trên để backend gửi lệnh.
- C7/C9: thêm gatewayId + messageId cho telemetry; gatewayId + eventId + metricKey cho alarm; giữ mẫu đến khi nhận ingestion ACK committed. Contract chi tiết ở `docs/backend-c7-c8-c9.md`.
- Gateway state/heartbeat và config ACK tiếp tục đúng schema hiện có. Nó quyết định gateway online và tiến độ apply.
- Phân biệt ba xác nhận: config ACK (ESP32 đã áp dụng cấu hình), ingestion ACK (DB đã lưu dữ liệu), HTTP alarm ACK (người dùng đã xem cảnh báo).

## Cho Huy — infrastructure

Chạy **hai tiến trình** dùng chung PostgreSQL/MQTT: `npm start` (consumer), `npm run start:http` (HTTP). Dockerfile backend mặc định chạy consumer; HTTP container có thể dùng cùng image với command `node src/http/server.js`, mở cổng HTTP_PORT. Compose hiện tại của infra chưa được thay đổi trong nhánh backend.

Env MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_QOS, DATABASE_URL như trước; thêm HTTP_HOST (mặc định 0.0.0.0), HTTP_PORT (mặc định 3000). Cả HTTP và consumer dùng cùng MQTT_CLIENT_ID để HTTP theo dõi heartbeat đúng consumer; HTTP tự thêm suffix riêng cho kết nối MQTT nên không giành client ID. Không chạy hai consumer cùng ID. HTTP_PORT=0 chỉ dành cho integration tests lấy cổng ngẫu nhiên.

Database mới: chạy `backend/db/schema.sql`. Database cũ: dừng consumer/HTTP bản cũ và chạy migration C7–C9 rồi C10, theo thứ tự:

```bash
docker compose -f infrastructure/docker-compose.yml --profile full exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link < backend/db/migrate-c7-c8-c9.sql
docker compose -f infrastructure/docker-compose.yml --profile full exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link < backend/db/migrate-c10.sql
```

Giữ volume database/broker. Registry BENCH-01 và các lệnh seed trong tài liệu C7–C9. Không chạy phiên bản consumer cũ sau migration thay khóa chống trùng.

Healthcheck:

```bash
curl -f http://localhost:3000/health/live
curl -f http://localhost:3000/health/ready
```

Readiness trả 200 khi tất cả checks=true, ngược lại 503. Consumer ghi heartbeat mỗi 5 giây sau khi kết nối MQTT và subscribe thành công; HTTP coi heartbeat quá 15 giây là stale. Đây là phát hiện có độ trễ tối đa cửa sổ heartbeat, không phải cam kết không mất mẫu. Khi khởi động chờ vài giây trước readiness đầu tiên. Health không phụ thuộc có ESP32 online hay không.

PostgreSQL mất kết nối hoặc chưa có schema cần thiết → database=false. Broker mất kết nối/subscription chưa hoàn tất → mqttPublisher hoặc mqttControl=false. Consumer dừng/treo → consumer=false. /health/live vẫn 200 để phân biệt HTTP chết với dependency chết. Đặt Docker start_period ít nhất 20 giây; không dùng readiness để tạo vòng restart liên tục khi database đang bảo trì.

## Kiểm thử và file thay đổi chính

`npm test` kiểm tra validation, HTTP routing, query/cursor, cấu hình port, commissioning và ingestion ACK. `npm run test:integration` dùng Docker riêng để chạy DB/broker/consumer/**HTTP entrypoint thật**, kiểm tra pagination, alarm ACK, malformed URL, 405, port conflict, readiness khi DB/broker/consumer mất, cùng các bài C7–C9. Không dùng dữ liệu demo của nhóm.

- `backend/src/http/server.js`: bỏ route trùng, dùng handler duy nhất; port/host, startup/shutdown, readiness.
- `backend/src/http/handler.js`: route frontend, JSON errors, method/URL/body validation.
- `backend/src/http/params.js`, `settings.js`: giới hạn query/cursor và kiểm tra port.
- `backend/src/db/dashboard.js`, `machines.js`: detail/history/alarm filtering + human ACK.
- `backend/src/db/health.js`, `src/index.js`, `mqtt/client.js`, `control/service.js`: heartbeat và trạng thái subscribe cho readiness.
- `backend/db/migrate-c10.sql`, `schema.sql`: heartbeat table và index phục vụ phân trang.
- `backend/src/mqtt/publisher.js`, `service/apply-config.js`, `db/config-request.js`: publish có thời hạn, giữ đúng requestId và không kết luận sai khi kết quả chưa rõ.
- `backend/openapi.json`, `examples/frontend-client.js`, `.env.example`: hợp đồng API, client mẫu, cấu hình.
- `backend/src/http/*.test.js`, `scripts/ingestion-integration.mjs`: kiểm thử thực tế các thay đổi.
