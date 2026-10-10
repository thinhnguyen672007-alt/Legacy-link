#!/bin/sh
# Container chuẩn bị chạy một lần với quyền root trước khi broker bật.
# Broker chính dùng user mosquitto; bước này sửa quyền file để user đó đọc/ghi được.
# UID/GID lấy từ image đang chạy, không đoán theo tài khoản máy host.
set -eu

# Chỉ tạo trên lần đầu; chạy lại không xóa tài khoản MQTT đã được thêm sau đó.
if [ ! -e /mosquitto/config/passwd ]; then
  [ -n "${MQTT_USERNAME:-}" ] && [ -n "${MQTT_PASSWORD:-}" ] || {
    echo 'Missing MQTT credentials' >&2; exit 1;
  }
  umask 077
  mosquitto_passwd -c -b /mosquitto/config/passwd.new "$MQTT_USERNAME" "$MQTT_PASSWORD"
  mv /mosquitto/config/passwd.new /mosquitto/config/passwd
fi
[ -f /mosquitto/config/passwd ] && [ -s /mosquitto/config/passwd ] || {
  echo 'Missing or empty Mosquitto passwd file' >&2; exit 1;
}

# Chỉ chủ sở hữu đọc/ghi passwd (0600) vì file chứa hash tài khoản MQTT.
broker_owner="$(id -u mosquitto):$(id -g mosquitto)"
chown "$broker_owner" /mosquitto/config/passwd
chmod 0600 /mosquitto/config/passwd

# Data/log nằm ngoài container để recreate broker vẫn giữ trạng thái và bằng chứng.
# Quyền thư mục cho phép đi vào; file log riêng chỉ cho owner đọc/ghi.
mkdir -p /mosquitto/data /mosquitto/log
chown -R "$broker_owner" /mosquitto/data /mosquitto/log
chmod 0755 /mosquitto/data /mosquitto/log
touch /mosquitto/log/mosquitto.log
chown "$broker_owner" /mosquitto/log/mosquitto.log
chmod 0600 /mosquitto/log/mosquitto.log

echo "Mosquitto password, data and log permissions ready."
