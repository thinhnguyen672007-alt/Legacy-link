# ESP32 physical acceptance worksheet

Status: **not executed**. Host tests do not establish hardware, database, TLS or
dashboard acceptance. Run on an isolated demo device with the backend/infra owner.
Do not stop shared services without agreement. Never delete database volumes.

## Before the session

- Record firmware commit, backend commit, broker version and schema migration state.
- Record gateway ID, device ID, broker host/port and serial port identities. Resolve
  CH340 versus ESP32 by USB identity; `/dev/ttyUSB0` numbering can change.
- Register the device and its gateway before sending samples. `unknown_device`
  means registration is missing; `gateway_mismatch` means the mapping is wrong.
  Do not bypass validation or change pending message identities to hide these errors.
- Use OpenModSim RTU, slave 1, 9600/8N1, FC03. Profile A uses raw addresses 1/2/3;
  profile B uses temperature address 49. Confirm protocol addresses with a probe.
- Start timestamped MQTT capture before testing, including telemetry, alarm and the
  gateway ingestion ACK topic. Save USB `:health` snapshots at 115200 baud.
- Export relevant DB receipts/rows through the backend owner. Avoid credentials in
  terminal recordings, screenshots and commits. Keep evidence outside tracked files.
- Start with valid NTP time, empty queues and zero failedEnqueues. Record baseline
  counters. Sampling at 2 seconds provides at most roughly 64 seconds of telemetry
  capacity, less when a backlog already exists.

## Test matrix

| Case | Action | Required evidence / pass condition |
| --- | --- | --- |
| Normal delivery | Change one simulator register | Correct scaled metric, matching ID committed ACK and DB row; dashboard reflects it |
| Consumer outage | Stop only consumer for 10 seconds; restart | Pending grows then drains; committed delta matches accepted samples, failedEnqueues unchanged |
| Database outage | Stop only DB briefly; restore | No committed ACK for uncommitted data; same IDs retry and later commit |
| Broker outage | Stop only broker briefly; restore | Sampling continues, reconnect succeeds, queues drain within capacity |
| Wi-Fi outage | Disable ESP32's network briefly; restore | USB health remains usable; valid capture timestamps survive replay |
| Lost ACK | In isolated harness, suppress ACK delivery after DB COMMIT, then restore | Same ID and byte-identical payload retry; exactly one DB receipt and data row; new committed ACK |
| Rejected head | Use an unregistered test device, then register it | Reason unknown_device visible, head retained, retry about every 30 seconds; registration lets it drain |
| Full queue | Withhold ACK until pending reaches 32; sample again | Pending stays 32, failedEnqueues increases; oldest ID unchanged; recovery drains accepted samples only |
| Independent alarms | Hold telemetry ACKs, cross an alarm threshold | Separate eventId and alarm queue; alarm committed ACK drains its queue independently |
| Backlog/config switch | Queue A samples, apply B through UI | Old serialized data/IDs unchanged; subsequent measurements use B; both identities remain registered |
| Invalid config | Apply invalid slaveId 257 through UI | Rejected config, previous map remains active; record response and subsequent readings |
| Signed/scaled value | A temperature raw -180 (FF4C), scale 0.1 | Approximately -18 C in telemetry, DB and dashboard; no second scaling |
| Alarm sequence | Demo temperature 25 -> 95 -> 105 -> 105 -> 86 -> 95 C | High, critical, no repeated steady alarm, cooling rearms high; distinct event IDs stored once |
| True cold boot | Drain first, unplug all ESP32 power, reconnect | New boot ID, NVS map restored, Wi-Fi/NTP/MQTT recovered and valid timestamps |

Repeat outages independently, restoring healthy operation between cases. If the
queue is intentionally nonempty before cold boot, document that RAM samples are
lost by design; NVS configuration persistence does not persist the outbox.

For ACK suppression, configure the isolated test broker/harness with the infra
owner. Publishing the same message twice from a laptop tests backend deduplication
but does **not** prove ESP32's lost-ACK retry behavior. Do not inject forged
`committed` ACKs: that could discard a sample not yet stored.

## Reconciliation and evidence

For each case record start/end time, boot ID, pending, committed, failedEnqueues,
highWater, headId, rejection, freeHeapBytes and register read errors from diagnostics.
Record the exact fault and restoration action. Use separate ID sets for telemetry
messageId and alarm eventId; compare recovered IDs against DB receipts and data rows.
Each ID must have one stored row, even if MQTT shows multiple deliveries.
The current backend stores identified events under `gatewayId:messageId` (or
`gatewayId:eventId` for alarms); MQTT ACKs carry the original ID without that
extra storage prefix. Normalize this deliberately when comparing evidence.

`:health` exposes only the queue head, not every offline enqueue ID. A complete
enqueue-ID ledger therefore needs test instrumentation or an externally tracked
deterministic fixture; MQTT capture alone cannot prove every offline sample existed.
At minimum reconcile counters within one boot:

`accepted enqueues = committed_after - committed_before + pending_after - pending_before`

Report failedEnqueues separately. Do not treat ID gaps as loss counts, because IDs
are shared across telemetry/alarms and some candidate messages may not be queued.
Check acquisition timestamps versus receipt times: replayed data must not appear
fresh merely because it arrived now. Preserve raw evidence and mark each case
PASS, FAIL or NOT RUN, with evidence filenames and observed limitations.

## Dedicated credentials and TLS gate

Current firmware uses plain `WiFiClient`; changing the port to 8883 does not enable
TLS. TLS remains **unimplemented and unverified** in this acceptance worksheet.
Before implementing it, obtain the broker DNS name, TLS port, CA chain, gateway
username/password, ACL topic list and whether client certificates are required.
Agree certificate rotation and valid-time bootstrap with infrastructure.

Acceptance must include a valid connection plus rejection of an untrusted CA,
wrong hostname and invalid credentials. Do not use `setInsecure()` or fall back
silently to plaintext. Store site secrets locally, never in Git. The existing
shared demo account is not evidence of dedicated-gateway credential acceptance.

Related: [delivery limits and USB commands](telemetry-delivery.md),
[profile fixtures and historical bench evidence](bench-01-handoff-2026-10-08.md).
