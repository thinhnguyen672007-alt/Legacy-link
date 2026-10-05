#!/usr/bin/env bash
# ==============================================================================
# [NOTE] MQTT Connectivity Healthcheck Script (test-mqtt.sh)
#
# Role: Quick verification script to test if the Mosquitto broker is running,
# reachable, and properly enforcing user authentication.
#
# Usage:
#   chmod +x ./scripts/test-mqtt.sh
#   ./scripts/test-mqtt.sh
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Chế độ nghiêm ngặt (Strict Mode)
# ------------------------------------------------------------------------------
# - SÝ NGHĨA TỪNG CỜ:
#   * -e (errexit):  Dừng script ngay khi lệnh trả về exit code khác 0.
#   * -u (nounset):  Dừng và báo lỗi nếu dùng biến chưa khai báo.
#   * -o pipefail:  Trong `A | B | C`, nếu A hoặc B lỗi thì cả chuỗi coi là lỗi,
#                   thay vì chỉ nhìn kết quả của lệnh cuối C.
# - NẾU THIẾU:
#   * `docker exec` thất bại sẽ bị bỏ qua, script vẫn chạy tiếp rồi in
#     "[SUCCESS]" — bạn tin nhầm rằng broker khỏe trong khi lệnh vừa hỏng.
#   * Gõ sai tên biến sẽ biến thành chuỗi rỗng, dễ dẫn tới `docker exec ""`
#     và thông báo lỗi khó hiểu.
# - Ghi chú về `grep -q` ở dưới: -q (quiet) kết hợp với -e là pattern quen thuộc.
#   grep -q trả về 0 khi CÓ kết quả, nên khi đặt sau `!` trong `if !` thì nhánh
#   trong `then` là trường hợp "không tìm thấy". Chi tiết giải thích ở Mục 3.
set -euo pipefail

# ------------------------------------------------------------------------------
# 2. Xác định đường dẫn tuyệt đối
# ------------------------------------------------------------------------------
# - ${BASH_SOURCE[0]}: đường dẫn tới chính file script đang chạy (tên biến đặc
#   biệt của Bash). Nhờ đó lấy được đường dẫn kể cả khi script được gọi từ
#   thư mục khác, hoặc được `source` thay vì chạy trực tiếp.
#   (Với $0 thì khi `source` file này, $0 vẫn là tên shell -> sai đường dẫn.)
# - dirname: lấy thư mục chứa file script.
# - `cd ... && pwd`: đổi thư mục rồi in ra đường dẫn TUYỆT ĐỐI đã chuẩn hoá
#   (không còn dạng ./ hoặc ../).
# - `$( )`: command substitution — gom kết quả của lệnh bên trong thành chuỗi.
# - NẾU BỎ:
#   * Script chỉ chạy được khi bạn đứng đúng thư mục `infrastructure/`.
#     Chạy từ thư mục gốc repo là `source` nhầm file, hoặc báo không tìm thấy.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Thư mục cha của SCRIPT_DIR chính là thư mục `infrastructure`.
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

# ------------------------------------------------------------------------------
# 3. Nạp biến môi trường từ .env (nếu có)
# ------------------------------------------------------------------------------
# - `if [ -f ... ]`: chỉ nạp khi file thật sự tồn tại. Bắt buộc phải có điều kiện
#   này vì có `set -e`: gọi thẳng `source` một file không tồn tại sẽ làm script
#   dừng ngay lập tức với lỗi "No such file or directory".
# - Vì sao cần nạp: nhờ đó script tự lấy tên container, user và mật khẩu mà
#   bạn đã đặt trong .env, thay vì ghi cứng. Đổi .env là script đổi theo.
# - `# shellcheck disable=SC1091`: dòng này KHÔNG chạy, chỉ dành cho shellcheck
#   (công cụ lint shell). Shellcheck không theo dõi được biến sinh ra sau khi
#   source nên cảnh báo "biến có thể chưa được định nghĩa"; dòng disable nói
#   với nó: biết rồi, bỏ qua. Xoá dòng này thì script chạy y hệt.
if [ -f "$INFRA_DIR/.env" ]; then
  # shellcheck disable=SC1091
  source "$INFRA_DIR/.env"
fi

# ------------------------------------------------------------------------------
# 4. Gán biến với giá trị mặc định (Fallback)
# ------------------------------------------------------------------------------
# - Cú pháp ${TÊN_BIẾN:-giá_trị_mặc_định}: nếu TÊN_BIẾN chưa có HOẶC rỗng thì
#   dùng giá trị mặc định.
# - `:-` là viết ngắn của if-else 5 dòng:
#     if [ -n "${MQTT_CONTAINER_NAME:-}" ]; then X=...; else X=...; fi
# - Nhờ vậy script chạy được cả khi người dùng chưa tạo .env: cứ lấy giá trị
#   mặc định giống hệt .env.example rồi chạy.
CONTAINER_NAME="${MQTT_CONTAINER_NAME:-legacy-link-mosquitto}"
USERNAME="${MQTT_DEV_USER:-legacy_admin}"
PASSWORD="${MQTT_DEV_PASS:-legacy_secret_2026}"

# Topic thử nghiệm nằm dưới nhánh `legacy-link/test/`, TÁCH BIỆT hoàn toàn với
# `legacy-link/devices/` — nơi dữ liệu máy thật đi qua. Publish vào test topic
# không đụng tới lịch sử thiết bị nào, và subscriber của backend (đang nghe
# `legacy-link/devices/+/telemetry`) sẽ KHÔNG nhận được tin này.
TEST_TOPIC="legacy-link/test/ping"

