#!/usr/bin/env bash
# Sao lưu DB trước migration hoặc trước demo: có lỗi thì dừng, không báo thành công giả.
# File .dump chứa cấu trúc và dữ liệu; chỉ lưu trong backups/ đã được Git bỏ qua.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# File mới chỉ cho chủ sở hữu đọc/ghi, vì backup có thể chứa dữ liệu riêng.
umask 077
mkdir -p backups
# Có thể truyền tên file; mặc định ghép giờ UTC và PID để các lần chạy không trùng tên.
# Từ chối file đã có: một lần backup mới không được làm mất bản cứu hộ cũ.
backup_file="${1:-backups/legacy-link-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump}"
if [ -e "$backup_file" ]; then echo "Refusing to overwrite $backup_file" >&2; exit 1; fi
# Ghi vào file tạm riêng trước. Nếu pg_dump lỗi hoặc bị ngắt, trap xóa phần đang ghi.
# Chỉ công bố file đích sau khi lệnh thành công và file có nội dung.
tmp_file="$(mktemp "$backup_file.part.XXXXXX")"
trap 'rm -f -- "$tmp_file"' EXIT
# -T bỏ terminal giả để dữ liệu nhị phân đi nguyên vẹn qua stdout.
# -Fc chọn định dạng custom của PostgreSQL, phục hồi bằng pg_restore.
# Các biến POSTGRES_* được đọc bên trong container, không ghi mật khẩu ra log.
docker compose exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp_file"
test -s "$tmp_file"
# ln tạo tên đích cho đúng file vừa ghi, không chép lại dữ liệu.
# Nếu tiến trình khác tạo tên đích trước, ln thất bại thay vì ghi đè.
# Khi trap xóa tên tạm, tên backup vẫn giữ dữ liệu vì hai tên trỏ cùng một file.
ln "$tmp_file" "$backup_file"
printf 'Backup: %s\n' "$backup_file"
