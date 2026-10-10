# USB commissioning and delivery inspection

Open the ESP32 USB serial port at **115200 baud**, send a command followed by a
newline, and leave the CH340 simulator port to OpenModSim. Only one process may
own each serial port. These commands are read-only; they do not start a new
Modbus read, change configuration, clear queues or write NVS.

| Command | Output |
| --- | --- |
| `:help` | Available commands |
| `:health` | One JSON object with connection/clock state, heap, read counters, report drops and both outbox summaries |
| `:inspect` | One JSON line per register in the current profile |
| `:outbox` | Health summary followed by one JSON line per pending telemetry/alarm ID, in FIFO order within each queue |

Normal firmware logs can appear alongside these JSON lines. Do not treat the
serial stream as an unfiltered JSON document. No Wi-Fi or MQTT credentials are
included. `:inspect` intentionally shows sensor values; `:outbox` shows IDs and
payload sizes, without dumping stored payloads.

## Explain a measurement at the bench

An inspection line includes the metric key, raw protocol address, configured
integer type, scale, unit, device ID and active configuration request ID.
After a successful read it adds raw words, decoded raw value and scaled value.
For INT16 raw `65356` (0xFF4C), scale `0.1`, the decoded value is `-180` and the
engineering value is approximately `-18.0`. This makes signedness, addressing
and scaling visible without changing backend APIs.

- `unknown`: no read has completed under this configuration; no numeric value is emitted.
- `ok`: the latest read succeeded.
- `error`: the latest read failed; `errorCode` identifies the Modbus error and no numeric value is emitted.
- `stale: true`: a completed read is older than the greater of five seconds or
  three configured sampling intervals. `ageMs` measures age with the monotonic
  clock. Staleness is independent of `ok`/`error`; it is an inspection heuristic,
  not a machine alarm. A large map with slow transactions can exceed this age.

Applying a changed profile invalidates the cached inspection state immediately.
A rejected profile preserves the working configuration and its cached readings.
A probe uses separate results and restores the active UART settings afterward.
Inspection does not feed the frontend; the team must use the existing backend
read reports and freshness state there. Never present a missing measurement as zero.

## Compare accepted queue IDs before and after an outage

1. Capture `:health` and `:outbox` before stopping a service.
2. During the outage, capture them again. Save each `kind`, `deviceId` and
   `messageId` from `outboxEntry` records. `index` is only the current FIFO position.
3. Restore the service. Compare IDs against database ingestion receipts and rows.
   An ID disappearing from the queue means firmware accepted a matching
   `committed` ACK; a database query is still needed to prove storage/uniqueness.
4. Check `failedEnqueues`, `highWater`, `committed`, `attempts` and `rejection`.
   Unknown/malformed ACKs do not delete samples. A rejected head remains queued.

Each queue is independent: telemetry holds 32 samples, alarms hold 8. When full,
new samples are refused and `failedEnqueues` increases. Existing payloads and IDs
are unchanged across retries. The queues are RAM-only and disappear on reset or
power loss. New configuration takes effect without draining them first, but
FIFO delivery cannot pass a rejected head. This inspection command does not
provide a destructive queue-clear shortcut.

`successfulReads`, `failedReads` and `readReportDrops` are cumulative since boot.
Read counters cover normal sampling, not temporary probes. Report drops include
failed local writes, disconnected sends and report allocation/size failures;
they do not prove that a successful MQTT write reached the backend.

## Delivery state on the machine API

With the matching backend diagnostics support, normal MQTT read reports include
`delivery`: boot ID, RAM storage type, clock readiness, free heap and both queue
summaries. The USB commands remain available independently. After a committed
or rejected ingestion ACK, firmware refreshes the report using the last complete
scan, at most once per second. It never publishes a partly collected map as a
complete scan. This allows the API to return to `healthy` after ACK instead of
permanently displaying the in-flight sample as `backlog`.

Report payloads have a separate 6,144-byte budget; incoming configuration remains
limited to 4,095 bytes. Successful report publication is still a QoS 0 local write,
not a durable backend receipt. An older backend can ignore the optional delivery
object; the new machine API needs the matching backend change (`4914d4b` or later).
