# Commissioning demo: configure, test, apply, verify

This implementation provides a frontend-independent commissioning API:

`HTTP client -> control API -> MQTT -> ESP32 -> MQTT reply -> HTTP operation`

The team frontend can consume this API without receiving broker credentials. The HTTP process now also needs
an MQTT connection; run it alongside the existing MQTT/database consumer.

## Bring up the demo

1. Run the updated `backend/db/schema.sql` against the team's PostgreSQL database.
   It adds columns with `IF NOT EXISTS` and does not drop existing data.
2. In `backend`, run `npm ci`. Use the existing `.env` with MQTT and PostgreSQL
   credentials. Start `npm start` (telemetry consumer) and, in a second terminal,
   `npm run start:http` (HTTP plus configuration control).
3. Build and upload the updated ESP32 firmware. Set the reachable broker IP and
   Wi-Fi credentials in the ignored `include/local_settings.h`. Identify USB
   ports from `/dev/serial/by-id`; port numbers can change after reconnecting.
4. Use curl, Postman or the team's frontend to call the HTTP routes below.
   This change does not ship a frontend.
5. Get the reporting gateway ID from `GET /gateways`. Prepare a firmware-shaped
   machine config using the example below and edit it for the machine manual.
   Register maps are configured explicitly, not automatically discovered.

Example schema command when using the repository's Docker stack:

```bash
docker exec -i legacy-link-postgres psql -U legacy_admin -d legacy_link < backend/db/schema.sql
```

Use a trusted demo LAN. The existing HTTP API has no user authentication and
allows cross-origin browser access. Do not expose the control API publicly.
MQTT credentials and ACLs must permit the control topics listed below.

## OpenModSim and the demo sequence

Use the USB–TTL adapter's port, not the ESP32 programming port. Configure RTU
slave 1, 9600 baud, 8N1, no flow control, FC03 holding registers, raw addresses
0 through 49. See the firmware wiring guide for the 3.3 V TTL connection.

| Raw address | Raw value | Meaning |
| --- | --- | --- |
| 0 | 250 | Profile A: temperature 25 C, INT16 x 0.1 |
| 1 | 123 | Current 1.23 A, UINT16 x 0.01 |
| 2 | 1500 | Speed 1500 rpm, UINT16 x 1 |
| 49 | 420 | Profile B: temperature 42 C, INT16 x 0.1 |

1. Probe profile A (temperature address 0). Inspect raw words, decoded raw values
   and converted values in the operation response. `1200 x 0.1 = 120 C`; INT16
   raw word `65356` decodes to `-180`, then becomes `-18 C`.
2. Edit the address or scale and attempt apply with the old probe request ID.
   The backend must reject the changed draft. Probe that exact config again.
3. Probe an address outside the simulator map. A failed register read blocks apply.
   Restore the map and probe again. Optional expected min/max use converted units;
   out-of-range results require `acceptWarnings: true`, but cannot prove a mapping
   is correct.
4. Apply within 60 seconds of a successful probe. Poll the returned operation ID:
   `received`, `applied` and `persisted` are separate evidence. The catalog is
   registered only after application acknowledgment. Catalog database failure can
   occur even when ESP32 has already applied the config.
5. Press EN to restart ESP32 and keep polling the apply operation. Confirmation
   requires `restoredAfterRestart: true`: same saved request ID in a different boot.
6. Change the machine ID/name to profile B and temperature address to 49. Probe,
   apply and expect 42 C in diagnostics. No further firmware upload is required.
7. Stop OpenModSim or disconnect the bench data link. `/machines` diagnostics
   must report failed reads even while the gateway remains online. Resume the
   simulator and confirm successful readings with newer `sampledAt` timestamps.
8. Measure setup duration externally and record actual hardware costs. These are
   presentation measurements; the backend does not implement cost or timer UI.

### Example HTTP client sequence

From the repository root, save the probe body as `probe.json`:

```json
{
  "config": {
    "deviceId": "DEMO-A",
    "deviceName": "Demo machine A",
    "protocol": "MODBUS_RTU",
    "baudRate": 9600,
    "parity": "NONE",
    "stopBits": 1,
    "slaveId": 1,
    "samplingIntervalMs": 1000,
    "registerMap": [
      {"key": "temperature", "address": 0, "functionCode": 3, "dataType": "INT16", "scale": 0.1, "unit": "C"},
      {"key": "current", "address": 1, "functionCode": 3, "dataType": "UINT16", "scale": 0.01, "unit": "A"},
      {"key": "rpm", "address": 2, "functionCode": 3, "dataType": "UINT16", "scale": 1, "unit": "rpm"}
    ]
  }
}
```

Set the backend URL and actual gateway ID returned by discovery:

```bash
api=http://127.0.0.1:3000
curl -fsS "$api/gateways"
gateway=REPLACE_WITH_GATEWAY_ID
curl -fsS -H 'Content-Type: application/json' \
  --data-binary @probe.json "$api/gateways/$gateway/probe"
```

The POST returns `id`. Poll `GET /operations/{id}` until `phase` is `completed`
and all readings succeed. Construct the apply body with the unchanged config:

