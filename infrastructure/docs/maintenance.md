# Backup và retention có lịch

Mặc định profile `full` không chạy maintenance. Bật có chủ đích trong `.env`:

```dotenv
COMPOSE_PROFILES=full,maintenance
RETENTION_APPLY=false
RETENTION_INTERVAL_SECONDS=3600
TELEMETRY_RETENTION_DAYS=30
ALARM_RETENTION_DAYS=90
BACKUP_INTERVAL_SECONDS=86400
```

Sau đó chạy `bash scripts/setup.sh`. `retention` mặc định dry-run: chỉ báo số dòng có thể dọn, không xóa. Khi đã chấp nhận policy, đổi `RETENTION_APPLY=true` và `docker compose up -d retention`.

Mỗi lần tối đa 5.000 dòng mỗi bảng, không chồng lần chạy. Giữ telemetry 30 ngày; alarm 90 ngày và chỉ dọn alarm đã xác nhận; operation kết thúc 30 ngày; config history 7 ngày. **Receipt chống trùng không xóa**: replay cũ không tạo lại dữ liệu đã dọn. Đổi lại, cần theo dõi dung lượng receipt.

`backup` tạo pg_dump custom format, restore vào DB tạm, truy vấn bảng và version schema, xóa riêng DB tạm rồi mới đánh dấu thành công. File `.part` chưa phải backup hoàn tất. Bản dump nằm trong named volume `backup-data`; marker `/backups/last-success` là lần thành công gần nhất.

```bash
docker compose logs --tail 50 backup retention
docker compose exec -T backup cat /backups/last-success
# Xuất ra host để sau đó sao chép sang ổ/máy khác:
docker compose cp backup:/backups ./export-backups
```

Volume cùng máy không bảo vệ khỏi mất ổ cứng: phải sao chép bản backup ra nơi khác. Không chạy `down -v` với stack thật vì xóa cả volume DB và backup. Chưa tự xóa backup cũ; người vận hành quyết định thời gian giữ và dung lượng. Không commit dump vào Git.

Có thể thử một lượt trên stack test:

```bash
docker compose run --rm -T --no-deps -e RETENTION_ONCE=true retention
docker compose run --rm -T --no-deps -e BACKUP_ONCE=true backup
```

`test-stack.mjs` đã tự chạy hai lệnh này trên database riêng.
