#!/bin/sh
# Container chuẩn bị chạy một lần với quyền root trước khi broker bật.
# Broker chính dùng user mosquitto; bước này sửa quyền file để user đó đọc/ghi được.
# UID/GID lấy từ image đang chạy, không đoán theo tài khoản máy host.
set -eu

# File passwd phải tồn tại và có nội dung. Tạo tài khoản ở script auth trước;
# Bước setup phía host kiểm tra riêng trường hợp passwd bị tạo nhầm thành thư mục.
if [ ! -s /mosquitto/config/passwd ]; then
  echo "Missing or empty passwd file. Run ./scripts/setup-mosquitto-auth.sh first." >&2
  exit 1
fi

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
