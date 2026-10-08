#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
umask 077
mkdir -p backups
backup_file="${1:-backups/legacy-link-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump}"
if [ -e "$backup_file" ]; then echo "Refusing to overwrite $backup_file" >&2; exit 1; fi
trap 'rm -f -- "$backup_file.part"' EXIT
docker compose exec -T postgres sh -c 'exec pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$backup_file.part"
test -s "$backup_file.part"
mv "$backup_file.part" "$backup_file"
printf 'Backup: %s\n' "$backup_file"
