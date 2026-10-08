#!/usr/bin/env bash
# Cập nhật IP broker trong local_settings.h của firmware.
# Dùng: ./connect.sh <ip_lan>
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Dùng: $0 <ip_lan>" >&2
  exit 2
fi

IP="$1"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$ROOT/firmware/legacy-link-core/include"
CFG="$DIR/local_settings.h"

# Chưa có thì copy từ example, có rồi thì giữ nguyên SSID/password WiFi.
if [ ! -f "$CFG" ]; then
  cp "$DIR/local_settings.example.h" "$CFG"
  echo "[INFO] Tao local_settings.h tu example — nho sua WIFI_SSID/WIFI_PASSWORD."
fi

sed -i "s/#define LEGACYLINK_MQTT_HOST .*/#define LEGACYLINK_MQTT_HOST \"$IP\"/" "$CFG"
echo "[OK] LEGACYLINK_MQTT_HOST = $IP"

echo "Buoc tiep: cd firmware/legacy-link-core && pio run -t upload && pio device monitor"
