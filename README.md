# Legacy-link

Configuration-driven, low-cost gateway for connecting legacy equipment to modern software.

> Status: active development — the firmware accepts JSON device configurations at runtime (via Serial or MQTT) and polls Modbus RTU registers without reflashing. Infrastructure services (Mosquitto MQTT broker) are containerised with Docker Compose.

## Overview

Legacy-link bridges older industrial or laboratory equipment with modern applications through a configurable ESP32 gateway. A JSON payload describes the target device (baud rate, parity, slave ID, register map, etc.). The firmware parses the payload, reconfigures UART2 on the fly, and starts polling Modbus registers at the specified interval — **no firmware reflash required** when connecting to a new machine.

The repository is organised as a monorepo so firmware, infrastructure, backend, frontend, simulators, and documentation can evolve independently.

## Repository Layout

| Directory | Purpose | Status |
| --- | --- | --- |
| `firmware/` | PlatformIO firmware for the ESP32 gateway | ✅ Active |
| `infrastructure/` | Docker Compose services (Mosquitto MQTT broker), scripts, and environment config | ✅ Active |
| `backend/` | Service and API layer (includes a sample `configExample.json`) | 🔜 Planned |
| `frontend/` | Operator dashboard / interface | 🔜 Planned |
| `simulators/` | Hardware and protocol simulators | 🔜 Planned |
| `tests/` | Cross-component and integration tests | 🔜 Planned |
| `docs/` | Architecture, hardware, and protocol documentation | 🔜 Planned |

## Firmware

### Architecture

The firmware is split into three modules:

| Module | File(s) | Responsibility |
| --- | --- | --- |
| **Config Parser** | `config_parser.cpp/.h`, `device_config.h` | Parse incoming JSON into a C struct, validate fields, and reconfigure UART2 automatically |
| **Modbus Reader** | `modbus_reader.cpp/.h` | Initialise `ModbusMaster`, poll holding/input registers, apply scaling, and print results |
| **Main Loop** | `main.cpp` | Serial input handler, WiFi/MQTT scaffolding, non-blocking Modbus polling timer |

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
| `PubSubClient` | ^2.8 | MQTT client (scaffolding) |

### Requirements

- ESP32 Dev Module
- VS Code with PlatformIO, or the PlatformIO CLI
- USB data cable and the appropriate CP210x driver, if required by the board

### Build

From the repository root:

```powershell
pio run -d firmware/legacy-link-core
```

Upload to a connected board by specifying the port for your machine:

```powershell
pio run -d firmware/legacy-link-core -t upload --upload-port COM3
```

Monitor the serial output:

```powershell
pio device monitor -d firmware/legacy-link-core -b 115200
```

Paste a JSON configuration line and press Enter. The gateway will parse, validate, reconfigure UART2, and begin polling Modbus registers.

## Infrastructure

The `infrastructure/` directory provides a ready-to-use **Mosquitto MQTT broker** via Docker Compose.

```powershell
cd infrastructure
cp .env.example .env      # edit credentials as needed
docker compose up -d
```

See [`infrastructure/README.md`](infrastructure/README.md) for full setup instructions, environment variables, and troubleshooting.

## Development Progress

### Merged Pull Requests

| PR | Branch | Description | Author | Merged |
| --- | --- | --- | --- | --- |
| [#3](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/3) | `feature/firmware-base` → `dev` | Initial firmware foundation | @Nezine | 2026-08-20 |
| [#5](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/5) | `feature/firmware-base` → `dev` | Modbus integration, config parser, non-blocking polling | @Nezine | 2026-08-21 |
| [#6](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/6) | `feature/firmware-base` → `main` | Full config-driven architecture: JSON config, Modbus RTU, UART auto-reconfig, WiFi/MQTT scaffolding | @Nezine | 2026-09-03 |
| [#7](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/7) | `feature/infra-base` → `main` | Infrastructure foundation: Docker Mosquitto broker, scripts, docs | @phamTuan207 | 2026-09-14 |

## Roadmap

- [x] Define configuration schema and JSON parsing
- [x] Implement Modbus RTU polling with register map
- [x] Auto-reconfigure UART2 from JSON config
- [x] WiFi and MQTT client scaffolding
- [x] Docker Compose Mosquitto MQTT broker
- [ ] MQTT callback to receive config from broker
- [ ] Publish polled data to MQTT topics
- [ ] Implement the backend gateway API
- [ ] Add a frontend for device status and configuration
- [ ] Add simulator-driven tests for malformed and partial messages
- [ ] Document supported hardware, wiring, and deployment

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Keep changes focused, explain hardware-dependent behavior, and include a test or build command in the pull request description.

## License

No license has been selected yet. Until one is added, the default copyright rules apply and reuse is not automatically permitted.
