# Legacy-link

Configuration-driven, low-cost gateway for connecting legacy equipment to modern software.

> Status: active development. Firmware supports runtime configuration, Modbus polling, telemetry, alarms and retained connection status. Host tests and ESP32 builds cover the software paths; physical RS-485, Wi-Fi and backend/database acceptance checks remain deployment requirements. See the [firmware operation guide](firmware/legacy-link-core/docs/firmware-operation.md).

## Overview

Legacy-link bridges older industrial or laboratory equipment with modern applications through a configurable ESP32 gateway. A JSON payload describes the target device (baud rate, parity, slave ID, register map, etc.). The firmware parses the payload, reconfigures UART2 on the fly, and starts polling Modbus registers at the specified interval -- **no firmware reflash required** when connecting to a new machine.

Polled data is published over MQTT using a structured topic hierarchy (`legacy-link/devices/{deviceId}/telemetry|status|alarm`). A Node.js backend subscribes to these topics, validates each payload against a strict schema, and logs the results.

The repository is organised as a monorepo so firmware, infrastructure, backend, frontend, and tests can evolve independently.

## Repository Layout

| Directory | Purpose | Status |
| --- | --- | --- |
| `firmware/` | PlatformIO firmware for the ESP32 gateway | Active |
| `firmware/legacy-link-core/test/host/` | Firmware behavior and contract tests without an ESP32 | Active |
| `infrastructure/` | Docker Compose services (Mosquitto MQTT broker), scripts, and environment config | Active |
| `backend/` | MQTT consumer with payload validation | Active |
| `frontend/` | Operator dashboard / interface | Planned |
| `tests/` | Cross-component and integration tests | Planned |

## Architecture

```
ESP32 Gateway        Mosquitto Broker       Node.js Backend
+-------------+      +---------------+      +---------------+
| Modbus RTU  |----->| MQTT Topics   |----->| Validate &    |
| Polling     | WiFi | telemetry     | Sub  | Log Data      |
| JSON Config |      | status        |      | Process Alarm |
+-------------+      | alarm         |      +---------------+
                      +---------------+
```

## Firmware

### Modules

The firmware modules are:

| Module | File(s) | Responsibility |
| --- | --- | --- |
| **Config Parser** | `config_parser.cpp/.h`, `device_config.h` | Parse incoming JSON into a C struct, validate fields, and reconfigure UART2 automatically |
| **Modbus Reader** | `modbus_reader.cpp/.h` | Initialise `ModbusMaster`, poll holding/input registers, apply scaling, and return structured results |
| **Alarm Monitor** | `alarm_monitor.cpp/.h` | Evaluate configured thresholds, critical escalation and hysteresis |
| **Config Store** | `config_store.cpp/.h` | Persist validated JSON to ESP32 NVS and restore at boot |
| **Main Loop** | `main.cpp` | Wi-Fi + NTP, MQTT, config acknowledgements and one-register polling steps with network service during waits |

### MQTT Publishing

The gateway publishes data to three topic families (matching `backend/src/config.js`):

| Topic | Payload | Trigger |
| --- | --- | --- |
| `legacy-link/devices/{deviceId}/telemetry` | `{deviceId, timestamp, schemaVersion:1, metrics:{...}}` | Every sampling interval |
| `legacy-link/devices/{deviceId}/status` | `{deviceId, timestamp, schemaVersion:1, status:true/false}` | On accepted config, MQTT reconnect, heartbeat every 30s and broker Last Will |
| `legacy-link/devices/{deviceId}/alarm` | `{deviceId, timestamp, schemaVersion:1, code, severity, value}` | Configured threshold crossed; repeats suppressed by hysteresis |

- **Timestamps** are NTP-synchronised Unix epoch **milliseconds** (13 digits), matching backend validation.
- **`schemaVersion: 1`** is included in every message as required by the backend.
- Status messages use **retained** publish so new subscribers receive the last known state.
- Provisioned connections register a retained offline **Last Will**. The gateway
  also publishes configuration results to `legacy-link/gateways/{gatewayId}/config/ack`.

### Remote Configuration

