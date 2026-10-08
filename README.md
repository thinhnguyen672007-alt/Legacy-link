# Legacy-link

A configuration-driven ESP32 gateway for collecting data from legacy equipment.
Built for DENSO D1: low-cost connectivity for equipment without an industrial PC.
Machine register maps and alarm thresholds can change through JSON configuration
without reflashing the gateway.

```text
Modbus RTU machine / OpenModSim
    -> ESP32 -> Wi-Fi / MQTT -> Node.js backend -> PostgreSQL -> HTTP API
                                                                    -> frontend (planned)
```

**Status:** firmware, backend and infrastructure are implemented. Physical
OpenModSim -> ESP32 -> MQTT telemetry and alarms have been tested. Frontend code
is not yet included; database/API/frontend acceptance and real CNC/RS-485 checks
remain to be completed. See the [hardware reports](#validation).

## Components

| Path | Contents |
| --- | --- |
| [`firmware/legacy-link-core/`](firmware/legacy-link-core/README.md) | PlatformIO ESP32 firmware, configuration examples, host and hardware tests |
| [`backend/`](backend/) | MQTT consumer, payload validation, PostgreSQL storage and HTTP API |
| [`infrastructure/`](infrastructure/README.md) | Mosquitto and PostgreSQL Docker Compose services, setup scripts and runbook |
| [`tests/`](tests/) | Placeholder for cross-component tests |

- **Firmware:** Modbus holding/input registers (FC03/FC04), INT16/UINT16/UINT32,
  scaling, Wi-Fi reconnection, NTP time, retained status and offline Last Will.
  Configurable alarms support critical escalation and hysteresis to suppress
  repeated notifications. Valid configuration persists in ESP32 flash.
- **Backend:** validates telemetry/status/alarm messages, stores measurements and
  alarms, maintains latest machine state, and combines shared register maps with
  per-device overrides.
- **Infrastructure:** authenticated MQTT broker and PostgreSQL. Both Compose
  profiles, `broker` and `full`, currently start the same infrastructure services;
  backend and HTTP API run separately.

## Quick start

Requirements: Docker with Compose v2, Node.js 22+, PlatformIO, and an ESP32 with
2.4 GHz Wi-Fi. Use a suitable RS-485 adapter for industrial equipment; the
OpenModSim bench demo uses a CH340 TTL adapter with verified 3.3 V UART logic.

### 1. Start infrastructure

From the repository root:

```bash
cd infrastructure
COMPOSE_PROFILES=broker ./scripts/setup.sh --seed
```

The script prepares `.env` and broker authentication, starts services, loads the
available database schema and optional demo seed, and tests MQTT access. Omit
`--seed` when sample devices are not needed. Review generated credentials and
ports before deployment. See the [infrastructure guide](infrastructure/README.md)
and [runbook](infrastructure/docs/runbook.md).

### 2. Start backend and API

In a new terminal, from the repository root:

```bash
cd backend
# First setup only; keep an existing .env.
cp .env.example .env
npm ci
npm start
```

Edit `.env` before starting: match `MQTT_URL`, `MQTT_USERNAME`, `MQTT_PASSWORD`,
`MQTT_QOS` and `DATABASE_URL` to the running services. For a remote broker, replace
localhost with its reachable LAN address. Keep credentials out of Git.

Start the HTTP API in another terminal:

```bash
cd backend
node src/http/server.js
```

| GET endpoint (port 3000) | Returns |
| --- | --- |
| `/health` | Process liveness (`OK`), not a database readiness check |
| `/machines` | Catalog devices with online state and latest metrics |
| `/catalog?deviceId=esp32-01` | Device configuration with merged `registerMap` |
| `/hello?name=demo` | Basic HTTP connectivity check |

A device must exist in the catalog to appear in `/machines`. The current catalog
response does not include alarm settings; use an alarm-enabled JSON profile for
the demo. Firmware receives configuration over MQTT or Serial, rather than fetching
this HTTP endpoint automatically.

### 3. Configure and flash ESP32

From the repository root, copy the settings template **only on first setup**:

```bash
cp firmware/legacy-link-core/include/local_settings.example.h firmware/legacy-link-core/include/local_settings.h
```

Edit the ignored `local_settings.h` with Wi-Fi, broker address/credentials, NTP and
RS-485 direction-pin settings. ESP32 needs the broker's reachable LAN address.
Wi-Fi/broker changes currently require rebuilding and uploading.

```bash
pio run -d firmware/legacy-link-core
# Replace /dev/ttyUSB1 with the ESP32 programming port (for example COM3 on Windows).
pio run -d firmware/legacy-link-core -t upload --upload-port /dev/ttyUSB1
pio device monitor -d firmware/legacy-link-core -b 115200
```

Follow [first connection](firmware/legacy-link-core/docs/first-connection.md) for
provisioning and [the OpenModSim demo](firmware/legacy-link-core/docs/hackathon-modbus-demo.md)
for wiring, register values and the alarm demonstration.

## MQTT and configuration contract

Device topics use `legacy-link/devices/{deviceId}/`:

| Suffix | Direction / content |
| --- | --- |
| `telemetry` | ESP32 -> backend: named numeric `metrics` object |
| `status` | ESP32 -> backend: boolean `status`, retained, with offline Last Will |
| `alarm` | ESP32 -> backend: `code`, `severity`, `value` |
| `config` | Controller -> ESP32: update the currently assigned device |

Telemetry, status and alarm payloads contain `schemaVersion: 1`, a matching
`deviceId`, and an integer epoch-millisecond `timestamp`. Firmware synchronizes
time before publishing measurements.

For initial setup or a device identity change, publish JSON at QoS 1 to
`legacy-link/gateways/{gatewayId}/config`; Serial prints the hardware gateway ID.
Check `legacy-link/gateways/{gatewayId}/config/ack` for application and persistence
results. Retained configuration is redelivered on reconnect and can overwrite
later Serial changes.

Configuration uses `registerMap[].key`, `address`, `functionCode`, `dataType` and
`scale`. Addresses are raw zero-based values: holding register 40050 becomes 49.
Firmware applies scale once. Maps support 1–16 entries, payloads up to 4095 bytes;
invalid updates preserve the active configuration. Start with the
[example profiles](firmware/legacy-link-core/examples/) and consult
[backend alignment](firmware/legacy-link-core/docs/backend-alignment.md) or
[firmware operation](firmware/legacy-link-core/docs/firmware-operation.md) for details.

## Validation

After building firmware to install its dependencies, run from the repository root:

```bash
bash firmware/legacy-link-core/test/host/run.sh
python3 firmware/legacy-link-core/test/host/run_contract.py --backend-ref origin/main
(cd backend && npm test)
```

Fetch `origin/main` before the contract check. Host tests use address/undefined
behavior sanitizers; in environments where LeakSanitizer cannot run, set
`ASAN_OPTIONS=detect_leaks=0`. [GitHub Actions](.github/workflows/build.yml) builds
ESP32 firmware, runs nine host test executables and checks generated MQTT payloads
against backend validators for pushes/PRs to `main` and `dev`.

Physical evidence:

- [October 6](firmware/legacy-link-core/docs/hardware-validation-2026-10-06.md):
  USB/config persistence, Mosquitto Last Will/recovery and signed Modbus telemetry.
- [October 8](firmware/legacy-link-core/docs/hardware-validation-2026-10-08.md):
  OpenModSim telemetry, high/critical alarms, repeat suppression and rearming.

Next milestones: verify database/API delivery, integrate the team's frontend,
and validate the target machine's register map and industrial RS-485 connection.

## License

A repository-wide license has not been selected. Package metadata currently lists
ISC, but no root license file is provided; clarify licensing before external reuse.
