# Commissioning demo: configure, test, apply, verify

This implementation adds a real control path to the existing dashboard:

`browser -> HTTP control API -> MQTT -> ESP32 -> MQTT reply -> HTTP operation`

The browser never receives broker credentials. The HTTP process now also needs
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
4. In `frontend`, run `npm ci` and `npm run dev`. Set Connection to the backend
   laptop's HTTP URL. Open **Register maps -> Start setup** in Live API mode.
5. Select the reporting gateway. Select **Demo A** and edit its machine ID/name
   as needed. These demo presets require the register values below; they do not
   discover an arbitrary machine's register map.

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

1. Select Demo A, press **Test read**, and inspect raw words, signed/unsigned
   decoded raw values, and converted values. `1200 x 0.1 = 120 C`; INT16 raw word
   `65356` decodes to `-180`, then becomes `-18 C`.
2. Edit an address or scale. The previous result disappears and Apply is disabled
   until this exact draft has another successful test.
3. Try an unavailable address. Show the actual Modbus exception and blocked Apply.
   Restore the correct address. Set expected min/max if the machine manual gives
   useful limits. An out-of-range result requires explicit acknowledgement; a
   range check cannot prove that the address or data type is correct.
4. Apply the tested configuration. The UI tracks receipt, application and flash
   persistence separately. The catalog/device is registered only after an ESP32
   application acknowledgement. Database failure is reported even if the ESP32
   already applied the configuration.
5. Press EN to restart the ESP32. Leave the setup result open. **Restored after
   restart** requires the same configuration request ID in a different boot,
   reported by the gateway. A flash-write ACK alone does not pass this step.
6. Select Demo B, test, then apply. Its temperature address is 49. Switching
   profiles uses MQTT and does not require another firmware upload. The gateway
   reports the previous device offline when its device identity changes.
7. Stop the RTU simulator (or safely disconnect the bench data link). The gateway
   can remain online while each failed metric shows **No Modbus response**.
   Without further reports, successful values age into **Data not updating**.
   Resume the simulator and confirm fresh readings recover.
8. Show measured setup time and expand **Demo hardware cost**. Enter actual ESP32,
   USB–TTL and other hardware prices in VND. These inputs do not claim supplier
   prices and are not saved across browser reloads. Industrial RS-485 equipment
   needs its own transceiver and wiring; include those costs when applicable.

Measurement stale threshold: `max(5000 ms, 3 * samplingIntervalMs)`. Individual
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
object (`threshold`, `hysteresis`, `code`, `severity`). Expected ranges are checked
by the backend and are separate from firmware alarm thresholds.

Apply requires a complete successful probe of the exact normalized draft on the
same gateway boot, completed less than 60 seconds ago. Only one operation per
gateway runs at a time in this HTTP process. Operations expire after an hour and
are held in memory: keep one HTTP control process for the demo. An HTTP restart
loses operation history; the gateway's current state and the database's applied
configuration remain inspectable. A timeout means an unknown apply outcome,
not proof that nothing changed. Inspect Current gateway before retrying.

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
| `gateways/{id}/config` | Backend -> ESP32 | No for this UI |
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
is the ESP32 measurement timestamp; the UI uses it for freshness rather than
the server receipt time. The response also adds `diagnostics`, `samplingIntervalMs`, `gatewayId`
and `configRequestId`. Status messages update gateway contact only. Fresh diagnostics
also update gateway contact, including failed scans, without advancing the last
successful telemetry timestamp. Telemetry
cannot overwrite newer telemetry; diagnostics cannot overwrite newer scans.
The frontend marks values without measurement timestamps as unverified and does
not use heartbeat timestamps as a substitute.

## Verification and limits

- Firmware host tests cover non-destructive probing, signed raw/converted values,
  UART restoration, failure reports, command expiry and restart evidence.
- Backend tests cover exact-draft gating, warnings, timeout, stale/retained/wrong
  boot replies, persistence phases, request bounds and actual HTTP handlers.
- Frontend tests cover freshness independent of heartbeat, control flow, draft
  invalidation, exceptions, restart evidence, keyboard/a11y and mobile layout.
- Browser acceptance tests use explicit API fixtures. Host hardware stubs are not
  physical ESP32/Modbus tests. Deployment needs the updated firmware, schema,
  HTTP process and consumer together, followed by the physical sequence above.
- No offline telemetry backlog or predictive AI is implemented in this slice.
