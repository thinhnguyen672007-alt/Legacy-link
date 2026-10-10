# Infrastructure dùng chung với backend và firmware

Stack này phục vụ demo trên LAN tin cậy: PostgreSQL + Mosquitto + consumer + HTTP API + Nginx. Frontend do đội xây riêng. Cần Docker Engine, Docker Compose v2 có `up --wait`, Node >=22.9 để đọc env an toàn; không cần cài PostgreSQL/Mosquitto trên host.

## Máy mới

```bash
cd infrastructure
node scripts/prepare-env.mjs
# Sửa .env: HTTP_BIND_ADDRESS=0.0.0.0 nếu cho laptop khác truy cập,
# CORS_ORIGINS đúng URL frontend, BENCH_GATEWAY_ID lấy từ ESP32.
bash scripts/setup.sh --seed-bench
```

`prepare-env.mjs` tạo hai token và mật khẩu riêng cho cài đặt mới, giữ nguyên giá trị đã có. Không copy mật khẩu mẫu trong firmware để chạy thật: điền credential MQTT của `.env` vào `local_settings.h` đã được Git bỏ qua. Không gửi mật khẩu PostgreSQL cho ESP32.

Không có ESP32 thì chạy `bash scripts/setup.sh` không seed, sau đó dùng luồng probe/apply khi thiết bị kết nối. Seed BENCH-01 chỉ dành cho simulator.

| Thành phần | Địa chỉ mặc định |
|---|---|
| MQTT ESP32 | IP LAN máy Docker:1883 |
| Database | 127.0.0.1:5432; Docker dùng postgres:5432 |
| API qua Nginx | http://127.0.0.1:3000 |
| Consumer/API nội bộ | mosquitto:1883; không dùng localhost để tới container khác |

Dữ liệu API cần Bearer read/write token. Health công khai. Backend quyết định cả auth và CORS; Nginx chuyển nguyên Authorization.

## Máy đã chạy lab bằng Node + container cũ

Đọc [chạy local](../docs/chay-local.md). Setup sẽ từ chối nếu tên container thuộc cách chạy/project khác, nhằm bảo vệ DB đang dùng. Không xóa container/volume để vượt chốt này. Muốn chuyển sang Compose, dùng tên/cổng riêng, backup/restore và kiểm tra dữ liệu trước khi chuyển ESP32 sang broker mới.

## Kiểm thử không đụng lab

Từ root repo:

```bash
node infrastructure/scripts/test-stack.mjs
```

Tự dựng bản sao source vào thư mục tạm, tạo mật khẩu/volume/network/cổng riêng, thử auth/CORS, migration, bốn outage, replay, backup/restore và maintenance; dọn riêng tài nguyên test sau khi xong. Không nạp ESP32, không dùng `.env` thật. Kết quả và thư mục evidence được in cuối bài.

Bài `scripts/test-recovery.sh` chạy trực tiếp trong stack hiện tại **có ngắt dịch vụ**. Chỉ dùng khi cả đội đã vào buổi test.

## Vận hành

```bash
bash scripts/status.sh
bash scripts/backup-db.sh
bash scripts/verify-backup.sh backups/TEN_FILE.dump
docker compose logs --since 5m backend-api backend-consumer
```

Seed này dành cho BENCH-01/simulator, không tự đổi commissioning đã có.
`--seed` riêng là dữ liệu máy mẫu, không thay thế đăng ký ESP32 thật.

## Tài liệu

- [Runbook: env, health, restart, backup/restore, demo](docs/runbook.md)
- [Nghiệm thu hạ tầng 2026-10-10](docs/acceptance-2026-10-10.md)
- [Backend API](../docs/backend-api-c10.md)
- [Hợp đồng gửi bù và giới hạn firmware](../docs/telemetry-delivery.md)

**Onboarding** là quá trình một người/máy mới bắt đầu dùng dự án.
“Đo thời gian onboarding” là bấm giờ từ lúc bắt đầu cấu hình repo đến lúc
mẫu telemetry đầu tiên xuất hiện qua API; chưa có số đo phần cứng thì chưa công bố số.
[Env và token](docs/environment.md) · [Runbook](docs/runbook.md) · [Maintenance](docs/maintenance.md) · [Bàn giao frontend](../docs/FRONTEND-HANDOFF.md).
