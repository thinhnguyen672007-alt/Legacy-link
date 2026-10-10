#!/bin/sh
# Nginx chỉ được bật khi có token hợp lệ. Nếu để trống rồi vẫn chạy, người vận hành
# dễ tưởng endpoint ghi đã được bảo vệ. setup.sh tự sinh token hex khi chưa có.
set -eu
# Chỉ nhận chữ số hex để token an toàn khi envsubst đưa vào chuỗi cấu hình Nginx.
case "${API_WRITE_TOKEN:-}" in
  ''|*[!a-fA-F0-9]*) echo 'API_WRITE_TOKEN must be a hex token; run scripts/setup.sh' >&2; exit 1 ;;
esac
# Ít nhất 32 ký tự hex tương ứng 16 byte; setup mặc định sinh 32 byte thành 64 ký tự.
[ "${#API_WRITE_TOKEN}" -ge 32 ] || { echo 'API_WRITE_TOKEN must contain at least 32 hex characters' >&2; exit 1; }
