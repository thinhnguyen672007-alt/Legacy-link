# Firmware / C16 integration handoff

Baseline: backend merged in `11306a9`. Firmware keeps schemaVersion 1 and existing
topics. No new telemetry field or configVersion is required by this integration.

## Plain MQTT demo

The selected transport is plaintext on the private demo LAN, usually port 1883.
ESP32 uses `WiFiClient`; configure a bare broker IP/DNS name in ignored
`local_settings.h`. Infrastructure Compose explicitly sets
`MQTT_ALLOW_PLAINTEXT=true` for both backend processes. With the separate backend
Compose, set the same variable in `.env.compose` alongside `MQTT_URL=mqtt://...`.
Credentials are still required. This choice does not provide encryption or TLS
acceptance. Do not publish the plaintext broker to the Internet.

## C16 contracts

- Device and gateway must be registered. The earlier BENCH-01 run received
  `unknown_device`; registration on the actual demo backend must be verified.
- Config/probe expiry is checked on receipt and again before deferred execution.
  Expired, malformed or clock-unverifiable deadlines produce `stale_command`.
  Legacy commands without expiresAt remain supported. Loading saved NVS config
  after reboot does not reuse its original command deadline as a validity limit.
- Catalog wordOrder is supported as HIGH_FIRST/LOW_FIRST for UINT32. Register
  addresses remain raw protocol addresses. Scale is applied once by firmware.
- Backend C16 can accept identified telemetry against retired config history for
  seven days. Preserve exact original bytes, timestamp, device and message ID.
  Do not relabel old metrics or automatically clear a rejected head. The history
  policy is backend behavior; contract serializer tests do not prove DB acceptance.
- Profiles, operation persistence, request leases, HTTP tokens and rate limiting
  live in the backend. ESP32 continues consuming flat MQTT configs, not HTTP APIs.

## Remaining integration gates

The infrastructure proxy still needs alignment with backend bearer auth/CORS;
its old Authorization stripping is not fixed by selecting plaintext MQTT.
Infrastructure's 7-second watchdog must also allow the backend's 15-second drain.
Run C16 migrations, configure distinct read/write API tokens and choose one Compose
entrypoint before full-stack acceptance. These gates do not change the firmware
wire contract and are not evidence of an ESP32 defect.

Use [physical acceptance](firmware-physical-acceptance.md) for power loss, offline
queue, lost ACK, negative values and A/B profile tests. RAM buffers remain 32
telemetry / 8 alarms and are lost on power failure. No hardware run was performed
for this update.
