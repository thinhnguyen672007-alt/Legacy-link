# Backup và khôi phục dữ liệu

Các lệnh chạy trong `infrastructure/`.

## 5. Restart, backup và restore

```bash
docker compose restart backend-consumer backend-api
./scripts/backup-db.sh
./scripts/verify-backup.sh backups/TEN_FILE.dump
```

Backup dạng PostgreSQL custom dump. `verify-backup.sh` phục hồi vào DB tạm tên riêng,
đếm bảng/bản ghi, rồi xóa **DB tạm**; DB demo không bị ghi đè.
Database dùng named volume, broker dùng thư mục `mosquitto/data` và bật persistence.
Restart/recreate container giữ dữ liệu; `docker compose down -v` xóa dữ liệu DB, không dùng
trên stack demo. Firmware giữ hàng đợi trong RAM; mất nguồn ESP32 làm mất hàng đợi đó.

Khôi phục thực tế vào **DB mới** để tránh ghi đè dữ liệu hiện tại:

```bash
docker compose stop backend-consumer backend-api api-gateway
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" legacy_link_restored'
docker compose exec -T postgres sh -c 'pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d legacy_link_restored' < backups/TEN_FILE.dump
```

Đặt `POSTGRES_DB=legacy_link_restored` trong `.env`, chạy `./scripts/setup.sh`.
DB cũ vẫn giữ để đối chiếu. Chỉ restore dump tin cậy. Nếu DB tên trên đã tồn tại,
chọn tên mới; không drop DB cũ để chạy lại lệnh.
