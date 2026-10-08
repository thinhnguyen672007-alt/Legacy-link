# Backend C7–C9: thay đổi, giao thức và bàn giao

Bản nền: `f8d4c53`. Phạm vi: backend và migration; không thay firmware hay triển khai lên máy chạy demo.

## Hiểu bằng tình huống đời thường

### C7 — Gửi đơn hàng rồi quên mất đơn

ESP32 giống người giao hàng, backend là quầy nhận, PostgreSQL là sổ kho. Trước đây người giao đặt hàng trước cửa rồi đi; quầy đóng cửa hoặc người ghi sổ gặp lỗi thì không còn ai giữ bản sao.

Giờ mỗi đơn có mã riêng. Backend chỉ gửi “đã ghi sổ” sau khi database COMMIT. Người giao chưa nhận xác nhận phải giữ đơn để gửi lại. Nếu sổ đã có đúng đơn đó, backend xác nhận lại mà không ghi thêm một đơn nữa.

Ví dụ: mẫu `bootA:42` đo 30°C. Database lưu xong nhưng ACK bị mất. ESP32 gửi lại `bootA:42` với nguyên dữ liệu; database vẫn chỉ có một dòng và backend trả ACK lần nữa.

Backend dùng transaction để ghi receipt (biên nhận chống trùng), lịch sử và trạng thái. Nếu bất kỳ bước nào thất bại, toàn bộ transaction rollback. Không gửi ACK thành công khi database lỗi. Nếu cùng ID mà nội dung khác, từ chối `identity_conflict` thay vì xác nhận nhầm dữ liệu.

MQTT consumer dùng client ID ổn định và `clean:false`; hai consumer chạy đồng thời cần hai ID khác nhau. Các kết nối HTTP publish/control có suffix và PID riêng. Persistent session không tự bảo vệ bản tin nguồn QoS0: firmware vẫn cần hàng đợi và retry.

C7 hoàn thành phần backend. C7 toàn hệ thống chỉ hoàn thành khi firmware có hàng đợi và vượt qua bài thử thực tế. RAM chịu gián đoạn trong giới hạn bộ đệm; muốn chịu mất điện phải lưu hàng đợi bền vững xuống flash.

### C8 — Có bài nộp nhưng học sinh không có trong danh sách lớp

Trước đây ingestion nhận dữ liệu từ bất kỳ `deviceId` nào; dashboard lại lấy danh sách từ bảng `device`. Vì vậy có thể có dữ liệu BENCH-01 nhưng không có thẻ BENCH-01 trên dashboard.

Giờ thiết bị phải được đăng ký trước. Telemetry, alarm, status và diagnostics đều kiểm tra registry. Dữ liệu có gateway ID còn được đối chiếu với gateway đã gán cho thiết bị. Thiết bị lạ bị từ chối rõ ràng, không tạo trạng thái “mồ côi”.

Luồng probe/apply hiện có vẫn đăng ký thiết bị sau ACK cấu hình thành công. Có thêm seed BENCH-01 tùy chọn dành cho simulator, nhận gateway ID từ người chạy và không ghi đè cấu hình đã commissioning. Các cột `applied_config`, `config_request_id`, `diagnostics`, `diagnostics_at` mà code đang dùng nhưng schema cũ thiếu cũng được bổ sung.

Ví dụ: `GHOST-01` gửi 30°C thì backend không tự tạo máy mới; trả `unknown_device` nếu bản tin có định danh hợp lệ. Đăng ký đúng thiết bị/gateway rồi gửi lại nguyên mẫu mới được lưu.

Dữ liệu mồ côi đã có từ trước không bị tự động xóa hay gán vào thiết bị giả. Cần đối chiếu registry và nguồn dữ liệu trước khi xử lý chúng.

### C9 — Hai hóa đơn cùng giờ bị tưởng là một

Khóa cũ là `(device_id, timestamp, code)`. Hai cảnh báo OVERHEAT cùng một mili giây, một cảnh báo high/95°C và một critical/105°C, bị gộp thành một.

