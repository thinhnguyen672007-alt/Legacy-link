#!/usr/bin/env bash
# Assert authenticated publish/subscribe and anonymous rejection. No device topics.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
docker compose exec -T mosquitto sh -s <<'SH'
set -eu
probe_dir=$(mktemp -d)
subscriber=''
trap 'if [ -n "$subscriber" ]; then kill "$subscriber" 2>/dev/null || true; wait "$subscriber" 2>/dev/null || true; fi; rm -rf "$probe_dir"' EXIT
probe_topic="legacy-link/test/probe-$$-$(date +%s)"
probe_payload="roundtrip-$$-$(date +%s)"
mosquitto_sub -h 127.0.0.1 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "$probe_topic" -q 1 -C 1 -W 8 > "$probe_dir/received" &
subscriber=$!
# Retry publication until the bounded subscriber receives one exact payload.
i=0
while kill -0 "$subscriber" 2>/dev/null && [ "$i" -lt 12 ]; do
  timeout 3 mosquitto_pub -h 127.0.0.1 -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" -t "$probe_topic" -m "$probe_payload" -q 1
  sleep 0.25
  i=$((i+1))
done
wait "$subscriber"
subscriber=''
[ "$(cat "$probe_dir/received")" = "$probe_payload" ]
if timeout 3 mosquitto_pub -h 127.0.0.1 -t "$probe_topic" -m denied -q 1 > "$probe_dir/anonymous" 2>&1; then
  echo '[FAIL] Anonymous publish was accepted' >&2
  exit 1
fi
grep -Ei 'not authori[sz]ed|not authorised|bad user name|not authorized' "$probe_dir/anonymous" > /dev/null
printf '[PASS] MQTT exact roundtrip; anonymous connection rejected.\n'
SH
