# AI DENSO Investigation

## What ships

Natural questions go to Gemini function calling, not keyword routing. The model sees up to four previous turns and actual device IDs, chooses read tools in up to three rounds, receives backend evidence, then supplies a validated JSON interpretation. Each finding cites evidence from the current turn. Backend owns status, priority, counts, points and statistics; frontend renders those facts independently of generated prose.

Eight tools: `get_factory_summary`, `get_anomalous_devices`, `get_devices_by_temperature_status`, `get_device_status`, `get_device_telemetry_history`, `get_recent_alerts`, `get_device_alerts`, `compare_devices`. History supports a registered `metricKey` such as current/rpm and windows 1–60 minutes. Comparison accepts 1–6 distinct devices. Device names are data, not instructions. No SQL, control or configuration tools exist.

The expanded workspace shows conclusions/evidence references, counts, priorities and inspection steps, current metrics, history statistics, sampled-point charts, alert events and tool trace. VI/EN follows the existing language switch. Charts automatically expand. Loading shows elapsed time; failures retain available evidence. A new-conversation control clears context. Source times use GMT+7.

## Limits that users must see

- Connectivity, warnings and reading anomalies do not prove mechanical failure. There is no backend source of confirmed breakdowns or root causes; `failureConfirmed` remains false.
- Database provenance is shown. Only explicit machine type `simulator`/`bench` identifies simulation. Other machines remain unverified; the app does not invent real-production provenance.
- Historical telemetry has no per-sample unit/configuration revision. Charts therefore label historical units unverified and plot actual points without inferred lines. Current units are displayed separately. No unsupported physical ranking of different units.
- Missing one temperature threshold means the tool can identify a violation of the configured threshold but cannot certify normality. Unknown temperature metadata, stale/future/error readings remain explicit.
- Up to 100 devices, 50 recent alert events, 2,000 points per series and 6,000 points across a comparison; truncation and actual coverage are visible. The model gets at most 30 devices and about 40 sampled points per series, plus backend statistics; dashboard retains returned full points.
- Maximum 8 tool calls, 4 calls per batch, 3 rounds + final synthesis; 50 seconds per investigation, 12 seconds per provider request and 8 seconds per tool. No automatic provider retries.
- Local limit: 24 model calls/minute/process, 2 concurrent investigations. Gemini provider limits may be lower. Provider 429 starts a 60-second pause and explicit notice; quick actions remain usable without Gemini.
- Context expires after 10 minutes; max 50 in-memory sessions. It belongs to the authenticated bearer/session and disappears on API restart. Expired context returns 410; start a new conversation.
- All current authenticated roles can read factory data, following existing permissions. The repository currently has no per-device ACL. Viewer cannot use write routes; AI has no write routes/tools.
- JSON validation verifies shape and evidence references, not the semantic truth of every model sentence. Treat interpretation as AI analysis and inspect the backend evidence before acting.

## Configuration and deployment

Set `GEMINI_API_KEY` and `GEMINI_MODEL` in the untracked `infrastructure/.env`, then recreate `backend-api`. Never commit or log credentials. Existing `docker compose --profile full up -d --build` includes these features; no extra service or dependency is required. API request body accepts `language: "vi" | "en"`, optional `conversationId`, and exactly one of `question` or `action`.

Function calling and preservation of complete model content follow https://ai.google.dev/gemini-api/docs/function-calling . The frontend uses the existing Impeccable instructions from the referenced frontend agent kit.

## Verification commands

```sh
cd backend && npm test
cd ../frontend && npm test && npm run lint && npm run build
```

Read-only real acceptance (actual Gemini and running database, no writes):

```sh
node backend/scripts/gemini-readiness-check.mjs infrastructure/.env
node backend/scripts/investigation-live-check.mjs infrastructure/.env --deployed
# One chart request when provider quota is tight:
INVESTIGATION_EVIDENCE_PATH=/tmp/investigation.json node backend/scripts/investigation-live-check.mjs infrastructure/.env --deployed --chart
```

Full suite contains five different phrasings, discovery, why/alerts/history and a contextual chart follow-up. A result can be partial under provider limits; do not call that full AI synthesis success. Run only the supported API against the demo; existing ingestion/accounts integration scripts mutate data and are not needed here.

Browser E2E replays the captured report and verifies actual chart points, desktop/mobile overflow, context, partial evidence and reset. This is rendering evidence, not a second live-provider integration test. Install Playwright outside the repo if absent, then:

```sh
PLAYWRIGHT_MODULE=/tmp/browser/node_modules/playwright/index.mjs node frontend/scripts/investigation-browser.mjs /tmp/investigation.json
```

## Acceptance record — 2026-10-10

- Real SDK/model `gemini-3.5-flash-lite` selected read tools successfully.
- Real Gemini + running HTTP/database: factory investigation, one-hour comparison (only one registered machine), why BENCH-01, and contextual chart follow-up completed; tool counts 3/2/3/1. History returned 735/732/280 points at that check.
- A fifth unfamiliar colloquial question retrieved four tools, then Gemini returned 429. UI retains evidence with partial status; no fabricated analysis. A separate chart request after provider recovery completed with 217 real stored points.
- Bench/simulator telemetry is real collected demo data, not evidence of production machinery. Multi-device comparison with missing machines, stale/offline/missing thresholds, malformed tool calls, timeouts and permission checks are covered by fixtures/unit/HTTP integration tests.

- Deployed Docker API: the unfamiliar colloquial question completed with three read tools. A live browser, bootstrapped with the existing read token (login was not retested), called the deployed AI endpoint and rendered a 60-minute history with 471 database points and valid findings. A 20-minute history correctly contained no points after the gateway stopped; this was not filled with simulated readings.
- Final automated suites: 103 backend tests, 80 frontend tests; lint/build pass. Desktop/mobile browser replay passed context, charts, partial state, reset and no horizontal overflow. Detector: 0 non-advisory failures. Existing frontend bundle-size warning remains.
- Live API gateway generated config was reloaded with the 60-second proxy timeout. The committed template preserves this on deployments from the new code; the old original checkout template must be updated/pulled before independently recreating that gateway.
