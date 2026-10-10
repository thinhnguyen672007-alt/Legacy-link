# ESP32 / C16 physical acceptance — 2026-10-10

Firmware: `d46ba1a`, with ignored site Wi-Fi/broker settings rebuilt and uploaded.
Backend: C16 from `11306a9`, built locally. Schema migration reported version 4.
Device: BENCH-01; gateway: 643C60A7DBCC. Transport: authenticated plaintext MQTT.

## Scope

A real ESP32 reads a Python Modbus RTU slave through CH340 and physical UART
wiring. This run did not use OpenModSim's UI or ESP32-generated sensor data.
Slave 1, 9600/8N1, FC03, raw addresses 1/2/3; sampling every two seconds.
The isolated `legacy-oct10` Compose project runs Mosquitto, PostgreSQL, consumer
and HTTP API. It bypasses the infrastructure watchdog and Nginx proxy; it does
not establish acceptance of the team's complete production deployment.

NVS was backed up before upload. The upload verified flash hashes. On boot,
BENCH-01 configuration was restored; Wi-Fi, NTP and MQTT became ready. Opening
the serial monitor caused a restart, so that event is not a controlled cold-boot
power-loss test. Outage comparisons below are confined to a single boot each.

## Observed results

| Test | Evidence |
| --- | --- |
| Normal acquisition | DB stored approximately 25 C, 1.44 A and 1272 rpm from raw 250/144/1272 |
| Signed INT16 | Raw -180 at address 1 produced approximately -18.00000027 C in PostgreSQL |
| Consumer stopped 12 seconds | Same boot; pending 0 -> 4 -> 0 at snapshots, highWater 8; committed 13 -> 23; failedEnqueues stayed 0 |
| Database stopped 12 seconds | Same boot; pending 0 -> 5 -> 0, highWater 8; committed 6 -> 18; failedEnqueues stayed 0 |
| Broker stopped 12 seconds | Same boot; MQTT became disconnected then reconnected; pending 0 -> 5 -> 0; committed 21 -> 33; failedEnqueues stayed 0 |
| Replay reconciliation | At the recorded checkpoint, 68 captured telemetry IDs with committed ACKs each had exactly one DB row; two IDs had repeated, identical parsed payloads |
| Alarm escalation and rearm | 95 -> 105 -> 105 -> 86 -> 95 -> 25 C, five seconds per step: DB contained exactly high, critical, high events; alarm committed=3, pending=0, failedEnqueues=0 |
| Readiness recovery | `/health/ready` returned ready=true after broker recovery, including DB/schema/consumer/publisher/control |

Backend DB IDs include the gateway storage prefix; reconciliation accounts for
that prefix. Live sampling continued during recovery, so committed deltas include
new samples, not just outage backlog. The 68-ID check is a bounded capture
checkpoint, not a claim about every sample ever accepted offline. Steady alarm
suppression was observed only for the short dwell durations above.

The first DB attempt was invalidated because the tool-session transition stopped
the RTU slave and serial logger. It is not counted as a pass. The DB test was
repeated with live logs and a stable boot ID, yielding the result above.

## Evidence and remaining work

Private local evidence is under
`firmware/legacy-link-core/.pio/acceptance-oct10/evidence/`: serial health, RTU
requests/responses, MQTT messages/ACKs, outage snapshots, reconciliation and alarms.
The database volume and private Compose settings are retained locally. No
credentials or raw site files are committed.

Not tested: Wi-Fi outage, controlled loss of an ACK after DB COMMIT, physical queue
overflow/rejected recovery, actual power-off cold boot, profile A/B via UI,
dashboard rendering, TLS or dedicated gateway ACLs. Earlier host tests cover
several logic paths but do not substitute for these hardware checks. No firmware
code defect was established in this run; this commit records measured evidence.