```bash
python3 - PROBE_REQUEST_ID <<'PYCODE'
import json, sys
with open('probe.json') as source:
    body = json.load(source)
body['probeRequestId'] = sys.argv[1]
with open('apply.json', 'w') as output:
    json.dump(body, output)
PYCODE
curl -fsS -H 'Content-Type: application/json' \
  --data-binary @apply.json "$api/gateways/$gateway/apply"
```

Replace `PROBE_REQUEST_ID` with the returned probe ID. Poll the apply operation's
own returned `id` to inspect receipt, application, persistence and reboot evidence.
The team's frontend should follow this same sequence and display raw/converted
results, failed reads and each acknowledgment separately.

Suggested frontend stale threshold: `max(5000 ms, 3 * samplingIntervalMs)`. Individual
Modbus failures are reported when a scan finishes; a scan of N unresponsive
registers can take roughly N library response timeouts. Time is measured from
each register attempt, not from gateway heartbeats. Probe reads briefly suspend
the normal scan, restore UART settings and leave active config/NVS/alarms intact.

## HTTP contract

| Method | Route | Result |
| --- | --- | --- |
| GET | `/gateways` | Reporting gateways, boot/config IDs, flash/restoration evidence and freshness |
| POST | `/gateways/{gatewayId}/probe` | `{config}` -> 202 operation |
| POST | `/gateways/{gatewayId}/apply` | `{config, probeRequestId, acceptWarnings?}` -> 202 operation |
| GET | `/operations/{requestId}` | Phase, hardware results, persistence and restart evidence |

`config` is the firmware-shaped camelCase object with `deviceId`, `deviceName`,
Modbus serial settings and `registerMap`. Each register accepts raw `address`,
`functionCode` 3/4, `dataType` INT16/UINT16/UINT32, `wordOrder`, `scale`, `unit`,
optional `expectedMin`/`expectedMax` (converted units) and an optional high `alarm`
object (`threshold`, optional `criticalThreshold`, `hysteresis`, `code`, `severity`). Expected ranges are checked
by the backend and are separate from firmware alarm thresholds.

Apply requires a complete successful probe of the exact normalized draft on the
same gateway boot, completed less than 60 seconds ago. Only one operation per
gateway runs at a time in this HTTP process. Operations expire after an hour and
are held in memory: keep one HTTP control process for the demo. An HTTP restart
loses operation history; the gateway's current state and the database's applied
configuration remain inspectable. A timeout means an unknown apply outcome,
not proof that nothing changed. Inspect `GET /gateways` before retrying.

Before applying, the backend clears older retained configs on the selected gateway
and target device config topics; otherwise they could undo the new map on reconnect.
The new configuration command itself is not retained; ESP32 flash supplies recovery.
Each new control command includes a
request ID, expected boot, expiry and, for apply, the expected current config
request ID. Firmware rejects stale commands; retries of the same request are
idempotent. Legacy manual config messages without these guards still work.

## MQTT additions

| Topic suffix | Direction | Retained |
| --- | --- | --- |
| `gateways/{id}/probe` | Backend -> ESP32 | No |
| `gateways/{id}/probe/result` | ESP32 -> backend | No |
| `gateways/{id}/config` | Backend -> ESP32 | No for this API |
| `gateways/{id}/config/ack` | ESP32 -> backend | No |
| `gateways/{id}/state` | ESP32 -> backend, every 10 seconds | Yes |
| `devices/{id}/diagnostics` | ESP32 -> consumer, every complete scan | No |

All topics start with `legacy-link/`. Replies carry `schemaVersion: 1`, gateway,
device and boot IDs as relevant. Probe results include `requestId` and `readings`;
readings contain key, address, success, errorCode and sampledAt, plus rawWords,
rawValue and value on success. A failed read never supplies a zero as a valid
measurement. Diagnostics include failed scans even when no telemetry is produced.

`/machines` retains upstream `gatewayOnline`, `lastTelemetryAt` (server receipt)
and `dataAgeSeconds`, with `online` as a compatibility alias. `lastMeasurementAt`
is the ESP32 measurement timestamp; clients should use it for freshness rather than
the server receipt time. The response also adds `diagnostics`, `samplingIntervalMs`, `gatewayId`
and `configRequestId`. Status messages update gateway contact only. Fresh diagnostics
also update gateway contact, including failed scans, without advancing the last
successful telemetry timestamp. Telemetry
cannot overwrite newer telemetry; diagnostics cannot overwrite newer scans.
Clients should mark values without measurement timestamps as unverified and must
not use heartbeat timestamps as a substitute.

## Verification and limits

- Firmware host tests cover non-destructive probing, signed raw/converted values,
  UART restoration, failure reports, command expiry and restart evidence.
- Backend tests cover exact-draft gating, warnings, timeout, stale/retained/wrong
  boot replies, persistence phases, request bounds and actual HTTP handlers.
- Isolated Docker Compose integration passed with synthetic MQTT inputs and real
  Mosquitto, PostgreSQL and consumer containers: schema replay, telemetry storage,
  deduplication, ordering, diagnostics, alarms and invalid-payload rejection.
- Host hardware stubs and synthetic MQTT inputs do not verify physical ESP32 or
  Modbus wiring. Deploy updated firmware, schema, HTTP process and consumer
  together, then perform the physical sequence above.
- No offline telemetry backlog or predictive AI is implemented in this slice.
