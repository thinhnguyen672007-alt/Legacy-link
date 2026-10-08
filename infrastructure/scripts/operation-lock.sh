# Sourced after cd into infrastructure/. Prevent concurrent migration/outage drills.
acquire_operation_lock() {
  if ! mkdir .operation-lock 2>/dev/null; then
    echo '[ERROR] Another setup/recovery operation holds .operation-lock.' >&2
    echo 'Check its owner file and running process before removing a stale lock.' >&2
    return 1
  fi
  printf 'pid=%s\noperation=%s\nstarted=%s\n' "$$" "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .operation-lock/owner
}
release_operation_lock() {
  rm -f .operation-lock/owner
  rmdir .operation-lock
}
