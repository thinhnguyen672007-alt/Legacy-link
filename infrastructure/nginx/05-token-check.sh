#!/bin/sh
# Kiểm tra sớm cấu hình; xác thực request vẫn thuộc backend, không chép token vào Nginx.
set -eu
[ "${#API_READ_TOKEN}" -ge 32 ] && [ "${#API_WRITE_TOKEN}" -ge 32 ] && \
[ "$API_READ_TOKEN" != "$API_WRITE_TOKEN" ] || {
  echo 'Can hai API token khac nhau, it nhat 32 ky tu; chay scripts/prepare-env.mjs' >&2
  exit 1
}
