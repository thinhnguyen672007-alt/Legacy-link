# OpenModSim and ESP32 acceptance run — 2026-10-08

## Setup

- Firmware branch baseline: `8ec3edd`, with existing local include-only changes
  in `src/main.cpp` (explicit WiFiClient/IPAddress includes).
- Physical ESP32-D0WD-V3 revision 3.0, 4 MB flash; CP2102 for programming/logs.
- OpenModSim 2.0.1 official Linux AppImage on Arch Linux, CH340 TTL adapter,
  crossed UART2 GPIO16/GPIO17 and common ground, separately USB-powered boards.
- Modbus RTU: 9600 baud, 8N1, slave 1, holding registers at raw addresses 0–2.
- Phone hotspot at 2.4 GHz. Site Wi-Fi settings stayed in the ignored local header.
- Authenticated aMQTT test broker on the laptop, using the shared demo account.
  This broker was used for telemetry/alarm receipt, not Last Will acceptance.

## Observed results

1. A complete 4 MB flash backup was saved before updating the Wi-Fi/broker settings.
   The application upload completed and esptool verified its data hash. The board
   retained the BENCH-01 register configuration in NVS.
2. ESP32 connected to the hotspot and published online status and telemetry.
   Raw values 250, 123 and 1500 produced approximately 25 C, 1.23 A and 1500 rpm.
3. Editing raw temperature to 950 produced approximately 95 C. Editing it to -180
   produced approximately -18 C; five consecutive negative-temperature payloads
   passed the backend telemetry validator. Samples arrived about every two seconds.
4. At normal temperature, the base hackathon alarm profile was sent over MQTT.
   The matching config ACK reported `applied`, `reason: ok`, and `persisted: true`.
5. At 95 C, one OVERHEAT/high alarm was received. Fifteen hot telemetry samples
   spanning approximately 28 seconds produced no repeat alarm.
6. At 105 C, one OVERHEAT/critical alarm was received. Nine samples spanning
   approximately 16 seconds initially confirmed no repeated critical alarm.
7. Cooling to 86 C produced six samples spanning ten seconds. Returning to 95 C
   produced exactly one additional high alarm. Thirteen subsequent hot samples
   spanning approximately 24 seconds produced no repeat.
8. The alarm sequence was high -> critical -> high, and all three payloads passed
   the backend alarm validator. The simulator was restored to raw temperature 250.

Small decimal differences (for example 95.00000142) reflect floating-point scaling.
These are illustrative demo thresholds, not machine-approved operating limits.

## Boundaries and evidence

The user subsequently reported that the teammate's backend connection worked.
Database insertion and HTTP `/machines` output were not independently inspected.
Frontend delivery, actual CNC/RS-485 operation, and outage recovery on this hotspot
remain outside this run's verified results. The earlier
[hardware report](hardware-validation-2026-10-06.md) records separate Mosquitto
Last Will and reset-persistence checks.

Local evidence is excluded from Git:

- `.pio/device-backups/20261008-hotspot/`: full flash backup, SHA-256 digest,
  upload log and boot log.
- `.pio/tools/hotspot-events.jsonl`: captured physical MQTT messages.

Keep flash backups, compiled binaries and local network settings private because
these may contain Wi-Fi credentials. Follow the
[OpenModSim demo guide](hackathon-modbus-demo.md) to reproduce the register edits.
