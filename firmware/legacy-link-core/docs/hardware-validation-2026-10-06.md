# ESP32 USB and MQTT acceptance run — 2026-10-06

## Tested revision and setup

- Repository baseline: `1c7a872` (firmware includes `830c09f`, shared demo credentials).
- ESP32-D0WD-V3 revision 3.0, 4 MB flash, CP2102 USB bridge.
- Local ignored settings: reachable 2.4 GHz Wi-Fi and a LAN test broker.
- Broker: Mosquitto 2.1.2, running from a temporary directory on the development
  computer, with the agreed demo account and anonymous access disabled.
- No Modbus source, TTL adapter wiring or RS-485 transceiver was attached.
- Existing local include-only edits in `main.cpp` were preserved during testing.

## Passed checks

1. ESP32 build, all nine host test executables, and 19 generated telemetry/status/
   alarm messages checked against backend validators at `1c7a872`.
2. Full 4 MB backup of the board's previous cold-chain demo before flashing.
   The application flash was then compared against all 794816 bytes of the new
   binary; the digest matched before testing.
3. Seven [USB smoke checks](../test/hardware/README.md): normal boot, valid config
   saved, invalid config preserves settings, 4095-byte acceptance, 4096-byte
   rejection/recovery, NUL rejection/recovery, and config restoration after reset.
4. Physical ESP32 Wi-Fi association, time synchronization and authenticated MQTT
   connection. The test broker accepted the demo account and rejected a wrong
   password and anonymous connection.
5. Retained online status was delivered to a newly subscribing test client.
6. A gateway-topic config update was applied and persisted, with the matching
   `requestId` in its ACK. Identical redelivery reported `unchanged`.
7. A device-topic ID mismatch and invalid slave ID 257 were rejected with the
   expected reasons while retaining the active configuration.
8. Holding the board in reset stopped its MQTT connection without a graceful
   disconnect. Mosquitto detected the keepalive timeout and published offline
   Last Will status. Releasing reset restored the saved config and online status.
   This tests an abrupt board outage; the USB power cable was not removed for
   this particular Last Will test.
9. A repeat config after reset reported `unchanged` and `persisted: true`, proving
   the MQTT-applied settings survived the reset. The bench fixture was restored
   to a 2000 ms sampling interval for the next wired test.
10. Captured physical online/offline status payloads passed the actual backend
    status validator, including the connection-time timestamp in the Last Will.

## Observations and limits

The initial USB port produced intermittent read/write transport errors. Full
backup succeeded by reading 256 KiB chunks with retries. A partial application
upload was recovered using 64 KiB ROM-mode writes at 57600 baud, verifying each
chunk and then the complete application. The user moved the board to another USB
port before the seven USB smoke checks, which all completed successfully. Do not
interpret a failed upload as success merely because the board is still connected.

An initial Python test broker did not enforce receive keepalive timeouts in its
installed implementation. Its failed offline test was superseded by the passing
test against Mosquitto; firmware was not changed to work around that broker.

With no Modbus source, `0xE2` response timeouts were expected, and the firmware
omitted failed readings. No physical telemetry value or physical alarm threshold
crossing was validated. The backend MQTT process and PostgreSQL were not running
in this test; validator acceptance is not proof of database insertion. Real
RS-485 wiring, machine register maps and production broker settings still require
their own acceptance check.

The board retains `examples/bench-device.json` settings as `BENCH-01`, ready for
the [CH340 TTL bench wiring](../test/hardware/README.md#usb-to-ttl-bench-wiring).
Use an actual Modbus RTU slave simulator on the adapter's port; a serial terminal
sending text cannot supply register responses.

## Local evidence and recovery

Local files are under `.pio/device-backups/20261006-finalize/` and excluded from Git:
`before-flash.bin`, `before-flash.sha256`, `usb-smoke.log`, `mqtt-events.jsonl`,
and `validated-status-snapshot.json`. The previous-program backup has SHA-256
`6c03bf3278fdab70761545cdf0fd2b4e545cf56a7e1fdd87005812df3824d48d`.
Keep this backup if the cold-chain program needs to be restored. Wi-Fi secrets
remain in ignored `include/local_settings.h`; firmware binaries containing them
are also local build artifacts, not repository attachments.
