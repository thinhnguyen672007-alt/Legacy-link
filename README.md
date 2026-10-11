# Legacy Link

<img src="frontend/public/legacy-link.svg" width="48" alt="Legacy Link logo">

Connect legacy equipment to a live dashboard using an ESP32.
Built for **DENSO Factory Hacks · D1**: configurable Modbus maps and alarms,
without an industrial PC or reflashing for each machine profile.

## Demo for judges

**[Open live demo](https://vineyard-fifteen-elusive.ngrok-free.dev/)** · **[Download desktop app](https://github.com/thinhnguyen672007-alt/Legacy-link/releases/latest)**

Sign in with a team-provided account. Judge access should use a read-only account;
credentials are shared separately from this public repository. The live demo runs
on a team laptop and is available while that laptop and its network are online.

**Demo video (2–3 minutes):** pending publication. The submission package should
include the video link as an offline-review alternative to the live demo.

In the bench demo, OpenModSim simulates machine registers. A physical ESP32 reads
them and sends measurements to the backend; no real CNC is connected. Open a device
to inspect temperature, current, RPM, measurement freshness and history. Alarm
history shows previous threshold tests; normal operation need not raise an alarm.

![Legacy Link dashboard layout](docs/evidence/fixed-desktop-server/logo-sidebar.png)

*Dashboard preview from a UI validation session with an empty device catalog;
this image illustrates the interface, not live measurement evidence.*

## Architecture

```mermaid
flowchart LR
    M[Machine / OpenModSim] -->|Modbus RTU| E[Physical ESP32]
    E -->|Wi-Fi / MQTT| B[MQTT broker]
    B --> C[Backend consumer]
    C -->|Commit measurements| D[(PostgreSQL)]
    D --> A[HTTP API]
    A --> U[Web / Desktop dashboard]
    C -->|ACK after commit| B
    B -->|Delivery ACK| E
```

## What it does

- Collects named measurements, applies scaling and detects configurable alarms.
- Retries queued measurements until the backend confirms database storage; duplicate messages do not create duplicate records.
- Supports test-read → apply commissioning, employee accounts (admin/read/write), history and AI-assisted investigation.
- Provides a React dashboard and Windows/macOS desktop client. From desktop 0.1.5, the client uses the configured team server automatically.

## Get started

**Use the app:** download an available installer from [GitHub Releases](https://github.com/thinhnguyen672007-alt/Legacy-link/releases/latest), then sign in with an account provided by your administrator. See [desktop installation](desktop/README.md).

**Host the stack:** install Docker Engine and Compose v2, then run:

```bash
cd infrastructure
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work:z" -w /work node:22-alpine node scripts/prepare-env.mjs
# Set DEMO_LAN_IP in .env, then repeat the preparation command above.
docker compose up -d --build --wait
```

Open `http://<server-LAN-IP>:8080`. For a new database, use the admin credentials
generated in the ignored `infrastructure/.env`. Existing accounts retain their
passwords. For upgrades, backups and remote access, follow the
[infrastructure guide](infrastructure/README.md).

**Connect an ESP32:** follow the [firmware guide](firmware/legacy-link-core/README.md).
It requires 2.4 GHz Wi-Fi and local broker credentials. Real equipment needs the
appropriate RS-485 interface; the OpenModSim bench uses verified 3.3 V UART wiring.

## Project guide

| Component | Documentation |
| --- | --- |
| ESP32 firmware, profiles and diagnostics | [Firmware](firmware/legacy-link-core/README.md) |
| HTTP/MQTT contracts | [OpenAPI](backend/openapi.json) · [Delivery contract](docs/telemetry-delivery.md) |
| Accounts and backend deployment | [Accounts](backend/deploy/ACCOUNTS.md) · [Deployment](backend/deploy/README.md) |
| Dashboard and frontend development | [Frontend](frontend/README.md) |
| Windows/macOS app | [Desktop](desktop/README.md) |
| Docker, broker, database and operations | [Infrastructure](infrastructure/README.md) |
| Machine setup through probe/apply | [Commissioning](docs/commissioning-demo.md) |

## Validation and limits

The ESP32 → Modbus simulator → MQTT → PostgreSQL path has physical test evidence
for telemetry, alarms, retries, duplicate handling and recovery. See the
[stack acceptance](docs/physical-acceptance-2026-10-10.md) and
[firmware acceptance](firmware/legacy-link-core/docs/physical-acceptance-2026-10-10.md).

| Demonstrated result | Recorded evidence |
| --- | --- |
| Recovery after consumer, database and broker outages | RAM outbox drained after service restoration in the stack acceptance run |
| Duplicate-safe delivery | 68 captured telemetry IDs with committed ACKs each matched exactly one database row |
| Lost ACK after database commit | Firmware replayed the sample; storage remained one row in the firmware acceptance run |
| Configurable acquisition and alarms | Profile A/B, signed values, scaling, high/critical escalation and rearming exercised on the bench |

These are bounded acceptance results, not a production reliability guarantee.

Real CNC/RS-485 acceptance remains separate from simulator testing. Firmware queues
are RAM-only (32 telemetry samples and 8 alarms); power loss clears pending data.
The demo deployment uses plaintext MQTT on a trusted LAN.

Run checks after installing each component's dependencies:

```bash
npm test --prefix backend
npm test --prefix frontend
npm run build --prefix frontend
npm test --prefix desktop
pio run -d firmware/legacy-link-core
bash firmware/legacy-link-core/test/host/run.sh
```

## License

No repository-wide license file has been selected. Package metadata lists ISC;
confirm licensing before external reuse. The logo's attribution is in
[LOGO-LICENSE.txt](desktop/assets/LOGO-LICENSE.txt).
