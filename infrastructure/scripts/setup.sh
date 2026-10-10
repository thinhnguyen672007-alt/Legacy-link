#!/usr/bin/env bash
# Dựng/nâng cấp stack: kiểm tra -> backup -> dừng worker -> migrate -> bật -> health.
# --seed tạo dữ liệu giả; --seed-bench đăng ký BENCH-01 với gateway ID thật trong .env.
# Không dùng script này để tiếp quản container cũ ngoài Compose: cần chuyển DB có kiểm soát.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
want_seed=false
want_bench=false
for arg in "$@"; do
  case "$arg" in
    --seed) WANT_SEED=true ;;
    --seed-bench) WANT_BENCH=true ;;
    -h|--help)
      # In khối header (sau shebang, tới hết dòng === thứ hai) đọc trực tiếp từ file,
      # không hardcode số dòng để help không bị cắt khi header dài ra.
      awk 'NR==1{next} {print} /^# =+$/{n++; if(n==2) exit}' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "[ERROR] Khong hieu tham so: '$arg'" >&2
      echo "        Dung: $0 [--seed] [--seed-bench] | $0 --help" >&2
      exit 2
      ;;
    --seed) want_seed=true;;
    --seed-bench) want_bench=true;;
    --help|-h) echo 'Usage: bash scripts/setup.sh [--seed | --seed-bench]'; exit 0;;
    *) echo "Unknown option: $arg" >&2; exit 2;;
  esac
done
if [ "$want_seed" = true ] && [ "$want_bench" = true ]; then
  echo 'Chon mot bo seed de tranh tron du lieu mau va bench.' >&2; exit 2
fi
command -v node >/dev/null || { echo 'Can Node >=22.9' >&2; exit 1; }
docker compose version >/dev/null || { echo 'Can Docker Compose v2 plugin' >&2; exit 1; }
docker info >/dev/null || { echo 'Docker chua san sang' >&2; exit 1; }
source scripts/operation-lock.sh
acquire_operation_lock setup
trap release_operation_lock EXIT
trap 'exit 130' INT TERM
requested_profiles="${COMPOSE_PROFILES:-}"
node scripts/prepare-env.mjs
source scripts/load-env.sh
export COMPOSE_PROFILES="${requested_profiles:-${COMPOSE_PROFILES:-full}}"
# URL DB của Compose ghép chuỗi; giới hạn ký tự trước khi ngắt bất kỳ dịch vụ nào.
for key in POSTGRES_USER POSTGRES_PASS POSTGRES_DB; do
  [[ "${!key:-}" =~ ^[a-zA-Z0-9_.~-]+$ ]] || { echo "Invalid $key: chi dung chu/so va _ . ~ -" >&2; exit 1; }
done
if [ "$want_bench" = true ] && ! [[ "${BENCH_GATEWAY_ID:-}" =~ ^[A-F0-9]{12}$ ]]; then
  echo 'Can BENCH_GATEWAY_ID 12 ky tu HEX hoa doc tu USB' >&2; exit 1
fi
# Chỉ parse, không in cấu hình đã nội suy vì cấu hình đó chứa bí mật.
docker compose config --quiet
project_name="$(docker compose config --format json | node -e 'let b="";process.stdin.on("data",x=>b+=x);process.stdin.on("end",()=>console.log(JSON.parse(b).name));')"
for name in "${MQTT_CONTAINER_NAME:-legacy-link-mosquitto}" "${POSTGRES_CONTAINER_NAME:-legacy-link-postgres}" "${CONSUMER_CONTAINER_NAME:-legacy-link-consumer}" "${API_CONTAINER_NAME:-legacy-link-api}"; do
  if owner="$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null)"; then
    if [ "$owner" != "$project_name" ]; then
      echo "Container $name thuoc cach chay/project khac; dung lai de bao ve DB dang dung." >&2
      echo 'Dung ten/cong rieng cho stack moi; backup/restore DB truoc khi chuyen cach trien khai.' >&2
      exit 1
    fi
  fi
