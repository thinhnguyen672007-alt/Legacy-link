#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
mkdir -p backups
backup_file="${1:-backups/legacy-link-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump}"
if [ -e "$backup_file" ]; then echo "Refusing to overwrite $backup_file" >&2; exit 1; fi
tmp_file="$(mktemp "$backup_file.part.XXXXXX")"
trap 'rm -f -- "$tmp_file"' EXIT
docker compose exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$tmp_file"
test -s "$tmp_file"
# Hard-link publication is atomic and refuses a concurrently created destination.
ln "$tmp_file" "$backup_file"
printf 'Backup: %s\n' "$backup_file"
