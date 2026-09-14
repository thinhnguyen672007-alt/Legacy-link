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

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables if .env exists
if [ -f "$INFRA_DIR/.env" ]; then
  # shellcheck disable=SC1091
  source "$INFRA_DIR/.env"
fi

CONTAINER_NAME="${MQTT_CONTAINER_NAME:-legacy-link-mosquitto}"
USERNAME="${MQTT_DEV_USER:-legacy_admin}"
PASSWORD="${MQTT_DEV_PASS:-legacy_secret_2026}"
TEST_TOPIC="legacy-link/test/ping"
TEST_PAYLOAD="{\"test\":\"ping\",\"timestamp\":$(date +%s)}"

echo "[INFO] Testing Mosquitto container: '$CONTAINER_NAME'..."

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[ERROR] Container '$CONTAINER_NAME' is not running!"
  echo "        Run 'docker compose up -d' first to start the infrastructure."
  exit 1
fi

echo "[INFO] Publishing test message to '$TEST_TOPIC' as user '$USERNAME'..."

# Execute mosquitto_pub directly inside the running container
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
