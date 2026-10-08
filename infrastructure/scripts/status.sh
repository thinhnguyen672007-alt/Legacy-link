#!/usr/bin/env bash
# Short demo preflight; no passwords or tokens are printed.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
export COMPOSE_PROFILES=full
docker compose ps
docker compose exec -T backend-consumer node /app/infra-check.cjs
docker compose exec -T backend-api node -e 'fetch("http://127.0.0.1:3000/health/ready",{signal:AbortSignal.timeout(4000)}).then(async r=>{console.log("API readiness:",r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))'
# Test the actual public entry service as well as the Node process.
docker compose exec -T api-gateway wget -q -O - http://127.0.0.1/health/ready
printf '\n[PASS] API gateway routes readiness successfully.\n'
docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
SELECT (SELECT count(*) FROM device) AS registered_devices,
       (SELECT count(*) FROM telemetry) AS telemetry_rows,
       (SELECT count(*) FROM alarms) AS alarm_rows;
SELECT CASE WHEN EXISTS(SELECT 1 FROM device WHERE device_id='BENCH-01')
  THEN 'BENCH-01 registered: verify gateway ID against physical ESP32'
  ELSE 'BENCH-01 absent: set real BENCH_GATEWAY_ID and run setup.sh --seed-bench' END AS bench_status;
SQL
