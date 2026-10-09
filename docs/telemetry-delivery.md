# Firmware delivery and USB health

Compatible with the C7–C10 backend contract merged in `c021a7e`. ESP32 continues
using MQTT; no new backend endpoint, database column, or infrastructure change
is required by this firmware contribution. Deploy the existing backend migrations
and register the device/gateway before acceptance.

## Delivery protocol

- Telemetry: unchanged device telemetry topic, with `gatewayId` and `messageId`.
- Alarm: unchanged device alarm topic, with `gatewayId`, `eventId`, `metricKey`.
- IDs are generated once from gateway ID, random boot ID and a shared increasing
  sequence. Serialized payloads are retried byte-for-byte, including capture time
  and original device identity even after a configuration change.
- Subscribe QoS 1 to `legacy-link/gateways/{gatewayId}/ingestion/ack`.
- An ACK must match topic, schemaVersion 1, kind, deviceId and messageId, with
  status `committed`. For alarms, ACK messageId matches the original eventId.
- Only this application ACK removes the head sample. MQTT publish success does
  not establish database persistence. Backend sends ACK only after COMMIT and
  re-ACKs identical duplicates; see [backend contract](backend-c7-c8-c9.md).
- `rejected` retains the sample and records the reason. A blocked head retries
  every 30 seconds, so registration can recover `unknown_device`. Identity conflicts
  require operator investigation, not a replacement ID. A blocked telemetry head
  does not block alarm delivery; a blocked head stalls its own queue.

## Capacity and timing

Telemetry has 32 RAM slots; alarms have a separate 8-slot RAM queue. Each has one
head awaiting ACK. Retry delay grows from 1 to 2, 4, 8, 16 and 32 seconds and remains
capped at 32 seconds. Modbus sampling and network servicing continue during waits.
Committed ACKs allow the next head to send on the next loop.

Full queues preserve accepted samples and reject newest enqueues. Telemetry drops
that newest sample. An alarm enqueue failure leaves the alarm monitor eligible to
try again while the threshold condition remains true; a short event that ends
while the queue is full may be lost. The enqueue-failure counter counts attempts,
not distinct lost alarms. Never claim unlimited delivery or total losslessness.

At a 2-second sampling interval an initially empty telemetry queue covers roughly
64 seconds; recovery backlog and slow ACKs reduce available coverage. ESP32 reset
or power loss clears both queues. Sampling before initial clock synchronization
cannot produce valid epoch-stamped telemetry. Flash-backed storage is not included.

Alarm hysteresis and high-to-critical escalation still apply. Successful enqueue
marks the event as notified locally; its serialized copy remains until COMMIT ACK.
Status and diagnostics remain unbuffered. Retry delivery does not require changing
MQTT QoS0 publication or adding a broker offline queue.

## USB health console

At 115200 baud, send `:help` or `:health` followed by newline. JSON configuration
input remains supported. These two commands are read-only and never clear queues,
change machine configuration, publish control commands, or expose Wi-Fi passwords.

`:health` produces one JSON line with gateway/boot IDs, Wi-Fi/MQTT connection flags,
clock readiness, free heap and separate `telemetry` / `alarm` sections:

| Field | Meaning |
| --- | --- |
| pending / capacity | Current queue occupancy / fixed limit |
| highWater | Maximum occupancy during this boot |
| committed | Samples removed after matching committed ACKs during this boot |
| failedEnqueues | Attempts rejected for capacity/size; not a loss estimate |
| headId / deviceId | Identity of the oldest pending sample, when present |
| attempts | Publication attempts for the current head |
| rejection | Most recent explicit rejection reason for that head |

All counters reset with ESP32. Use the report to distinguish an unavailable
backend from registry rejection or queue exhaustion. An empty queue alone does
not prove no measurements were dropped; inspect failedEnqueues too.

## Acceptance runbook

Use the [physical acceptance worksheet](firmware-physical-acceptance.md) for
per-case evidence, registry setup, cold boot, profile switching and TLS prerequisites.

1. Run backend schema/migrations from its C7–C10 docs and verify registry gateway
   matches ESP32's printed gateway ID. Keep ESP32 powered and time synchronized.
2. Record `:health`, MQTT payload IDs and baseline DB rows. Stop the consumer for
   10 seconds, then start it. Confirm pending drains, committed increases and
   failedEnqueues remains zero. Compare the captured enqueued ID set with DB.
3. Repeat separately for database, broker and Wi-Fi outages within capacity.
   Database failure must produce no successful ACK. Never use `down -v`.
4. Lose an ACK or replay an identical captured payload. Confirm one stored receipt
   and record, plus another matching committed ACK. Different content under an
   existing ID must be rejected and retained on ESP32.
5. During telemetry backlog, trigger a high then critical alarm. Confirm distinct
   event IDs, correct metricKey and independent alarm delivery.
6. Change machine configuration while old samples remain. Confirm their device
   IDs and payloads remain unchanged; registry must still accept the old identity.
7. Use `lastMeasurementAt` / `dataAgeSeconds` for frontend age. Backend history
   exposes acquisition and receipt times; delayed delivery must not look newly
   measured. This contribution does not implement a frontend replay label.

Host tests cover FIFO bounds, wrong/duplicate ACKs, offline enqueue, rejection
retention, delayed retry, alarm identity, configuration changes, clock wrap and
read-only health. Contract tests use real firmware serializers and current backend
validators. These are not proof of physical outage recovery. A physical run with
ESP32 + PostgreSQL remains required before claiming end-to-end acceptance.
