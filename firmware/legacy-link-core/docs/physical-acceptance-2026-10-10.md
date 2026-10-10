# Physical firmware acceptance — 10 October 2026

## Tested versions and bench

ESP32 application from `1c5809d`; later documentation and merge commits did not change the flashed runtime. Application SHA-256: `298afd1ebbd7e7d3e5ffe96da5fabeca2e852a662fcb2a482eb6c287141feed2`. Upload verification passed. Build: RAM 107,452 bytes; flash 802,753 bytes. An NVS backup was taken before upload.

The physical ESP32 read Modbus RTU through a CH340 TTL adapter and a local register simulator. Local Mosquitto, the backend at `0ad8243`, and PostgreSQL handled actual messages and commits. This is not an RS-485 electrical or CNC-machine acceptance test. MQTT was plaintext as requested. No frontend acceptance is claimed.

Host validation passed all 17 test executables. All 22 generated contract messages passed against the integration backend and merged main `727b08d`.

## Results

| Scenario | Observed result |
| --- | --- |
| Measurements | 25°C, 1.44 A and 1272 rpm reached the backend; -18°C was stored correctly. |
| Alarm transitions | 95°C high, 105°C critical, steady 105°C without extra alarm, 86°C cool, then 95°C high again. Database sequence matched the three expected alarms. |
| Profile A/B | Probe/apply persisted the alternate temperature register; 42°C arrived without reflashing. Profile A was restored. |
| UINT32 word order | Words 1 and 2 produced 65,538 high-first and 131,073 low-first through the backend. |
| Lost ACK after commit | Broker read ACL temporarily blocked ingestion ACK delivery. The captured message was retried four times with identical payload; PostgreSQL contained exactly one row. Restoring ACK delivery drained the queue. |
| Consumer, database and broker outages | Each service was stopped separately for 12 seconds and restored. Pending samples drained without reboot or additional enqueue losses. |
| Queue full | At 100 ms sampling with the consumer stopped, telemetry reached its 32-slot capacity. The complete intentional saturation test recorded 92 failed enqueues; existing queued samples were preserved and drained after recovery. |
| Rejected ACK | A deliberately injected rejection retained the head and all 32 queued entries. This verifies firmware handling, not a real backend catalog rejection decision. |
| Profile change with backlog | Profile B applied while A samples remained pending. The original head was retained; recovery drained queued samples and delivered B measurements. |
| Read failures | Missing simulated registers caused Modbus exceptions. Diagnostics reported failed readings without fabricated numeric values; restoring registers recovered valid readings. |
| Delivery health | ACK-triggered diagnostics returned pending to zero, allowing the API to classify the gateway as healthy between scans. |
| Physical power cycle | User confirmed unplugging both USB devices and reconnecting after the requested wait. Serial disconnect was observed, but the USB watcher missed the absence interval, so its duration was not independently measured. A new boot ID, restored NVS configuration, synchronized clock, resumed MQTT delivery and stored measurements were verified afterward. |
| RAM loss on power cycle | Four captured, uncommitted pre-power-off telemetry IDs remained absent from PostgreSQL after recovery, matching the documented volatile queue limit. |

Before the power-loss experiment, reconciliation verified 196 captured committed telemetry IDs with exactly one database row each, 68 pending-ledger IDs stored exactly once, and seven retried IDs with unchanged payload. These aggregate captures span the intermediate and final runtime boots; the scenarios above were also exercised on the final runtime. The four deliberately lost power-cycle IDs are excluded from that reconciliation.

## Evidence and limits

Private raw captures, operation results and SQL reconciliation are retained locally under `.pio/final-acceptance/`; they are ignored by Git. The post-power-cycle boot was `893CFA09E3DEFD63`, replacing `4D26BCE76DB3F487`. Backend readiness returned all checks true. The restored profile delivered 25°C, 1.44 A and 1272 rpm with zero pending telemetry in a captured diagnostic.

Two harness issues were corrected during testing: a commissioning request initially targeted an old boot during startup, and an observer initially failed on an empty retained MQTT payload. Only reruns with the corrected harness count as successful tests. The post-power-cycle serial health polling did not resume successfully; recovery conclusions use actual MQTT diagnostics, API state and database checks instead.

Not independently accepted here: a controlled Wi-Fi-only outage, cold-boot LWT timing, a production broker's per-gateway ACL, TLS, actual RS-485/CNC hardware, and frontend presentation. The queue remains RAM-only; it drops new samples when full and cannot survive power loss. Rejected heads remain queued and can block later delivery. These are explicit limits, not lossless-storage claims.

The local consumer, database and broker were restored, the temporary ACK-blocking ACL was removed, and profile A was left active at a two-second sampling interval. Teammate branches were fetched before delivery; infra's latest merge `20c6991` incorporated main `727b08d` without requiring another firmware contract change.
