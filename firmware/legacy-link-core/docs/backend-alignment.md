# Backend configuration and firmware contract

## Confirmed configuration examples

The team supplied [esp32-01](../examples/esp32-01.json) and
[esp32-03](../examples/esp32-03.json). Both use `registerMap`, `key`, `address`,
`functionCode`, and `dataType`. Firmware accepts both, including the temperature
override from address 49 to 51. Overrides must already be resolved by the backend.
Firmware consumes JSON through Serial or MQTT; it does not fetch an HTTP endpoint.

For compatibility with database-shaped responses, firmware also accepts:

```json
{
  "deviceId": "esp32-01",
  "registers": [
    {"metric_key": "temperature", "protocol_address": 49, "modicon_address": 40050,
     "function_code": 3, "data_type": "INT16", "scale": 0.1, "unit": "C"}
  ]
}
```

Top-level fields remain camelCase in both formats. Mixing the two arrays or
register naming conventions is rejected. Empty maps, invalid rows, unsupported
types and invalid alarms reject the entire update, preserving current settings.
Rejections are logged on Serial and reported through the gateway configuration
acknowledgement topic. See [firmware operation](firmware-operation.md) for the
ACK contract, optional request IDs and delivery limits.
`data_type` defaults to `UINT16` in the database-shaped format, matching the
catalog; legacy `dataType` retains its `INT16` default. Prefer explicit types.

Both address fields are **raw zero-based protocol addresses**. `modicon_address`
is display metadata only, never an automatic fallback. For holding registers,
the backend/catalog converts Modicon 40050 to protocol address 49. Firmware must
not subtract 40001 again.

## Metric names and scaling

Common metric keys are `temperature`, `speed`, `torque`, `current`, `rpm` and
`pressure`. Both firmware and backend require 1–19 ASCII characters, starting
with a letter, followed by letters, digits or underscores. Reserved names
`constructor`, `prototype` and `__proto__` are rejected. The device catalog still
determines which well-formed keys may be ingested; grammar alone is not permission.
Firmware copies keys unchanged: `temp` does not become `temperature`.

Firmware decodes the signed/unsigned register value first, then multiplies
by `scale` exactly once. The backend receives the engineering value and must
not multiply by the scale again. For example, INT16 raw -180 with scale 0.1
becomes -18.0 degrees, and raw 1200 becomes 120.0. Host tests verify the negative
example through the actual telemetry serializer, including its metric key.

## Configuration size

The receive buffer is 4096 bytes, including the terminating NUL byte. The JSON
payload must therefore be **at most 4095 bytes**, measured as UTF-8 bytes, not
characters. The direct parser, MQTT callback and Serial input enforce the same
limit. Whitespace counts toward it; compact JSON is preferable.

The parser uses `DynamicJsonDocument(8192)` for its internal representation.
This allocation is separate from serialized JSON length. Up to 16 registers are
supported, but a map with long names, alarms and optional metadata must still
fit both limits. Check the final serialized payload after applying overrides:

```js
const payload = JSON.stringify(config);
if (Buffer.byteLength(payload, 'utf8') > 4095) {
  throw new Error('Firmware configuration exceeds 4095 bytes');
}
```

Host tests exercise a full 16-register map with maximum-length metric keys,
4095-byte valid JSON, and rejection of 4096-byte valid JSON through parser,
MQTT and Serial. Rejection preserves the previous configuration and UART.

## MQTT identity, provisioning and offline status

- Bootstrap topic: `legacy-link/gateways/{hardwareGatewayId}/config`.
- After provisioning: also subscribe to `legacy-link/devices/{deviceId}/config`.
  Payload ID must match this device topic. Reassignment uses the gateway topic
  or Serial. Broker ACLs must permit both subscriptions.
- Provisioned client ID: `legacy-link-{deviceId}-{hardwareGatewayId}`. Before
  provisioning it is `legacy-link-{hardwareGatewayId}`. Hardware suffixes keep
  boards from disconnecting each other even if IDs are accidentally duplicated;
  they do not make duplicate device IDs safe for telemetry attribution.
- Identity changes publish retained offline status for the old device and
  reconnect with the new identity and Last Will. Identical retained configuration
  does not reconnect or rearm alarms.
- Online status is retained. Each provisioned connection registers a retained
  QoS 1 Last Will with `status: false`, `schemaVersion: 1`, matching `deviceId`
  and an integer epoch-millisecond timestamp. It waits for synchronized time.
- Unexpected Wi-Fi loss closes the transport without sending MQTT DISCONNECT.
  Power loss is detected by the broker's keepalive timeout, not immediately.
- The will's timestamp is fixed **at connection time**, because MQTT 3.1.1 cannot
  generate a fresh payload on power loss. The backend must treat receipt time as
  the offline detection time and must not discard offline wills as older than
  the latest online heartbeat. At checked commit `9a7afa6`, `saveStatus` uses
  database receipt time and updates status without comparing payload timestamps,
  which is compatible with this behavior. The existing schema has no event-source marker.
- Valid device configuration is saved to NVS flash and validated again at boot.
  A flash-write failure leaves the new config active in RAM and reports
  `persisted: false`; the previous saved configuration may return after reset.
  Identical persisted redelivery avoids flash writes and alarm resets.

NTP starts when Wi-Fi connects and restarts after Wi-Fi recovery. Outbound
telemetry, status and alarms wait for valid time. Timestamps use `gettimeofday`
milliseconds, including the fractional second (not seconds multiplied by 1000).

## Register widths