Giờ cảnh báo có `eventId` riêng và `metricKey` chỉ rõ nguồn đo. Hai ID khác nhau được giữ cả hai, dù cùng thời điểm/mã/mức độ. Gửi lại cùng ID và nội dung thì chỉ lưu một lần. Dùng lại cùng ID cho nội dung khác thì bị từ chối.

Ví dụ: `bootA:51` = high/95°C, `bootA:52` = critical/105°C: giữ cả hai. Gửi lại `bootA:52` mười lần: vẫn chỉ một bản ghi cho sự kiện đó.

Firmware cũ chưa có eventId được chống trùng bằng dấu vân tay của toàn bộ nội dung đã chuẩn hóa (thời điểm, code, severity, value, metricKey). Nhờ đó high/95 và critical/105 cùng thời điểm không còn bị gộp. Tuy nhiên hai sự kiện riêng biệt có nội dung hoàn toàn giống nhau vẫn không phân biệt được nếu firmware không cung cấp ID. Đây là giới hạn của đường tương thích.

## Giao thức cho Hoàng Anh

Giữ `schemaVersion:1` cho phần mở rộng tương thích. Không đổi các topic telemetry/alarm đang có.

Telemetry tới `legacy-link/devices/BENCH-01/telemetry`:

```json
{
  "schemaVersion": 1,
  "deviceId": "BENCH-01",
  "gatewayId": "CCDBA7603C64",
  "messageId": "CCDBA7603C64:bootA:42",
  "timestamp": 1791460800000,
  "metrics": {"temperature": 30}
}
```

Alarm tới `legacy-link/devices/BENCH-01/alarm`:

```json
{
  "schemaVersion": 1,
  "deviceId": "BENCH-01",
  "gatewayId": "CCDBA7603C64",
  "eventId": "CCDBA7603C64:bootA:43",
  "metricKey": "temperature",
  "timestamp": 1791460800000,
  "code": "OVERHEAT",
  "severity": "critical",
  "value": 105
}
```

Timestamp trong ví dụ chỉ minh họa; firmware phải dùng thời điểm đo thật.

- Gateway ID: 12 ký tự hex viết hoa, khớp registry.
- messageId/eventId: 1–128 ký tự chữ, số, `:`, `_`, `-`; tạo một lần khi enqueue. Dùng `gatewayId:bootId:sequence`, không tái sử dụng cho mẫu mới.
- Alarm có ID phải có metricKey, 1–64 ký tự theo dạng tên chỉ số.
- Khi replay sau reboot, giữ bootId/ID gốc trong mẫu đã lưu; không thay bằng bootId mới.
- Giữ nguyên deviceId, topic, timestamp và nội dung của mẫu đang chờ, kể cả khi cấu hình máy thay đổi.
- Cùng ID gửi lại với thứ tự key JSON khác nhau vẫn được coi là cùng nội dung.

Backend gửi QoS1, `retain:false`, tới:

```text
legacy-link/gateways/CCDBA7603C64/ingestion/ack
```

```json
{
  "schemaVersion": 1,
  "deviceId": "BENCH-01",
  "kind": "telemetry",
  "messageId": "CCDBA7603C64:bootA:42",
  "status": "committed"
}
```

Với alarm, `kind` là `alarm` và trường `messageId` trong ACK mang giá trị `eventId` của alarm. Match cả kind, deviceId và ID, không chỉ ID.

Chỉ xóa mẫu khi nhận đúng `committed`. Không ACK hoặc mất kết nối: giữ mẫu và retry có backoff. Bắt đầu với một mẫu đang chờ ACK; không chặn Modbus/network loop. Queue phải có giới hạn, bộ đếm tràn và chính sách rõ ràng.

`status:rejected` có `reason` là `unknown_device`, `gateway_mismatch` hoặc `identity_conflict`. Không coi đây là đã lưu và không âm thầm xóa mẫu. Giữ/cách ly và báo người vận hành; unknown_device có thể xuất hiện trước khi commissioning hoàn tất, nên thử lại sau đăng ký. Identity conflict cần sửa lỗi tạo ID; không đổi ID tùy tiện để ép lưu một bản trùng.

