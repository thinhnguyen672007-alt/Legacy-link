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

Database có 10 bảng: `telemetry`, `machine_state`, `alarms`, `device`, `register_map`,
`register_override`, `config_request`, `service_run`, `ingestion_receipt`, `consumer_health`.
Schema được lấy trực tiếp từ `../backend/db/schema.sql`; infra không giữ bản sao SQL.

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
- Watchdog Node đợi 30 giây lúc khởi động, kiểm tra mỗi 10 giây; sáu lần readiness lỗi
  liên tiếp thì thoát để Docker restart. Một vòng lỗi liên tục mất khoảng 80–95 giây.
  Đây là biện pháp phục hồi infra; không thay thế sửa lỗi reconnect của backend.

**Lỗi quan sát với backend PR54:** sau broker restart, consumer ghi được dữ liệu nhưng
log `Da subscribe:` rỗng, heartbeat `ready=false`; API có `mqttControl=false`.
Backend kiểm tra `granted.length` trong callback subscribe; MQTT.js có thể trả danh sách
rỗng khi các topic đã được cache/resubscribe. Cần backend kiểm tra lại xử lý này.
Infra không sửa source backend và không biến lỗi readiness thành OK giả.

`unknown_device`: kiểm tra đăng ký BENCH-01/gateway ID. `relation ... does not exist`:
chạy lại setup và đọc lỗi SQL. Cổng đã dùng: đổi cổng host trong `.env`.
Không in `.env` hay `docker compose config` đầy đủ vào log chia sẻ vì có credential.

## Hướng dẫn theo việc

- [Env, gateway ID, credential và token API](environment.md)
- [Restart, backup và restore](backup-restore.md)
- [Kiểm thử tự động và ESP32 thật](demo-acceptance.md)
