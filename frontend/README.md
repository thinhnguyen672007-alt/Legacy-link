# Legacy-link frontend

A React + TypeScript dashboard for the existing Node.js HTTP backend. It reads
real machine state and register maps; no backend or firmware changes are required.

## Run

Use Node.js 22.12+ (or a newer supported LTS release).

```bash
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. In **Connection**, enter the backend laptop's reachable
HTTP URL, for example `http://192.168.1.20:3000`, then select **Save & connect**.
The address is saved in this browser, not committed or baked into the build.
The default is the frontend hostname on port 3000; change it for a remote backend.
MQTT's port 1883 is not an HTTP endpoint. Never put broker credentials here.

For another laptop to open the development frontend on a trusted local network:

```bash
npm run dev -- --host 0.0.0.0
```

Open the printed LAN URL. The backend must be reachable from that browser and
allow its origin through CORS. An HTTPS frontend needs an HTTPS backend; browsers
block mixed-content requests to an HTTP backend.

For a production build:

```bash
npm run build
npm run preview
```

Deploy `dist/` to a static host. Hash navigation needs no server-side route rewrites.
Fonts ship locally; no Google Fonts or external font service is required.

## Screens and integration

| Screen | Available now |
| --- | --- |
| Overview | Poll `/machines` every 2 seconds; search, filter, select a device, read metrics, pause or manually refresh |
| Register maps | Read `/catalog?deviceId=...`; inspect raw address, calculated Modicon reference, type, scale, units; export catalog JSON |
| Connection | Validate and save HTTP address; explain current backend capabilities and demo setup |

Live mode is the default. **Sample** explicitly loads static, labeled interface
fixtures and makes no API requests. It never replaces a failed live response.
Sample selection is not persisted. Browser reload returns to live mode.

Polling is serial, with a 6-second timeout and no overlapping automatic requests.
It suspends while the tab is hidden. A failed request keeps the last successful
snapshot, marks gateway state unverified, and exposes recovery actions. Changing
the API address or switching source clears the previous source's readings.

### Supported API contract

`GET /machines` returns an array, not a `{ data: ... }` wrapper:

```json
[
  {
    "deviceId": "esp32-01",
    "name": "CNC 01",
    "machineType": "CNC",
    "online": true,
    "lastSeenAt": "2026-10-08T08:00:00.000Z",
    "metrics": { "temperature": 25, "current": 1.23, "rpm": 1500 }
  }
]
```

`lastSeenAt` and `metrics` may be `null`. Measurements must be finite numbers;
zero and negative measurements are preserved. The frontend does not scale again.

`GET /catalog?deviceId=...` uses the firmware-shaped camelCase contract in
`backend/src/db/catalog.js`. Catalog decimal strings from PostgreSQL are accepted.
Alarm fields are optional, allowing both `main` and the in-progress backend branch.
Units come from the catalog; when it cannot load, the UI does not guess units.
The conventional Modicon reference is computed as raw address + 40001 for FC03
or + 30001 for FC04. The underlying raw address remains unchanged.

### State semantics and remaining backend work

- `online` represents the backend's gateway connection state, **not whether the
  CNC is cutting or idle**.
- `lastSeenAt` currently changes on status and telemetry. A contact older than
  15 seconds is labeled **No recent contact**, not definitively disconnected.
  This UI heuristic may need adjustment for slower reporting profiles.
- The API does not expose per-metric timestamps, so current contact does not
  prove that every metric is fresh. Offline/unverified values remain snapshots.
- The catalog does not prove which configuration is currently applied on ESP32.
- Alarm history, measurement history, device creation, and configuration publish/
  acknowledgement APIs are not available. The UI does not emulate their success.
- `/health` is process liveness only. Connectivity is verified using a valid
  `/machines` response instead.

Next integration work: expose measurement timestamps and history; expose alarm
list/state; add configuration validation/publish/ACK endpoints. Agree contracts
with the backend owner before implementing those screens.

## Validation

```bash
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

On Linux CI, install browser system dependencies using Playwright's documented
`--with-deps` option. A custom `PLAYWRIGHT_BROWSERS_PATH` can keep downloads outside
the user cache. Browser tests use intercepted API fixtures, not production data.
They cover negative values, malformed responses, empty results, endpoint switching,
explicit sample mode, network recovery, pause/resume, catalog export, responsive
layout, and axe accessibility checks at 359, 390, 768, and 1440 pixels.
These tests do not establish physical ESP32 -> PostgreSQL -> frontend acceptance.

## Code map

- `src/model.ts`: backend types, response validation, state labels and formatting.
- `src/api.ts`: HTTP requests and local endpoint preference.
- `src/useGateway.ts`: cancellable polling and device-specific catalog reads.
- `src/App.tsx`: routes, workspace controls and screens.
- `src/styles.css`: responsive design tokens and layouts.
- `src/samples.ts`: explicit preview fixtures.
- `tests/`: model and browser integration tests.

Design context is recorded in the repository's `PRODUCT.md` and `DESIGN.md`.
