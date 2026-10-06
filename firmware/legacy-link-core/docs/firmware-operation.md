# Firmware operation and integration checklist

## Site settings

Copy `include/local_settings.example.h` to `include/local_settings.h` before
building. This ignored file contains Wi-Fi credentials, MQTT host/port and
credentials, the primary NTP server, and optional RS-485 direction GPIO. Use a
broker reachable from the ESP32; `localhost` is not the backend computer.
Wi-Fi placeholders must be replaced before connecting. MQTT defaults and the
example header use the agreed shared hackathon account, `legacy_admin` /
`legacy_secret_2026`. An existing `local_settings.h` overrides those defaults;
update its MQTT credentials too if it still uses the old account.
These settings require a rebuild;
machine register maps and thresholds can change at runtime through Serial/MQTT.

UART2 uses TX GPIO17 and RX GPIO16. A suitable 3.3 V-compatible RS-485
transceiver is required for an RS-485 bus. With automatic direction, leave
`LEGACYLINK_RS485_DE_RE_PIN` at `-1`. For a transceiver whose DE and active-low
/RE pins are tied together, select a suitable free output GPIO (for example 23).
Firmware drives it HIGH while transmitting, then LOW after UART transmission
finishes, before waiting for the response. This is a compile-time board wiring
setting, not a remotely configurable machine parameter. Confirm voltage levels,
pinout, grounding and bus termination against the adapter/device documentation.

## Configuration persistence

Only a fully validated configuration is applied and saved. The NVS namespace
`legacy-link`, key `config`, stores the complete JSON including its terminator,
with a maximum payload of 4095 UTF-8 bytes. On boot, length/terminator checks and
the same semantic parser run before UART settings or polling are restored.
Missing or corrupt data leaves a fresh boot waiting for configuration.

Identical settings do not rewrite flash or rearm alarms. A failed flash write
does not stop a valid new configuration from running in RAM: the ACK reports
`persisted: false` and `storage_error`. Retrying the same configuration retries
the write. Until a save succeeds, a reset may restore the previous saved config.
Flash storage is not an offline telemetry or alarm queue. Alarm suppression
state resets at boot; an ongoing alarm may be reported again after restart.

A retained MQTT config is authoritative when received and can replace a newer
Serial config or the saved one. Keep the retained message current when changing
device assignments; identical redelivery is harmless. Factory erase clears NVS.

## Configuration acknowledgement contract

Firmware accepts configs on `legacy-link/gateways/{gatewayId}/config` and, after
provisioning, `legacy-link/devices/{deviceId}/config`. It publishes results on:

```text
legacy-link/gateways/{gatewayId}/config/ack
```

Optionally add a top-level `requestId` to the normal config JSON. It must be a
nonempty string of at most 64 UTF-8 bytes without embedded NUL. It counts toward
the 4095-byte payload limit. It correlates a response; it is not a replay filter
or config version. A successful response looks like:

```json
{
  "schemaVersion": 1,
  "gatewayId": "123456789ABC",
  "deviceId": "esp32-01",
  "requestId": "config-42",
  "result": "applied",
  "reason": "ok",
  "persisted": true,
  "timestamp": 1791244800123
}
```

`result` is `applied`, `unchanged`, or `rejected`. Reasons are `ok`,
`storage_error`, `invalid_payload`, `invalid_config`, `device_id_mismatch`,
`out_of_memory`, `apply_failed`, or `busy`. `deviceId` and `persisted` describe
the **active** configuration, including on rejection; absent active config means
no device ID and `persisted: false`. Malformed payloads and callback-level
rejections may lack `requestId`. `timestamp` is omitted if the clock is not
synchronized. This is a separate gateway protocol, not a device status payload;
backend device validators must not be reused for it.

ACKs are non-retained QoS 0. Firmware keeps only the latest unsent ACK and retries
it while connected; a later result can replace it. Only one config can wait for
application. Send **one request at a time per gateway**, subscribe before sending,
match the request ID, and retry the same config if the result is not received.
Do not assume every burst request receives an ACK. A successful publish does
not prove backend receipt. Broker ACLs must allow the gateway to publish this
topic and the provisioning service to subscribe. The backend still needs a
publisher/ACK consumer; this firmware does not call the HTTP catalog endpoint.

## Polling and network behavior

The main loop reads one register entry per iteration (two words for UINT32).
While ModbusMaster waits for response bytes, its idle callback attempts network
service every 10 ms and yields CPU time. A config received during a transaction
is copied into a pending buffer; validation, UART reconfiguration and flash
writes happen after the transaction. A changed config cancels the partial scan,
so old/new maps never share one telemetry payload.

`samplingIntervalMs` is the target start-to-start scan interval, not a deadline.
If reads exceed it, the next scan starts after the current one completes. Failed
reads are omitted, and an all-failed scan sends no telemetry. Readings in a scan
are sequential, not simultaneous; the payload timestamp is publication time.
Alarms are evaluated after the complete scan. With 16 absent registers and the
library's 2-second response timeout, a scan can take about 32 seconds and delay
alarm evaluation accordingly. Choose the map and interval for the equipment.

The host regression test simulates this 32-second wait and checks network-service
gaps of at most 10 ms. This is not a physical timing guarantee: MQTT connection
and socket reads can block, UART traffic and OS scheduling affect timing, and
there is no hard real-time or machine shutdown function. MQTT socket read timeout
is set to one second. Telemetry/alarms are QoS 0 with no offline history queue.

Retained online status means the gateway is connected, not that Modbus reads
succeed. The retained Last Will reports unexpected disconnection after broker
detection. Its timestamp is the connection time, not the power-loss time; see
[backend alignment](backend-alignment.md). Synchronized NTP time is required for
device telemetry/status/alarms and a provisioned MQTT connection.

## Acceptance checks with hardware

Host tests and builds cover the software paths. Before calling a deployment
complete, record firmware/backend versions and verify:

1. Actual adapter wiring and signed/unsigned values, scale, raw addresses and
   UINT32 word order against a Modbus source.
2. A valid config produces a matching ACK with `persisted: true`; invalid input
   preserves the running map. Reboot without a broker and confirm flash recovery.
3. Disconnect the Modbus source for a full scan: MQTT should stay connected and
   recover readings when the source returns. Repeat config delivery during a wait.
4. Observe telemetry at the intended broker and confirm database rows on the
   real backend. A Serial publish log alone is insufficient.
5. Test configured alarm thresholds, critical escalation, hysteresis and reconnect
   behavior using a simulator. Use machine-approved limits before deployment.
6. Remove power and confirm retained offline status after the broker timeout;
   restore power/Wi-Fi and check NTP, identity and retained config behavior.

Backend coordination remains necessary: include alarms in the catalog output,
agree on supported low-alarm codes, route catalog configs to MQTT and consume
ACKs. Current backend `9a7afa6` accepts torque but omits alarms from catalog mapping.