done
# Build trước để lỗi tải dependency không làm ngừng hệ thống đang chạy.
docker compose build backend-api backend-consumer
if [[ ",$COMPOSE_PROFILES," == *,maintenance,* ]]; then docker compose build retention; fi
# Backup DB đang chạy trước mọi thay đổi. Lần cài đầu chưa có DB thì backup sau khi khởi tạo.
backed_up=false
if [ -n "$(docker compose ps --status running -q postgres)" ]; then
  bash scripts/backup-db.sh
  backed_up=true
fi
# Không dùng -c ghi đè toàn bộ passwd: công cụ giữ các user MQTT khác đã được tạo.
bash scripts/setup-mosquitto-auth.sh
docker compose stop backend-consumer backend-api api-gateway
# Named volume được giữ; không có down -v/reset/xóa telemetry trong quy trình nâng cấp.
docker compose up -d --wait --wait-timeout 90 postgres
docker compose up -d --force-recreate --wait --wait-timeout 90 mosquitto
if [ "$backed_up" = false ]; then bash scripts/backup-db.sh; fi
# Dùng migration của backend; runner tự phát hiện DB rỗng/cũ và khóa phiên migrate.
docker compose run --rm -T --no-deps --entrypoint node backend-api scripts/migrate.mjs
if [ "$want_seed" = true ]; then
  docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < ../backend/db/seed-demo.sql
fi
if [ "$want_bench" = true ]; then
  docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v gateway_id="$1"' sh "$BENCH_GATEWAY_ID" < ../backend/db/seed-bench.sql
fi
docker compose up -d --wait --wait-timeout 120

# ------------------------------------------------------------------------------
# 10. Kiểm tra broker
# ------------------------------------------------------------------------------
echo "[INFO] Kiem tra broker..."
if ! ./scripts/test-mqtt.sh; then
  echo "[WARN] Broker chua the truy cap. Xem dong ERROR o tren." >&2
  echo "[WARN] Dung chay lai: docker compose logs mosquitto" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 11. Tóm tắt
# ------------------------------------------------------------------------------
echo ""
echo "[SUCCESS] Ha tang da san sang."
echo ""
echo "  Broker   : $MQTT_CONTAINER_NAME (port ${MQTT_PORT:-1883})"
echo "  Database : $POSTGRES_USER@$POSTGRES_DB (port ${POSTGRES_PORT:-5432}, chi localhost)"
if [ "${table_count:-0}" -gt 0 ]; then
  echo "  Bang     : ${table_count}/15 bang (schema version ${schema_version:-0})"
else
  echo "  Bang     : chua nap schema (checkout nay khong co backend/)"
fi
echo ""
if [[ ",$COMPOSE_PROFILES," == *,full,* ]]; then
  # 0.0.0.0 là địa chỉ bind chứ không phải URL mở được; in localhost cho người đọc dễ bấm.
  api_host="${HTTP_BIND_ADDRESS:-127.0.0.1}"
  if [ "$api_host" = "0.0.0.0" ]; then api_host="127.0.0.1"; fi
  echo "  API      : http://${api_host}:${HTTP_PORT:-3000} (bind ${HTTP_BIND_ADDRESS:-127.0.0.1})"
  echo "  Auth     : Bearer API_READ_TOKEN (GET) va API_WRITE_TOKEN (POST), trong .env"
fi
echo "  Kiem tra : ./scripts/status.sh"
echo "  Xem trang thai : docker compose ps"
echo "  Xem log broker : docker compose logs -f mosquitto"
echo "  Doc log Postgres: docker compose logs -f postgres"
bash scripts/test-mqtt.sh
if [[ ",$COMPOSE_PROFILES," == *,full,* ]]; then bash scripts/status.sh; fi
echo '[PASS] Stack san sang. Token trong infrastructure/.env; khong gui file nay len Git.'