`INT16` and `UINT16` read one register. `UINT32` reads two consecutive registers
in one Modbus operation; start address 65535 is rejected. `wordOrder` (legacy)
or `word_order` (database shape) accepts `HIGH_FIRST` (default) or `LOW_FIRST`.
Bytes within each register use Modbus wire order. Scaled readings use double
precision so unscaled UINT32 values through 4294967295 remain exact.

## Configurable alarms

Existing `alarm` objects remain supported. Add `criticalThreshold` greater than
`threshold` to a `severity: "high"` alarm for two upper levels:

```json
"alarm": {
  "threshold": 90,
  "criticalThreshold": 100,
  "hysteresis": 3,
  "code": "OVERHEAT",
  "severity": "high"
}
```

All numbers are illustrative, not machine safety limits. High fires above 90
and rearms at or below 87. Critical fires above 100 and rearms at or below 97.
A jump directly above critical emits only critical; a later escalation from
high emits critical. Reconnects and identical configurations preserve suppression.
Changed configurations reset alarm state. Failed sends retry on subsequent
out-of-range valid readings. These messages do not control machinery.

Flat catalog alarm fields are also supported, with explicit contract metadata:

| Field | Meaning |
| --- | --- |
| `alarm_high` | Upper threshold; requires `alarm_code` |
| `alarm_critical` | Higher upper threshold; requires high level; severity is critical |
| `alarm_low` | Lower-value warning, **not** the upper alarm reset threshold; requires `alarm_low_code` |
| `alarm_hysteresis` | Nonnegative reset band, default 0 |
| `alarm_severity`, `alarm_low_severity` | Severity, default high |

Low fires strictly below its threshold and rearms at or above threshold plus
hysteresis. Nullable absent thresholds disable their respective levels.
Do not mix flat thresholds and an `alarm` object in the same register.
The extra alarm fields are a firmware contract proposal, not verified endpoint
output. Missing/unsupported codes cause explicit rejection, never silently
disabled protection or an invented mapping from a metric name.

## Remaining backend coordination and physical validation

At checked backend `origin/main` commit `1c7a872`, the telemetry validator allows
all six agreed keys, including torque. The catalog endpoint returns camelCase
register entries with raw protocol addresses and resolves device overrides.
However, its `src/db/catalog.js` `toFirmwareRegister()` mapping omits alarm settings even though the
query selects thresholds. Backend work is still needed to supply explicit alarm
codes, levels and hysteresis, publish configs to the gateway/device topic, and
consume the new ACK topic. Fetching the HTTP catalog alone does not provision an ESP32.

The alarm validator currently accepts only OVERHEAT, OVERCURRENT, OVERSPEED and
VIBRATION. Under-temperature/current/speed codes remain a team decision and need
backend support before low alarms for those metrics can be integrated. The
supplied configuration examples contain no alarms, so their alarms are disabled.

Host tests verify both configuration examples, database names, rejection without
state changes, signed and two-word reads, hysteresis and escalation, retained
configuration idempotence, topic ID checks and constructed LWT payloads. The
ESP32 build checks compilation. These checks do not prove real RS-485 word order,
Wi-Fi delivery, broker power-loss behavior, HTTP endpoint operation, or database
insertion. Test those with the actual board, broker and Modbus source next.

## Control commands and local verification

MQTT commands may include `requestId` (1–64 bytes), `expectedBootId` (1–16 bytes),
`expectedConfigRequestId` (0–64 bytes) and `expiresAt` (integer epoch milliseconds).
Strings with embedded NUL characters are rejected. Legacy manual configuration
may omit these fields. A supplied deadline requires a synchronized clock and
must still be in the future at admission and execution. Apply also rechecks the
expected active configuration; retries bearing the active request ID remain
idempotent under the existing control contract.

While a command is pending or executing, another command receives a correlated
`rejected`/`busy` ACK and cannot overwrite the first. During a probe, MQTT is
serviced between Modbus waits. Expiry stops further register reads after the
current transaction returns, restores UART settings, and reports `stale_command`.
It does not publish an incomplete report as `completed`. A failed local report
publish returns `report_publish_failed`; a successful QoS 0 write still does not
prove backend receipt. The backend operation deadline remains authoritative.

The firmware contract test extracts backend validators from a selected fetched
Git revision. It now checks 22 serialized messages including successful/failed
read reports and probe results, as well as telemetry, status and alarms. It does
not run the database transaction or prove broker authorization. To compare a
teammate's unpublished-to-main contract without checking out their branch:

```bash
git fetch origin
ASAN_OPTIONS=detect_leaks=0 python3 firmware/legacy-link-core/test/host/run_contract.py --backend-ref origin/feature/backend-base
```

## Profile changes with pending delivery

A valid new profile starts sampling immediately; existing telemetry/alarm IDs,
payloads and timestamps remain unchanged in their RAM queues. No queue-drain
condition blocks configuration. A rejected update preserves the working profile.
The [USB inspector](usb-inspection.md) reports `unknown` until the new profile's
first read, then reports the actual result and age.

Delivery is still FIFO within each queue. A rejected old head can delay new
samples, and a full queue refuses new samples. Firmware never discards the old
head just to make a dashboard look current. The backend must accept/reconcile
historical samples according to its ingestion policy. Telemetry schema 1 has no
configuration revision field: an old and a new sample with the same metric key
but different scale/source cannot be reliably attributed to their profiles from
that payload alone. No configuration revision field has been added to telemetry.
Frontend freshness/Unknown/Error presentation remains frontend/backend work.
MQTT continues to use the team's chosen plaintext LAN transport.
