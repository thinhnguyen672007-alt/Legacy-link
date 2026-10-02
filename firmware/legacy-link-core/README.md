# ESP32 gateway firmware

## Remote configuration

At boot, the Serial Monitor prints a stable gateway ID derived from the ESP32
chip ID, and its configuration topic:

```text
legacy-link/gateways/{gatewayId}/config
```

Publish a JSON device configuration to that exact topic. The gateway subscribes
at QoS 1 on every MQTT connection, including before the first device is configured.
Its MQTT client ID is also unique per gateway. The gateway topic stays the same
when `deviceId` changes; telemetry and status continue using
`legacy-link/devices/{deviceId}/telemetry` and `/status`.

Save this example as `device-config.json`:

```json
{
  "deviceId": "CNC-01",
  "deviceName": "Workshop CNC",
  "protocol": "MODBUS_RTU",
  "baudRate": 9600,
  "parity": "EVEN",
  "stopBits": 1,
  "slaveId": 1,
  "samplingIntervalMs": 2000,
  "registerMap": [
    {"key": "temperature", "address": 100, "functionCode": 3, "dataType": "INT16", "scale": 0.1, "unit": "C"}
  ]
}
```

Using your broker credentials and the gateway ID printed on Serial:

```bash
mosquitto_pub -h "$MQTT_HOST" -p 1883 \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "legacy-link/gateways/$GATEWAY_ID/config" -q 1 -r \
  -f device-config.json
```

The broker must allow that gateway to subscribe to its configuration topic and
allow the provisioning publisher to write it. The `-r` option retains the
configuration so the broker can deliver it after a reboot. Without retention,
configuration lasts only until the ESP32 restarts. Serial configuration remains
available: paste compact JSON on one line and press Enter. A retained MQTT config
will be reapplied on reconnect and may replace a later Serial configuration.

The callback copies up to 4095 bytes and applies the update in the main loop.
Empty, oversized, or NUL-containing MQTT payloads are rejected. Oversized Serial
lines are discarded completely through the next newline. Parsing and validation
complete before the running configuration or UART is changed. Rejected updates
keep the previous configuration active; accepted updates log success and publish
online status when MQTT and NTP time are available. Configuration has no separate
MQTT acknowledgment topic yet.

## Supported configuration

- Required: `deviceId` (1–31 bytes, no spaces/control characters, `/`, `+`, or `#`)
  and `registerMap` (1–16 entries).
- Defaults: `deviceName: ""`, `protocol: "MODBUS_RTU"`, `baudRate: 9600`,
  `parity: "NONE"`, `stopBits: 1`, `slaveId: 1`, `samplingIntervalMs: 1000`.
- Only `MODBUS_RTU` is supported. Baud rates must be 300–2,000,000; parity is
  `NONE`, `EVEN`, or `ODD`; stop bits are 1 or 2; slave IDs are 1–247; sampling
  intervals are 100–86,400,000 ms. Use a baud rate supported by your equipment.
- Every register requires a unique, nonempty `key` (up to 19 bytes) and an integer
  `address` (0–65535). Function codes are 3 or 4 (default 3).
- Data types are `INT16` (default, signed) or `UINT16` (unsigned). Each reads one
  register. Scale defaults to 1 and must be finite. Units default to an empty
  string and can contain up to 7 bytes. Device names can contain up to 47 bytes.
- Optional fields set to `null` use their defaults. Numeric strings, out-of-range
  integers, duplicate keys, unsupported types, and overlong strings are rejected.
- The backend currently accepts only `temperature`, `current`, and `rpm` metric
  names. Choose those keys for end-to-end telemetry until backend support expands.

## Threshold alarms

Each register can optionally include one upper-threshold `alarm` object:

```json
{
  "deviceId": "CNC-01",
  "samplingIntervalMs": 2000,
  "registerMap": [
    {
      "key": "temperature",
      "address": 100,
      "dataType": "INT16",
      "scale": 0.1,
      "unit": "C",
      "alarm": {
        "threshold": 80,
        "hysteresis": 5,
        "code": "OVERHEAT",
        "severity": "high"
      }
    }
  ]
}
```