At startup, Serial prints the stable hardware gateway ID and its topic
`legacy-link/gateways/{gatewayId}/config`. Publish the device JSON to that topic
at QoS 1, optionally retained so the broker redelivers it on reconnect. After
provisioning, the device topic `legacy-link/devices/{deviceId}/config` also accepts
updates with the same device ID. Use the gateway topic to change device identity.

Validated settings are saved to ESP32 flash and restored at boot. A retained
config can overwrite later Serial changes on reconnect. Invalid configs preserve
active settings; payloads must fit 4095 bytes and maps must have 1–16 entries.
See the [firmware guide](firmware/legacy-link-core/README.md) for publishing examples
and the [operation guide](firmware/legacy-link-core/docs/firmware-operation.md) for
ACKs and persistence failures.

### JSON Configuration Example

Send a single-line JSON via Serial Monitor or the gateway MQTT config topic:

```json
{"deviceId":"CNC-01","deviceName":"Bench example","protocol":"MODBUS_RTU","baudRate":9600,"parity":"NONE","stopBits":1,"slaveId":1,"samplingIntervalMs":2000,"registerMap":[{"key":"speed","address":1,"functionCode":3,"dataType":"UINT16","scale":1.0,"unit":"rpm"},{"key":"temperature","address":49,"functionCode":3,"dataType":"INT16","scale":0.1,"unit":"C"}]}
```

Addresses are raw zero-based protocol addresses, not Modicon labels. Replace the
illustrative map with the equipment manual's settings. INT16, UINT16 and UINT32
are supported; scaling happens once in firmware. See [the contract](firmware/legacy-link-core/docs/backend-alignment.md).

### Dependencies

| Library | Version | Purpose |
| --- | --- | --- |
| `ArduinoJson` | ^6.21.3 | JSON parsing |
| `ModbusMaster` | ^2.0.1 | Modbus RTU communication |
| `PubSubClient` | ^2.8 | MQTT client |

### Requirements

- ESP32 Dev Module
- VS Code with PlatformIO, or the PlatformIO CLI
- USB data cable and the appropriate CP210x driver, if required by the board

### Build

From the repository root:

```bash
pio run -d firmware/legacy-link-core
```

Upload to a connected board:

```bash
pio run -d firmware/legacy-link-core -t upload --upload-port COM3
```

Monitor the serial output:

```bash
pio device monitor -d firmware/legacy-link-core -b 115200
```

Paste a JSON configuration line and press Enter. The gateway will parse, validate, reconfigure UART2, and begin polling Modbus registers.

### Firmware Verification

After the PlatformIO build downloads ArduinoJson:

```bash
bash firmware/legacy-link-core/test/host/run.sh
python3 firmware/legacy-link-core/test/host/run_contract.py --backend-ref origin/main
```

