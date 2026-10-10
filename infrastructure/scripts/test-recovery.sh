#!/usr/bin/env bash
# Diễn tập phục hồi có chủ đích: script sẽ tắt dịch vụ hoặc ngắt mạng đang chạy.
# Mỗi bài dùng gateway/thiết bị giả riêng; không thay firmware hay cấu hình BENCH-01.
# Chỉ chạy lúc kiểm thử vì có gián đoạn, và chỉ chạy một bài với setup nhờ operation lock.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
infra_root="$PWD"
source ./scripts/operation-lock.sh
operation_locked=false
# shellcheck disable=SC1091
source ./scripts/load-env.sh
export COMPOSE_PROFILES=full API_WRITE_TOKEN API_READ_TOKEN
umask 077
# Evidence lưu fixture và kết quả theo từng lần chạy; reports/ không được đưa lên Git.
# Các cờ bên dưới ghi lại phần nào đã thay đổi để cleanup biết phải phục hồi gì.
report_root="$infra_root/reports/recovery-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$report_root"
interrupted_service=''
network_detached=false
fixture_active=false
# Đọc ID container consumer muộn nhất có thể: các bài outage trước có thể đã recreate nó.
consumer_id=''
network_name="${DOCKER_NETWORK_NAME:-legacy-link-net}"
run_dir=''
# Tạo container kiểm thử tạm từ cùng image consumer, override entrypoint để chạy probe.
# --no-deps tránh tự bật dependency trong lúc đang muốn chứng minh nó bị ngắt.
# Token chỉ được truyền qua môi trường; không đặt giá trị token trong câu lệnh/log.
probe() {
  docker compose run --rm -T --no-deps -e API_WRITE_TOKEN -e API_READ_TOKEN \
    -v "$infra_root/scripts/delivery-check.cjs:/app/infra-delivery.cjs:ro,z" \
    -v "$run_dir:/evidence:z" --entrypoint node backend-consumer \
    /app/infra-delivery.cjs "$@"
}
# Gắn lại mạng hoặc bật đúng service đã bị ngắt; --wait chờ health thay vì chỉ chờ process Up.
# Không xóa volume database khi phục hồi.
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
# Luôn cố phục hồi service trước, rồi mới xóa mẫu thử và nhả khóa.
# Giữ mã lỗi gốc để bài test thất bại không bị báo thành công chỉ vì cleanup thành công.
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
# Không truyền tham số thì thử đủ bốn tình huống. Có thể truyền postgres hoặc network
# để chạy riêng bài đang cần kiểm tra; tên ngoài danh sách bị từ chối trước khi gây gián đoạn.
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
  # Đánh dấu trước prepare: nếu prepare chỉ làm được một phần thì cleanup vẫn thử dọn.
  fixture_active=true
  probe prepare
  if [ "$fault" = network ]; then
    # Bài trước có thể đã recreate container consumer, nên ID đọc lúc đầu script
    # có thể đã cũ. Đọc lại ngay trước khi ngắt mạng, nếu không Docker báo
    # "No such container" và bài network dừng giữa chừng.
    consumer_id="$(docker compose ps -q backend-consumer)"
    [ -n "$consumer_id" ] || { echo '[ERROR] backend-consumer is not running' >&2; exit 1; }
    network_detached=true
    docker network disconnect "$network_name" "$consumer_id"
  else
    interrupted_service="$fault"
    docker compose stop -t 130 "$fault"
  fi
  # Trong outage phải thấy readiness lỗi và không có ACK committed cho mẫu chưa lưu.
  # Sau phục hồi phải nhận đúng ACK, đủ bản ghi, chống trùng và giữ lịch sử trước bài thử.
  probe outage "$fault"
  restore_services
  probe replay
  probe cleanup
  fixture_active=false
  echo "[PASS] $fault recovered; ACK replay and original history verified"
done
printf '[PASS] All requested outage scenarios completed.\n'
