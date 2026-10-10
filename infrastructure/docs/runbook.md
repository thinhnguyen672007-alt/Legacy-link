# Chạy và nâng cấp stack

Các lệnh chạy trong `infrastructure/`. Máy mới chuẩn bị `.env` một lần theo README rồi dùng `docker compose up -d --build --wait`; lần bật sau dùng `docker compose up -d --wait`. Script dưới đây dành cho nâng cấp trên stack đang chạy, với backup và dừng worker có kiểm soát. Máy đang chạy Node trực tiếp xem `docs/chay-local.md` ở root repo.

```bash
bash scripts/setup.sh
```

Thứ tự: kiểm tra env/Compose/tên container → build → backup DB đang chạy → chuẩn bị broker → dừng consumer/API → khởi động dependency → migration có version → seed nếu yêu cầu → bật dịch vụ → kiểm tra health. Build lỗi thì chưa dừng worker. Migration lỗi thì dừng quy trình; đọc lỗi và phục hồi theo backup, không chạy code mới vào schema dở dang.

Migration thuộc `backend/scripts/migrate.mjs`, readiness thuộc `backend/src/db/schema-version.js`. Không đếm cố định 10 bảng hay nạp riêng schema cũ nữa. Schema hiện tại là version 5.

```bash
bash scripts/status.sh
curl -i http://127.0.0.1:3000/health/ready
docker compose logs --since 5m backend-consumer backend-api
curl -i http://127.0.0.1:8080/api/health/ready
```

`live=200` chỉ chứng minh HTTP còn sống. `ready=200` còn cần DB/schema, consumer heartbeat và kết nối MQTT đã subscribe. `mosquitto-init` và `backend-init` Exited(0) là bình thường.

Watchdog kiểm tra định kỳ và restart sau ba lần readiness lỗi. Khi dừng, cho backend dùng deadline `SHUTDOWN_TIMEOUT_MS` (mặc định 15 giây), rồi chờ thêm 5 giây mới buộc dừng. Docker cho tối đa 130 giây để bao cả cấu hình backend tối đa 120 giây; bình thường dừng xong sớm thì thoát ngay. Đây không phải bảo đảm phục hồi sau đúng một số giây cố định.

Backend đã sửa lỗi cache/resubscribe MQTT từng xuất hiện ở PR54. Bài kiểm thử hiện tại xác nhận reconnect và ACK mới sau broker restart; không còn coi lỗi cũ là phần chưa làm.

Setup và recovery dùng `.operation-lock`. Nếu máy mất điện, kiểm tra PID trong owner đã ngừng rồi mới gỡ lock cũ. Không chạy hai thao tác gây outage đồng thời.

`unknown_device`: kiểm tra registry và gateway ID. `metric_not_configured`: kiểm tra catalog/profile lịch sử. `401/403`: kiểm tra token/quyền/Origin. `EADDRINUSE`: không khởi động thêm API trên cùng cổng. `EACCES` trên Fedora: kiểm tra mount `:z`, không tắt SELinux toàn máy.

[Backup/restore](backup-restore.md) · [Maintenance tự động](maintenance.md) · [Test ESP32](demo-acceptance.md).
