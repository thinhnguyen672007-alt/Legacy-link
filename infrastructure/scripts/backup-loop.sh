#!/bin/sh
# Sao lưu tự động vào volume riêng; mỗi bản phải restore thử trước khi báo thành công.
set -eu
umask 077
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
case "$interval" in ''|*[!0-9]*) echo 'Invalid backup interval' >&2; exit 1;; esac
[ "$interval" -ge 60 ] && [ "$interval" -le 604800 ]
mkdir -p /backups
restore_db=''
created=false
cleanup() {
  if [ "$created" = true ]; then dropdb --if-exists "$restore_db" || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT TERM
while :; do
  suffix="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$-$suffix"
  dump="/backups/legacy-$stamp.dump"
  pg_dump -Fc --no-owner > "$dump.part"
  restore_db="verify_$(date +%s)_$suffix"
  createdb "$restore_db"
  created=true
  pg_restore --exit-on-error --no-owner -d "$restore_db" "$dump.part"
  psql -v ON_ERROR_STOP=1 -d "$restore_db" -c 'SELECT count(*) FROM telemetry; SELECT count(*) FROM alarms; SELECT max(version) FROM schema_migrations;'
  dropdb "$restore_db"
  restore_db=''
  created=false
  mv "$dump.part" "$dump"
  # Không tự xóa bản backup cũ. Người vận hành quyết định lưu ở ổ khác và thời gian giữ.
  printf '%s\n' "$stamp" > /backups/last-success
  echo "PASS backup va restore: $dump"
  [ "${BACKUP_ONCE:-false}" != true ] || exit 0
  sleep "$interval" & wait $!
done
