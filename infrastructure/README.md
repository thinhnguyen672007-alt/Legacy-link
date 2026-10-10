# Infrastructure dùng chung với backend và firmware

Stack này phục vụ demo trên LAN tin cậy: PostgreSQL + Mosquitto + consumer + HTTP API + frontend Nginx. Chạy stack chỉ cần Docker Engine và Docker Compose v2 có `up --wait`; không cần cài PostgreSQL/Mosquitto/Node trên host.

## Máy mới

```bash
cd infrastructure
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work:z" -w /work node:22-alpine node scripts/prepare-env.mjs
# Mở .env, đặt DEMO_LAN_IP bằng IP Wi-Fi của máy Linux trên hotspot iPhone.
# Sau khi sửa DEMO_LAN_IP, chạy lại đúng lệnh docker run ở trên để cập nhật CORS_ORIGINS.
docker compose up -d --build --wait
```

`prepare-env.mjs` tạo mật khẩu PostgreSQL, MQTT, admin và hai API token cho cài đặt mới; chạy lại giữ nguyên giá trị đã có. `.env` được Git bỏ qua và chỉ chủ sở hữu đọc được. Trên DB mới, đăng nhập web bằng `ADMIN_USERNAME`/`ADMIN_PASSWORD` trong file này. Trên DB đã có tài khoản, tài khoản/mật khẩu cũ được giữ nguyên; giá trị `ADMIN_PASSWORD` mới trong `.env` không thay mật khẩu cũ. Không copy mật khẩu mẫu trong firmware để chạy thật: điền credential MQTT của `.env` vào `local_settings.h` đã được Git bỏ qua. Không gửi mật khẩu PostgreSQL cho ESP32.

Mở `http://<IP-Wi-Fi-Linux>:8080` từ máy còn lại; máy Linux cũng có thể mở `http://localhost:8080`. Khi iPhone cấp IP khác, sửa `DEMO_LAN_IP`, chạy lại lệnh chuẩn bị env rồi `docker compose up -d --force-recreate backend-api`. Cập nhật broker IP trong firmware và URL app Windows tương ứng. `HTTP_BIND_ADDRESS` mặc định là loopback vì người dùng truy cập API qua frontend `/api`.

Sau lần chuẩn bị đầu, bật lại bằng `docker compose up -d --wait`. Không có ESP32 thì vẫn xem được giao diện; đăng ký máy khi thiết bị kết nối bằng commissioning trên web. Seed BENCH-01 chỉ dành cho simulator và gateway ID thật: `bash scripts/setup.sh --seed-bench` sau khi đã điền `BENCH_GATEWAY_ID`. `setup.sh` cũng là đường nâng cấp có backup trước migration; không dùng `up` đơn thuần để nâng schema trên stack đang chạy.

| Thành phần | Địa chỉ mặc định |
|---|---|
| MQTT ESP32 | IP LAN máy Docker:1883 |
| Database | 127.0.0.1:5432; Docker dùng postgres:5432 |
| API qua Nginx | http://127.0.0.1:3000 |
| Frontend và `/api` | http://localhost:8080 hoặc http://IP-Wi-Fi-Linux:8080 |
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

[Env và token](docs/environment.md) · [Runbook](docs/runbook.md) · [Maintenance](docs/maintenance.md) · [Nghiệm thu hạ tầng 2026-10-10](docs/acceptance-2026-10-10.md) · [Bàn giao frontend](../docs/FRONTEND-HANDOFF.md).