# Payload có timestamp Unix giây lấy động từ `date +%s`.
# - `$(date +%s)`: +s là định dạng "seconds since Epoch" (giây).
# - Dấu `\` trước dấu " bên trong chuỗi để ESCAPE: không có nó, Bash sẽ cắt
#   chuỗi ngay tại dấu " đầu tiên và bạn sẽ có payload cụt cục.
TEST_PAYLOAD="{\"test\":\"ping\",\"timestamp\":$(date +%s)}"

echo "[INFO] Testing Mosquitto container: '$CONTAINER_NAME'..."

# ------------------------------------------------------------------------------
# 5. Kiểm tra container có đang chạy không
# ------------------------------------------------------------------------------
# - `docker ps`: liệt kê container ĐANG CHẠY (thêm `-a` mới thấy cả container
#   đã dừng). Không có -a nên container ở trạng thái Exited sẽ không xuất hiện.
# - `--format '{{.Names}}'`: chỉ in ra cột tên, thay vì bảng nhiều cột. Nhờ vậy
#   grep so khớp được, không dính ký tự thừa từ cột khác.
# - `-q` (quiet): tìm thấy là thoát ngay, KHÔNG in dòng kết quả ra. Ta chỉ cần
#   biết có/không, không cần xem tên.
# - `^...$`: neo đầu và cuối dòng, bắt buộc khớp TRÒN VẸN tên container.
#   Thiếu `$` thì tên "legacy-link-mosquitto-abc" cũng khớp với
#   "legacy-link-mosquitto" và ta tưởng container đã chạy.
# - `if !` đảo ngữ: grep trả 0 (tìm thấy) -> `!` đổi thành 1 -> không vào
#   nhánh then. Vào nhánh then nghĩa là ĐANG chạy, còn lại là không chạy.
# - `if !` có chủ đích KHÔNG để script chết ngay (dù có `set -e`): ta muốn in
#   thông báo "chạy docker compose up -d trước" thay vì chết không nói lý do.
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[ERROR] Container '$CONTAINER_NAME' is not running!"
  echo "        Run 'docker compose up -d' first to start the infrastructure."
  exit 1
fi

echo "[INFO] Publishing test message to '$TEST_TOPIC' as user '$USERNAME'..."

# ------------------------------------------------------------------------------
# 6. Publish thử bằng mosquitto_pub BÊN TRONG container
# ------------------------------------------------------------------------------
# - `docker exec <container> <lệnh>`: chạy một lệnh bên trong container đang
#   chạy.
# - VÌ SAO KHÔNG CÀI mosquitto-clients TRÊN MÁY THẬT:
#   Lệnh `mosquitto_pub` đã có sẵn bên trong image eclipse-mosquitto. Chạy nó
#   qua docker exec giúp người mới clone repo chỉ cần Docker là test được, không
#   phải cài thêm gói hệ thống nào.
# - Cờ của mosquitto_pub:
#   * -t : topic đích (topic nhận).
#   * -m : nội dung tin nhắn (message).
#   * -u : username.
#   * -P : password. LƯU Ý -P viết HOA, ký tự -p viết thường là port.
# - Dấu `\` cuối mỗi dòng: nối liền lệnh nhiều dòng thành MỘT lệnh duy nhất.
#   Cũng như không có \` ở dấu " cuối ký tự.
# - `if docker exec ...; then`: khi lệnh này thành công (exit 0) thì in SUCCESS.
#   Nhưng lỗi của mosquitto_pub đã được docker exec in ra màn hình rồi, nên
#   nhánh else chỉ bổ sung gợi ý xem log ở đâu.
# - Ảnh hưởng của việc dùng `if` thay vì chỉ chạy thẳng: với `set -e`, một lệnh
#   thất bại ngoài if/while sẽ dừng cả script. Bọc trong if thì ta kiểm soát
#   được luồng và in thông báo lỗi của riêng mình.
if docker exec "$CONTAINER_NAME" mosquitto_pub \
  -t "$TEST_TOPIC" \
  -m "$TEST_PAYLOAD" \
  -u "$USERNAME" \
  -P "$PASSWORD"; then
  echo "[SUCCESS] Message published successfully!"
  echo "[SUCCESS] Mosquitto broker is healthy and authentication is working."
else
  echo "[ERROR] Failed to publish message. Check credentials or broker logs: 'docker compose logs mosquitto'."
  exit 1
fi

# ------------------------------------------------------------------------------
# 7. PHẠM VI THỰC TẾ CỦA SCRIPT NÀY
# ------------------------------------------------------------------------------
# Script chỉ chứng minh được: broker đang chạy, và tài khoản trong .env đăng
# nhập được (mosquitto_pub thành công nghĩa là broker đã chấp nhận user/pass).
#
# Script KHÔNG chứng minh được: có thực sự NHẬN lại tin nhắn. Không có lệnh
# subscribe nào ở đây, nên nếu broker nhận tin rồi vứt đi, script vẫn báo
# SUCCESS. Muốn kiểm tra vòng tròn đủ (publish + nhận lại) thì mở hai terminal
# như hướng dẫn ở Mục 8 của docs/runbook.md.
#
# Script cũng KHÔNG đụng tới database: không kiểm tra Postgres có chạy, và bảng
# có tồn tại không. Việc đó thuộc về backend, xem `docker compose ps` (thấy
# healthy) và `psql -c '\dt'`.
