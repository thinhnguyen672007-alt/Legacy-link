#!/usr/bin/env bash
# Kiểm tra nhanh trước demo: container, schema/heartbeat, HTTP và số bản ghi thực tế.
# Không in .env hoặc token. Nếu một bước lỗi, script trả lỗi để tránh hiểu nhầm là sẵn sàng.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Nạp .env qua parser an toàn (không thực thi .env như shell) để lấy token đọc.
if [ -f .env ]; then source scripts/load-env.sh; fi
export COMPOSE_PROFILES="${COMPOSE_PROFILES:-full}"
# Up chỉ cho biết container đang chạy. Hai bước sau kiểm tra nó có làm việc được không.
docker compose ps
# Consumer phải truy vấn được schema và có heartbeat mới cho biết MQTT đã subscribe.
# API phải trả readiness 200; fetch có giới hạn 4 giây để không chờ vô hạn.
docker compose exec -T backend-consumer node /app/infra-check.cjs
docker compose exec -T backend-api node -e 'fetch("http://127.0.0.1:3000/health/ready",{signal:AbortSignal.timeout(4000)}).then(async r=>{console.log("API readiness:",r.status,await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))'
# Kiểm tra cả Nginx: API bên trong tốt nhưng proxy hỏng thì trình duyệt vẫn không xem được.
# Đây là đường đi gateway -> API; khả năng máy khác truy cập LAN còn tùy IP/firewall.
docker compose exec -T api-gateway wget -q -O - http://127.0.0.1/health/ready
printf '\n[PASS] API gateway routes readiness successfully.\n'
docker compose exec -T frontend wget -q -O - http://127.0.0.1/health
docker compose exec -T frontend wget -q -O - http://127.0.0.1/api/health/ready
printf '\n[PASS] Frontend and its API proxy are ready.\n'
# Đường frontend thật đi qua gateway và cần token đọc. Token thiếu/sai phải lộ ra ở đây,
# không chỉ ở lúc demo. wget trả lỗi khi backend từ chối (401/403).
if [ -n "${API_READ_TOKEN:-}" ]; then
  docker compose exec -T -e TOKEN="$API_READ_TOKEN" api-gateway \
    sh -c 'wget -q -O /dev/null --header="Authorization: Bearer $TOKEN" http://127.0.0.1/machines'
  printf '[PASS] Authenticated read through the gateway (API_READ_TOKEN accepted).\n'
fi
docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
-- Chỉ đọc số lượng, không tạo mẫu giả. Có dữ liệu cũ không đồng nghĩa ESP32 đang gửi.
-- Thiết bị phải được đăng ký riêng; lịch sử telemetry không thay thế bảng device.
SELECT (SELECT count(*) FROM device) AS registered_devices,
       (SELECT count(*) FROM telemetry) AS telemetry_rows,
       (SELECT count(*) FROM alarms) AS alarm_rows;
SELECT CASE WHEN EXISTS(SELECT 1 FROM device WHERE device_id='BENCH-01')
  THEN 'BENCH-01 registered: verify gateway ID against physical ESP32'
  ELSE 'BENCH-01 absent: set real BENCH_GATEWAY_ID and run setup.sh --seed-bench' END AS bench_status;
SQL
