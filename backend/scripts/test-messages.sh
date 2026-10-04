#!/usr/bin/env bash
# scripts/test-messages.sh
# Ban thu tat ca cac loai message de kiem tra backend, roi in ket qua database.
#
# Cach chay:
#     cd ~/Legacy-link/backend
#     bash scripts/test-messages.sh
#
# Yeu cau truoc khi chay:
#     1. docker start legacy-link-postgres
#     2. docker start legacy-link-mosquitto
#     3. npm start          <- o terminal khac, va da thay dong "Da subscribe"

set -u

MOSQUITTO=legacy-link-mosquitto
POSTGRES=legacy-link-postgres
PGUSER=legacy_admin
PGDB=legacy_link
MQUSER=legacy_admin
MQPASS=legacy_secret_2026
TS=1789610731916

# Kiem tra hai container da chay chua, bao loi ro rang thay vi that bai kho hieu.
for c in "$MOSQUITTO" "$POSTGRES"; do
  if ! docker ps --format '{{.Names}}' | grep -q "^$c$"; then
    echo "LOI: container '$c' chua chay."
    echo "Chay lenh nay truoc:  docker start $c"
    exit 1
  fi
done

pub() {
  docker exec "$MOSQUITTO" mosquitto_pub -t "$1" -u "$MQUSER" -P "$MQPASS" -m "$2"
}

echo "=============================================="
echo " BAN THU MESSAGE"
echo "=============================================="

echo "[1] telemetry hop le"
pub legacy-link/devices/esp32-01/telemetry \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":$TS,\"metrics\":{\"temperature\":72.5,\"rpm\":1450}}"

echo "[2] status bat"
pub legacy-link/devices/esp32-01/status \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":$TS,\"status\":true}"

echo "[3] status tat"
pub legacy-link/devices/esp32-01/status \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":1789610740000,\"status\":false}"

echo "[4] status bat lai  (de online quay ve t)"
pub legacy-link/devices/esp32-01/status \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":1789610750000,\"status\":true}"

echo "[5] alarm OVERHEAT"
pub legacy-link/devices/esp32-01/alarm \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":$TS,\"code\":\"OVERHEAT\",\"severity\":\"high\",\"value\":95.2}"

echo "[6] alarm OVERHEAT lan nua  (phai bi chan trung lap)"
pub legacy-link/devices/esp32-01/alarm \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":$TS,\"code\":\"OVERHEAT\",\"severity\":\"high\",\"value\":95.2}"

echo "[7] du lieu ban  (phai bi tu choi, backend phai song)"
pub legacy-link/devices/esp32-01/telemetry \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":$TS,\"metrics\":{\"doAm\":55}}"
pub legacy-link/devices/esp32-01/status \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":$TS,\"status\":\"true\"}"
pub legacy-link/devices/esp32-01/alarm \
  "{\"schemaVersion\":1,\"deviceId\":\"esp32-01\",\"timestamp\":$TS,\"code\":\"BAY_LA\",\"severity\":\"high\"}"

echo
echo "=============================================="
echo " KET QUA TRONG DATABASE"
echo "=============================================="

echo "--- telemetry: moi lan ban them la mot dong moi ---"
docker exec "$POSTGRES" psql -U "$PGUSER" -d "$PGDB" \
  -c "SELECT id, device_id, ts, metrics FROM telemetry ORDER BY id DESC LIMIT 5;"

echo "--- machine_state: online phai la 't', last_metrics PHAI CON du lieu ---"
docker exec "$POSTGRES" psql -U "$PGUSER" -d "$PGDB" \
  -c "SELECT device_id, online, last_metrics FROM machine_state;"

echo "--- alarms: ban OVERHEAT hai lan nhung PHAI chi co mot dong ---"
docker exec "$POSTGRES" psql -U "$PGUSER" -d "$PGDB" \
  -c "SELECT id, code, severity, value, acknowledged_at FROM alarms ORDER BY id DESC LIMIT 5;"

echo
echo "Xong. Bay gio quay lai terminal dang chay 'npm start' de xem log backend."
