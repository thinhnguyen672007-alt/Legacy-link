# Runbook demo Legacy-link

Các lệnh dưới đây chạy từ `infrastructure/`, trừ khi ghi khác.

## 1. Khởi động và cập nhật

```bash
./scripts/setup.sh
```

Dùng cùng lệnh sau khi kéo code mới. Script giữ `.env`, build hai tiến trình Node22,
dừng worker trước migration, backup DB, nạp schema, bật đủ dịch vụ và chờ healthy.
Không tự pull Git; người vận hành chọn revision cần chạy.
Không xóa volume. Setup làm gián đoạn ingestion trong lúc nâng cấp.
Nếu build lỗi, worker cũ chưa bị dừng. Nếu migration lỗi, worker giữ trạng thái dừng
để tránh ghi vào schema dở dang: đọc lỗi, sửa nguyên nhân rồi chạy lại setup.

Dừng dịch vụ bằng `docker compose stop` tôn trọng `stop_grace_period` 25 giây; watchdog
đọc `SHUTDOWN_TIMEOUT_MS` (mặc định 15 giây) trước khi SIGKILL. Nhờ đó consumer kịp drain
mẫu đã nhận và gửi nốt ACK thay vì bị cắt giữa chừng.

Database có 15 bảng (schema version 4): 10 bảng dữ liệu `telemetry`, `machine_state`,
`alarms`, `device`, `register_map`, `register_override`, `config_request`, `service_run`,
`ingestion_receipt`, `consumer_health`, cộng 5 bảng C16 `schema_migrations`,
`gateway_command_lease`, `control_operation`, `device_config_history`, `device_profile`.
Schema được lấy trực tiếp từ `../backend/db/schema.sql`; infra không giữ bản sao SQL.
Setup kiểm tra đủ 15 bảng và version 4 sau khi nạp, không chỉ đếm một phần danh sách.

## 3. Sức khỏe và xem lỗi

```bash
./scripts/status.sh
docker compose logs --since 5m backend-consumer backend-api
docker compose logs --since 5m mosquitto postgres
curl -i http://127.0.0.1:3000/health/ready
```

- `/health/live`: tiến trình HTTP còn trả lời.
- `/health/ready`: DB/schema dùng được, heartbeat consumer mới và MQTT đã subscribe.
  Lỗi dependency trả 503; không dùng `/health` cũ làm bằng chứng sẵn sàng.
- Broker probe publish QoS1 có credential. Consumer probe đọc đủ cột schema và heartbeat.
- `mosquitto-init` kết thúc `Exited (0)` là bình thường.
- `unless-stopped` tự bật lại khi tiến trình chết hoặc Docker khởi động lại, trừ dịch vụ
  đã bị người dùng chủ động stop. Docker phải được bật khi khởi động máy.
- Watchdog Node đợi 15 giây lúc khởi động, kiểm tra mỗi 5 giây; ba lần readiness lỗi
  liên tiếp thì thoát để Docker restart. Lần restart đầu khi lỗi liên tục từ khởi động thường khoảng 25–40 giây.
  Đây là biện pháp phục hồi infra; không thay thế sửa lỗi reconnect của backend.

**Đã kiểm chứng lại sau C16:** backend tắt resubscribe của thư viện và tự subscribe lại
trên mỗi lần connect, kiểm tra số topic broker cấp. Bài `test-recovery.sh mosquitto` tắt
rồi bật broker: `ready` xuống 503, sau đó trở lại 200 và nhận đủ ACK committed cho 6 ID.
Nếu còn gặp `Da subscribe:` rỗng hoặc `mqttControl=false` sau reconnect, ghi log và báo
backend; infra không sửa source backend và không biến lỗi readiness thành OK giả.

`unknown_device`: kiểm tra đăng ký BENCH-01/gateway ID. `relation ... does not exist`:
chạy lại setup và đọc lỗi SQL. Cổng đã dùng: đổi cổng host trong `.env`.
Không in `.env` hay `docker compose config` đầy đủ vào log chia sẻ vì có credential.

Setup và bài thử phục hồi dùng chung `.operation-lock` để tránh chạy chồng nhau.
Nếu máy bị tắt đột ngột, kiểm tra PID trong `.operation-lock/owner` đã ngừng trước khi
xóa lock cũ và chạy lại. Không xóa lock khi một thao tác vẫn đang chạy.

## Hướng dẫn theo việc

- [Env, gateway ID, credential và token API](environment.md)
- [Restart, backup và restore](backup-restore.md)
- [Kiểm thử tự động và ESP32 thật](demo-acceptance.md)