Host tests run real firmware code with simulated hardware and address/undefined
behavior sanitizers. In ptrace sandboxes, set `ASAN_OPTIONS=detect_leaks=0` if
LeakSanitizer cannot start. Fetch the backend revision before the contract check.
These checks do not prove physical Wi-Fi/RS-485 or database delivery; follow the
[acceptance checklist](firmware/legacy-link-core/docs/firmware-operation.md#acceptance-checks-with-hardware).

### Network Configuration

Before uploading, copy the example site settings and edit the ignored local file:

```bash
cp firmware/legacy-link-core/include/local_settings.example.h firmware/legacy-link-core/include/local_settings.h
```

Set Wi-Fi, broker credentials/address, NTP server and any RS-485 direction GPIO.
Follow the [first-connection guide](firmware/legacy-link-core/docs/first-connection.md).

## Backend

The `backend/` directory contains a **Node.js MQTT consumer** that subscribes to the gateway's topics, validates every incoming payload, and logs accepted data.

### Components

| File | Responsibility |
| --- | --- |
| `src/config.js` | Load `.env`, validate required env vars (`MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`, `MQTT_QOS`) |
| `src/index.js` | Application entry point -- wire handlers, manage process lifecycle (SIGINT/SIGTERM) |
| `src/mqtt/client.js` | Create MQTT connection, subscribe to topics, route messages to `onTelemetry` / `onStatus` / `onAlarm` handlers |
| `src/validation/telemetry.js` | Validate telemetry payloads: `deviceId`, `timestamp` (epoch ms), `schemaVersion`, `metrics` (finite numbers) |
| `src/validation/status.js` | Validate status payloads: `deviceId`, `timestamp` (epoch ms), `schemaVersion`, `status` (boolean) |
| `src/validation/shared.js` | Shared constants and helpers (`MIN_VALID_TIMESTAMP_MS`, `MAX_FUTURE_SKEW_MS`, `isPlainObject`) |

### Setup

```bash
cd backend
cp .env.example .env   # edit MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_QOS
npm install
npm run dev
```

## Infrastructure

The `infrastructure/` directory provides a ready-to-use **Mosquitto MQTT broker** via Docker Compose.

```bash
cd infrastructure
cp .env.example .env      # edit credentials as needed
docker compose up -d
```

See [`infrastructure/README.md`](infrastructure/README.md) for full setup instructions, environment variables, and troubleshooting.

## CI/CD

GitHub Actions builds the ESP32 firmware, runs nine host test executables and
checks firmware payloads against backend validators on pushes and pull requests
to `main` and `dev`. See [`.github/workflows/build.yml`](.github/workflows/build.yml).

## Development Progress

### Merged Pull Requests

| PR | Branch | Description | Author | Merged |
| --- | --- | --- | --- | --- |
| [#3](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/3) | `feature/firmware-base` | Initial firmware foundation | @Nezine | 2026-08-20 |
| [#5](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/5) | `feature/firmware-base` | Modbus integration, config parser, non-blocking polling | @Nezine | 2026-08-21 |
| [#6](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/6) | `feature/firmware-base` | Full config-driven architecture: JSON config, Modbus RTU, UART auto-reconfig, WiFi/MQTT | @Nezine | 2026-09-03 |
| [#7](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/7) | `feature/infra-base` | Infrastructure foundation: Docker Mosquitto broker, scripts, docs | @phamTuan207 | 2026-09-14 |
| [#8](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/8) | `feature/firmware-base` | MQTT publishing scaffolding for firmware | @Nezine | 2026-09-14 |
| [#9](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/9) | `feature/infra-base` | Infrastructure cleanup, Fedora compatibility | @phamTuan207 | 2026-09-15 |
| [#10](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/10) | `feature/backend-base` | Backend MQTT consumer: subscribe topics, validation layer, error logging | @thinhnguyen672007-alt | 2026-09-15 |
| [#11](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/11) | `feature/backend-base` | Backend QoS security fix, per-test pip isolation | @thinhnguyen672007-alt | 2026-09-15 |
| [#12](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/12) | `feature/firmware-base` | Firmware MQTT publish with NTP timestamps, retain flag, larger JSON buffer | @Nezine | 2026-09-21 |
| [#13](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/13) | `feature/infra-base` | Resolve conflicts and remove bloatware | @phamTuan207 | 2026-09-21 |
| [#14](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/14) | `feature/backend-base` | Add status validation, shared.js, schemaVersion enforcement | @thinhnguyen672007-alt | 2026-09-21 |
| [#15](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/15) | `feature/backend-base` | Add test files for telemetry and status validation | @thinhnguyen672007-alt | 2026-09-21 |
| [#16](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/16) | `feature/firmware-base` | Align firmware payload format with backend validation (epoch ms, schemaVersion, boolean status) | @Nezine | 2026-09-21 |

## Roadmap

- [x] Define configuration schema and JSON parsing
- [x] Implement Modbus RTU polling with register map
- [x] Auto-reconfigure UART2 from JSON config
- [x] WiFi and MQTT client
- [x] Docker Compose Mosquitto MQTT broker
- [x] Publish polled data to MQTT topics (telemetry + status)
- [x] NTP time synchronisation for accurate timestamps
- [x] Backend MQTT consumer with payload validation
- [x] CI/CD: GitHub Actions firmware build
- [x] MQTT callback to receive config from broker (runtime config)
- [x] Publish configurable alarms with hysteresis and critical escalation
- [x] Save configuration to flash and report application/persistence results
- [x] Keep network service running during Modbus response waits
- [ ] Add a frontend for device status and configuration
- [x] Add host tests for malformed configs, timeout scans and recovery
- [x] Document settings, adapter requirements and deployment checks
- [ ] Verify physical ESP32/RS-485 and backend/database integration

## License

No license has been selected yet. Until one is added, the default copyright rules apply and reuse is not automatically permitted.