Payload không qua validation không được ACK tới gateway chưa xác minh. Firmware cần tạo payload đúng contract trước khi enqueue và báo lỗi khi retry kéo dài. Bản tin cũ thiếu cả gatewayId và ID vẫn được nhận nếu device đã đăng ký, nhưng không có ACK phục hồi.

PubSubClient hiện tại có thể tiếp tục publish QoS0 và subscribe ACK QoS1. Config ACK và ingestion ACK là hai luồng riêng.

## Triển khai cho Huy và Thịnh

Dừng consumer cũ trước migration, vì SQL INSERT cũ còn tham chiếu khóa chống trùng đã thay đổi. Giữ HTTP/consumer ở cùng phiên bản khi khởi động lại. Firmware mới cần giữ mẫu trong thời gian bảo trì; firmware cũ không có khả năng này.

Database đã có schema trước đây, chạy từ thư mục gốc repo:

```bash
docker compose -f infrastructure/docker-compose.yml --profile full exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link < backend/db/migrate-c7-c8-c9.sql
```

Database mới: chạy `backend/db/schema.sql` thay cho migration. Schema đã chứa cùng phần nâng cấp. Các thay đổi không xóa telemetry, alarm hay cấu hình hiện có. Migration được bọc transaction và có thể chạy lại.

Ưu tiên đăng ký bằng luồng probe/apply đã có. Nếu cần fixture BENCH-01 cho demo OpenModSim, thay gateway ID bằng ID thật đọc trên Serial rồi chạy:

```bash
docker compose -f infrastructure/docker-compose.yml --profile full exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link \
  -v gateway_id=CCDBA7603C64 < backend/db/seed-bench.sql
```

Fixture này dùng địa chỉ 1/2/3 theo `docs/bench-01-handoff-2026-10-08.md`; kiểm tra bằng probe trước demo. Nó chỉ đăng ký catalog, không tuyên bố ESP32 đã áp dụng cấu hình. Chạy lại không ghi đè thiết bị đã tồn tại; nếu đã có BENCH-01 với gateway khác, sửa qua luồng commissioning sau khi xác minh phần cứng.

Giữ một MQTT_CLIENT_ID ổn định cho consumer demo. Không chạy hai consumer đồng thời cùng ID. Volume PostgreSQL/Mosquitto và ACL phải cho backend publish topic ingestion/ack, gateway subscribe topic ACK của chính nó. Không cần bật `queue_qos0_messages` để cơ chế ứng dụng này hoạt động.

`dataAgeSeconds` giờ dựa vào thời điểm đo; gửi bù dữ liệu cũ không khiến dashboard báo số đo vừa mới được lấy. `lastTelemetryAt` vẫn là thời điểm backend nhận mẫu cập nhật trạng thái. Giao diện cần dùng đúng ý nghĩa của từng trường.

Không xóa riêng `ingestion_receipt` khi các bản ghi tương ứng vẫn cần được chống trùng. Chưa triển khai retention tự động; cần thiết kế cửa sổ replay/retention trước khi vận hành dài hạn.

## Kiểm thử

```bash
cd backend
npm test
npm run test:integration
```

Integration tự tạo container PostgreSQL 16 và Mosquitto 2 với tên/cổng riêng, dữ liệu giả và mật khẩu ngẫu nhiên, rồi xóa chúng. Cần Docker và hai image tương ứng. Không dùng database/broker demo của nhóm.

Đã kiểm tra: nâng cấp giữ lịch sử; chạy lại migration; BENCH xuất hiện; registry chặn ghost; concurrent duplicate; ID bị dùng lại sai nội dung; replay không làm lùi trạng thái; mẫu khác ID cùng timestamp; nhiều alarm cùng thời điểm; transaction rollback; commissioning ghi được catalog; seed không ghi đè config; mất ACK; backend restart; database outage và retry.

Bên gửi trong integration là Node mô phỏng firmware. Nhóm vẫn phải chạy trên ESP32 thật: ngắt Wi-Fi/backend/database, gửi bù đủ mẫu, mất ACK không nhân bản; thêm ngắt nguồn nếu có hàng đợi flash. Chỉ công bố khả năng phục hồi trong dung lượng/thời gian đã kiểm chứng.
