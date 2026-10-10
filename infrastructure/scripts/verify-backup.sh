#!/usr/bin/env bash
# Một file backup tồn tại chưa chứng minh nó khôi phục được. Script này thử phục hồi thật.
# Tạo DB tạm tên riêng, đọc lại dữ liệu, rồi dọn DB tạm; DB đang demo giữ nguyên.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
backup_file="${1:?Usage: verify-backup.sh backups/file.dump}"
test -s "$backup_file"
# Timestamp và PID giúp tên DB tạm riêng cho mỗi lần kiểm tra.
# created chỉ thành true sau khi createdb thành công, để cleanup không xóa nhầm DB có sẵn.
restore_db="infra_restore_$(date +%s)_$$"
created=false
# Ghi nhớ mã lỗi ban đầu; việc dọn dẹp không được che mất lỗi của pg_restore.
# Nếu dọn DB tạm thất bại, trả mã lỗi để người vận hành biết còn tài nguyên cần xử lý.
cleanup() {
  code=$?
  trap - EXIT
  if [ "$created" = true ]; then
    docker compose exec -T postgres sh -c 'exec dropdb -U "$POSTGRES_USER" "$1"' sh "$restore_db" || code=1
  fi
  exit "$code"
}
# EXIT xử lý cả thành công lẫn thất bại; Ctrl+C/SIGTERM cũng đi qua cleanup.
trap cleanup EXIT
trap 'exit 130' INT TERM
docker compose exec -T postgres sh -c 'exec createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
created=true
# --exit-on-error dừng ngay khi dump lỗi; --no-owner dùng tài khoản DB hiện tại.
# Dấu < gửi dump từ máy host vào stdin; container không cần mount thư mục backup.
docker compose exec -T postgres sh -c 'exec pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" < "$backup_file"
docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" <<'SQL'
-- Đếm trực tiếp trong DB vừa phục hồi để người vận hành thấy có bảng và dữ liệu.
-- Số lượng này cần đối chiếu với bản sao lưu; không mặc định mọi dump phải có 15 bảng.
SELECT count(*) AS restored_tables FROM information_schema.tables WHERE table_schema='public';
SELECT count(*) AS restored_telemetry FROM telemetry;
SELECT count(*) AS restored_alarms FROM alarms;
SQL
echo '[PASS] Backup restored into a temporary database; cleanup follows.'
