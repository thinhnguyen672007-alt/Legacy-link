# Legacy-link

Configuration-driven, low-cost gateway for connecting legacy equipment to modern software.

> Status: active development -- the full data pipeline (ESP32 -> MQTT -> Backend) is operational. The firmware accepts JSON device configurations at runtime (via Serial or MQTT), polls Modbus RTU registers, and publishes telemetry to an MQTT broker. The backend validates and processes incoming messages. Infrastructure services (Mosquitto MQTT broker) are containerised with Docker Compose.

## Overview

Legacy-link bridges older industrial or laboratory equipment with modern applications through a configurable ESP32 gateway. A JSON payload describes the target device (baud rate, parity, slave ID, register map, etc.). The firmware parses the payload, reconfigures UART2 on the fly, and starts polling Modbus registers at the specified interval -- **no firmware reflash required** when connecting to a new machine.

Polled data is published over MQTT using a structured topic hierarchy (`legacy-link/devices/{deviceId}/telemetry|status|alarm`). A Node.js backend subscribes to these topics, validates each payload against a strict schema, and logs the results.

The repository is organised as a monorepo so firmware, infrastructure, backend, frontend, and tests can evolve independently.

## Repository Layout

| Directory | Purpose | Status |
| --- | --- | --- |
| `firmware/` | PlatformIO firmware for the ESP32 gateway | Active |
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

The firmware is split into three modules:

| Module | File(s) | Responsibility |
| --- | --- | --- |
| **Config Parser** | `config_parser.cpp/.h`, `device_config.h` | Parse incoming JSON into a C struct, validate fields, and reconfigure UART2 automatically |
| **Modbus Reader** | `modbus_reader.cpp/.h` | Initialise `ModbusMaster`, poll holding/input registers, apply scaling, and return structured results |
| **Main Loop** | `main.cpp` | WiFi + NTP, MQTT connect/publish, Serial input handler, non-blocking Modbus polling timer |

### MQTT Publishing

The gateway publishes data to three topic families (matching `backend/src/config.js`):

| Topic | Payload | Trigger |
| --- | --- | --- |
| `legacy-link/devices/{deviceId}/telemetry` | `{deviceId, timestamp, schemaVersion:1, metrics:{...}}` | Every sampling interval |
| `legacy-link/devices/{deviceId}/status` | `{deviceId, timestamp, schemaVersion:1, status:true/false}` | On config change + heartbeat every 30s |
| `legacy-link/devices/{deviceId}/alarm` | *(reserved for future use)* | -- |

- **Timestamps** are NTP-synchronised Unix epoch **milliseconds** (13 digits), matching backend validation.
- **`schemaVersion: 1`** is included in every message as required by the backend.
- Status messages use **retained** publish so new subscribers receive the last known state.

### JSON Configuration Example

Send a single-line JSON via Serial Monitor (or MQTT in the future) to configure the gateway:

```json
{"deviceId":"CNC-01","deviceName":"Fanuc 0i","protocol":"MODBUS_RTU","baudRate":9600,"parity":"EVEN","stopBits":1,"slaveId":1,"samplingIntervalMs":2000,"registerMap":[{"key":"spindle_speed","address":100,"functionCode":3,"dataType":"INT16","scale":1.0,"unit":"RPM"},{"key":"feed_rate","address":101,"functionCode":3,"dataType":"INT16","scale":0.1,"unit":"mm/min"}]}
```

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

### Network Configuration

Before uploading, edit the network constants in `firmware/legacy-link-core/src/main.cpp`:

```cpp
const char *ssid = "YOUR_WIFI_SSID";
const char *password = "YOUR_WIFI_PASSWORD";
const char *mqtt_server = "192.168.1.100"; // IP of the machine running Docker Mosquitto
```

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

GitHub Actions automatically builds the ESP32 firmware on every push and pull request to `main` and `dev`. See [`.github/workflows/build.yml`](.github/workflows/build.yml).

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
- [ ] MQTT callback to receive config from broker (OTA config)
- [ ] Publish alarm messages on threshold violation
- [ ] Add a frontend for device status and configuration
- [ ] Add simulator-driven tests for malformed and partial messages
- [ ] Document supported hardware, wiring, and deployment

## License

No license has been selected yet. Until one is added, the default copyright rules apply and reuse is not automatically permitted.
