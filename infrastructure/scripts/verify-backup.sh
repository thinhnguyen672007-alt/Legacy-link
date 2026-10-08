#!/usr/bin/env bash
# Restore into a uniquely named temporary database, never the running database.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
backup_file="${1:?Usage: verify-backup.sh backups/file.dump}"
test -s "$backup_file"
restore_db="infra_restore_$(date +%s)_$$"
created=false
cleanup() {
  code=$?
  trap - EXIT
  if [ "$created" = true ]; then
    docker compose exec -T postgres sh -c 'exec dropdb -U "$POSTGRES_USER" "$1"' sh "$restore_db" || code=1
  fi
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
docker compose exec -T postgres sh -c 'exec createdb -U "$POSTGRES_USER" "$1"' sh "$restore_db"
created=true
docker compose exec -T postgres sh -c 'exec pg_restore --exit-on-error --no-owner -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" < "$backup_file"
docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1"' sh "$restore_db" <<'SQL'
SELECT count(*) AS restored_tables FROM information_schema.tables WHERE table_schema='public';
SELECT count(*) AS restored_telemetry FROM telemetry;
SELECT count(*) AS restored_alarms FROM alarms;
SQL
echo '[PASS] Backup restored into a temporary database; cleanup follows.'
