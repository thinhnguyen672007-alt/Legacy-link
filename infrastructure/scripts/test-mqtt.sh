#!/usr/bin/env bash
# Kiểm tra broker bằng kết quả thực: subscriber nhận đúng payload và anonymous bị từ chối.
# Topic nằm dưới legacy-link/test để không giả mạo telemetry của thiết bị thật.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
# Dùng client có sẵn trong container Mosquitto, host không cần cài mosquitto_pub/sub.
# Heredoc có dấu nháy: biến MQTT_USERNAME/PASSWORD được đọc bên trong container.
docker compose exec -T mosquitto sh -s <<'SH'
set -eu
# Thư mục tạm chứa kết quả nhận; trap dừng subscriber và dọn file khi kết thúc hoặc lỗi.
probe_dir=$(mktemp -d)
subscriber=''
trap 'if [ -n "$subscriber" ]; then kill "$subscriber" 2>/dev/null || true; wait "$subscriber" 2>/dev/null || true; fi; rm -rf "$probe_dir"' EXIT
probe_topic="legacy-link/test/probe-$$-$(date +%s)"
probe_payload="roundtrip-$$-$(date +%s)"
# Bật người nhận trước khi gửi; -C 1 nhận một tin rồi thoát, -W 8 giới hạn thời gian.
# QoS1 yêu cầu broker xác nhận ở tầng MQTT, chưa phải xác nhận đã ghi vào database.
mosquitto_sub -h 127.0.0.1 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "$probe_topic" -q 1 -C 1 -W 8 > "$probe_dir/received" &
subscriber=$!
# Subscriber chạy nền có thể chưa subscribe xong ngay lập tức, nên publish lặp có giới hạn.
# Payload cố định và topic riêng giúp đối chiếu chính xác, không chỉ tin vào dòng log gửi thành công.
i=0
while kill -0 "$subscriber" 2>/dev/null && [ "$i" -lt 12 ]; do
  timeout 3 mosquitto_pub -h 127.0.0.1 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "$probe_topic" -m "$probe_payload" -q 1
  sleep 0.25
  i=$((i+1))
done
# Chờ người nhận xong rồi so sánh nội dung. Publish thành công mà không nhận được thì vẫn lỗi.
wait "$subscriber"
subscriber=''
[ "$(cat "$probe_dir/received")" = "$probe_payload" ]
# Thử không truyền tài khoản: phải thất bại do bị từ chối xác thực.
# Kiểm tra cả thông báo lỗi để không nhầm broker chết/timeout với bảo vệ credential thành công.
if timeout 3 mosquitto_pub -h 127.0.0.1 -t "$probe_topic" -m denied -q 1 > "$probe_dir/anonymous" 2>&1; then
  echo '[FAIL] Anonymous publish was accepted' >&2
  exit 1
fi
grep -Ei 'not authori[sz]ed|not authorised|bad user name|not authorized' "$probe_dir/anonymous" > /dev/null
printf '[PASS] MQTT exact roundtrip; anonymous connection rejected.\n'
SH
