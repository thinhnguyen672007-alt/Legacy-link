# Legacy-link Infrastructure

## Bắt đầu bằng một lệnh

Từ root repo, sau khi cấu hình `infrastructure/.env`:

```bash
./infrastructure/scripts/setup.sh
```

Nếu chưa có `.env`, script tạo từ `.env.example`. Trước khi kết nối ESP32,
đặt credential MQTT giống firmware. Cần Docker Engine đang chạy và Docker Compose v2
có `up --wait`; không cần cài Node/Postgres lên máy host.

Script build Node.js 22, backup DB hiện có, nạp schema backend, kiểm tra đủ 15 bảng
(schema version 4), và bật broker + PostgreSQL + MQTT consumer + HTTP API + gateway
bảo vệ API. Mọi dịch vụ chạy nền; lỗi ở bước nào sẽ dừng và báo tại bước đó.
Frontend chưa có service trong stack này.

API cần token: `API_READ_TOKEN` cho GET, `API_WRITE_TOKEN` cho thao tác ghi. Setup tự
sinh hai token khác nhau khi `.env` để trống. `CORS_ORIGINS` liệt kê origin frontend
được phép; để trống nghĩa là không origin nào được phép gọi.

| Thành phần | Địa chỉ mặc định | Vai trò |
| --- | --- | --- |
| Mosquitto | LAN của máy chạy Docker:1883 | Nhận/chuyển tin từ ESP32 |
| Consumer | Nội bộ Docker | Kiểm tra tin, ghi DB rồi gửi ACK |
| PostgreSQL | 127.0.0.1:5432 trên host | Giữ dữ liệu bằng named volume |
| API qua gateway | http://127.0.0.1:3000 | Đọc dữ liệu; lệnh ghi cần Bearer token |

Consumer/API dùng `mosquitto:1883` và `postgres:5432` trong Docker.
ESP32 dùng LAN IP thực của broker. Người vận hành cập nhật IP theo Wi-Fi demo.

## Lệnh thường dùng

Chạy trong `infrastructure/`:

```bash
./scripts/setup.sh           # khởi động hoặc cập nhật code/schema
./scripts/status.sh          # sức khỏe + số bản ghi + BENCH-01 đã đăng ký chưa
./scripts/test-recovery.sh   # chủ động ngắt dịch vụ, kiểm tra gửi bù/chống trùng
./scripts/backup-db.sh       # lưu DB dump vào backups/
```

`test-recovery.sh` làm gián đoạn stack trong vài phút; dùng lúc kiểm thử.
Nó tạo thiết bị giả riêng, đối chiếu dữ liệu cũ và dọn mẫu thử khi kết thúc.
Kết quả chi tiết nằm trong `reports/`, được Git bỏ qua.

## BENCH-01 và firmware mới

Backend yêu cầu thiết bị đã đăng ký với đúng gateway ID. Đọc ID 12 ký tự hex từ
ESP32, điền `BENCH_GATEWAY_ID` vào `.env`, rồi chạy:

```bash
./scripts/setup.sh --seed-bench
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
