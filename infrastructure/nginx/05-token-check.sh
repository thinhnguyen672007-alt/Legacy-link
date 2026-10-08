#!/bin/sh
set -eu
case "${API_WRITE_TOKEN:-}" in
  ''|*[!a-fA-F0-9]*) echo 'API_WRITE_TOKEN must be a hex token; run scripts/setup.sh' >&2; exit 1 ;;
esac
[ "${#API_WRITE_TOKEN}" -ge 32 ] || { echo 'API_WRITE_TOKEN must contain at least 32 hex characters' >&2; exit 1; }
