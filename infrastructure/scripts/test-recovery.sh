#!/usr/bin/env bash
# Controlled outage drill against this stack; uses a separate synthetic gateway.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
infra_root="$PWD"
source ./scripts/operation-lock.sh
operation_locked=false
# shellcheck disable=SC1091
source .env
export COMPOSE_PROFILES=full API_WRITE_TOKEN
umask 077
report_root="$infra_root/reports/recovery-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$report_root"
interrupted_service=''
network_detached=false
fixture_active=false
consumer_id="$(docker compose ps -q backend-consumer)"
network_name="${DOCKER_NETWORK_NAME:-legacy-link-net}"
run_dir=''
probe() {
  docker compose run --rm -T --no-deps -e API_WRITE_TOKEN \
    -v "$infra_root/scripts/delivery-check.cjs:/app/infra-delivery.cjs:ro" \
    -v "$run_dir:/evidence" --entrypoint node backend-consumer \
    /app/infra-delivery.cjs "$@"
}
restore_services() {
  if [ "$network_detached" = true ]; then
    docker network connect --alias backend-consumer "$network_name" "$consumer_id"
    network_detached=false
  fi
  if [ -n "$interrupted_service" ]; then
    docker compose up -d --no-deps --wait --wait-timeout 90 "$interrupted_service"
    interrupted_service=''
  fi
}
cleanup() {
  code=$?
  trap - EXIT
  restore_services || code=1
  if [ "$fixture_active" = true ]; then probe cleanup || code=1; fi
  if [ "$operation_locked" = true ]; then release_operation_lock || code=1; fi
  echo "Evidence: $report_root"
  exit "$code"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
faults=("$@")
if [ ${#faults[@]} -eq 0 ]; then faults=(backend-consumer postgres mosquitto network); fi
for fault in "${faults[@]}"; do
  case "$fault" in backend-consumer|postgres|mosquitto|network) ;; *) echo "Invalid fault: $fault" >&2; exit 2 ;; esac
done
acquire_operation_lock recovery
operation_locked=true
./scripts/test-mqtt.sh
for fault in "${faults[@]}"; do
  run_dir="$report_root/$fault"
  mkdir -p "$run_dir"
  echo "[TEST] $fault outage"
  fixture_active=true
  probe prepare
  if [ "$fault" = network ]; then
    network_detached=true
    docker network disconnect "$network_name" "$consumer_id"
  else
    interrupted_service="$fault"
    docker compose stop -t 10 "$fault"
  fi
  probe outage "$fault"
  restore_services
  probe replay
  probe cleanup
  fixture_active=false
  echo "[PASS] $fault recovered; ACK replay and original history verified"
done
printf '[PASS] All requested outage scenarios completed.\n'
