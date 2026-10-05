#!/bin/sh
# Run as root in a one-shot container before the broker starts.
set -eu

if [ ! -s /mosquitto/config/passwd ]; then
  echo "Missing or empty passwd file. Run ./scripts/setup-mosquitto-auth.sh first." >&2
  exit 1
fi

broker_owner="$(id -u mosquitto):$(id -g mosquitto)"
chown "$broker_owner" /mosquitto/config/passwd
chmod 0600 /mosquitto/config/passwd

mkdir -p /mosquitto/data /mosquitto/log
chown -R "$broker_owner" /mosquitto/data /mosquitto/log
chmod 0755 /mosquitto/data /mosquitto/log
touch /mosquitto/log/mosquitto.log
chown "$broker_owner" /mosquitto/log/mosquitto.log
chmod 0600 /mosquitto/log/mosquitto.log

echo "Mosquitto password, data and log permissions ready."