Values above `threshold` trigger an alarm using the scaled measurement. The
example first triggers above 80 C, then rearms only when a valid reading is at or
below 75 C (`threshold - hysteresis`). This gap prevents repeated alerts when
readings fluctuate near the threshold. `hysteresis` defaults to zero and must be
finite and nonnegative. `threshold` must be finite; negative thresholds are
supported. Replace these example values with limits for your equipment.

`code` and `severity` are required and match the backend contract:

| Field | Accepted values |
| --- | --- |
| `code` | `OVERHEAT`, `OVERCURRENT`, `OVERSPEED`, `VIBRATION` |
| `severity` | `low`, `medium`, `high`, `critical` |

An omitted `alarm` disables alerts for that register. A present but invalid alarm
object (including `null`) rejects the entire configuration and preserves the
previous settings. Lower-bound alarms and automatic machine control are not
implemented.

The firmware publishes to `legacy-link/devices/{deviceId}/alarm`:

```json
{"deviceId":"CNC-01","timestamp":1790899200000,"schemaVersion":1,"code":"OVERHEAT","severity":"high","value":81.5}
```

The timestamp is generated from synchronized time at publication. Failed Modbus
reads and non-finite measurements neither trigger nor rearm alarms. If the clock
is not ready, MQTT is disconnected, or publishing fails, a later valid reading
still above the threshold can retry. Events that end before delivery are not
queued. A successful publish suppresses repeats until the reset boundary is
reached. No separate recovery message is emitted.

Alarm messages use non-retained QoS 0 publishing, as supported by the current
PubSubClient API. A successful publish means the client accepted the send, not
that the backend acknowledged receipt. MQTT reconnect alone keeps alarm state;
a successful configuration update (including retained redelivery) or reboot
resets it and may produce another alert. Invalid updates keep alarm state.

## Verification

```bash
pio run -d firmware/legacy-link-core
bash firmware/legacy-link-core/test/host/run.sh
```

The host tests compile the actual configuration parser against ArduinoJson with
small Serial/UART/Modbus stubs and address/undefined-behavior sanitizers. They require a
C++ compiler and ArduinoJson downloaded by the PlatformIO build. They check valid
and malformed payloads, integer narrowing, register limits, and preservation of
both running configuration and UART call count after rejection, plus signed and
unsigned register decoding. In a ptrace-based sandbox, run the tests with
`ASAN_OPTIONS=detect_leaks=0` if LeakSanitizer cannot start; address and undefined
behavior checks remain enabled.

The second test executable runs the actual `setup()`, MQTT callback and `loop()`
with simulated Wi-Fi, MQTT and Serial interfaces. It covers gateway topic
isolation, deferred configuration application, reconnect subscriptions,
subscription write failures, invalid MQTT payloads, Serial overflow recovery,
and configuration delivery when no active configuration exists. These simulations
do not exercise a real MQTT broker or prove retained-message delivery.

Telemetry tests check a full 16-register payload larger than 512 bytes and confirm
that it is complete JSON. Failed readings and non-finite values are omitted; an
empty metric set is not published. Numeric values use ArduinoJson serialization
without the previous forced two-decimal formatting. Payloads that exceed the
document or output buffer are skipped instead of publishing truncated JSON.

Alarm tests cover invalid settings, all supported codes/severities, a full
16-register alarm configuration, threshold boundaries, hysteresis, independent
register state, failed reads, unsynchronized time and failed-send retries. Gateway
tests also verify the emitted alarm JSON, suppression across reconnects, and
rearming after a successful Serial update.

Hardware smoke test:

1. Flash the firmware with your Wi-Fi and MQTT settings and note its config topic.
2. Publish the example. Confirm the success log, UART settings, and device status
   after NTP synchronizes. Verify Modbus telemetry against the connected device.
3. Publish an invalid slave ID (257) or broken JSON. Confirm the rejection log and
   continued polling with the previous settings.
4. Restart the gateway with a retained valid config. Confirm it restores polling.
5. Run two gateways and verify each accepts only its own configuration topic.
6. Configure an alarm, then use a Modbus simulator or test device to move the
   scaled value above the threshold. Check for one alarm, keep the value high to
   confirm suppression, lower it to the reset boundary, and exceed the threshold
   again to confirm a second alarm.

The host tests and build do not verify physical UART, Wi-Fi, or broker delivery.
