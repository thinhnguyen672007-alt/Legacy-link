# DENSO D1 demo with OpenModSim and ESP32

Use OpenModSim to represent a legacy PLC's register interface. Demonstrate the
measurements on the team's frontend through the normal backend and database.

```text
OpenModSim (PLC simulator on Linux or Windows)
    -> CH340 UART, Modbus RTU
    -> physical ESP32 gateway
    -> Wi-Fi / Mosquitto MQTT
    -> backend / PostgreSQL / HTTP API
    -> team frontend
```

OpenModSim replaces the expired Witte Modbus Slave trial. It is a free,
MIT-licensed Modbus slave/server supporting RTU and TCP. Download it from the
[official releases](https://github.com/sanny32/OpenModSim/releases) and follow the
[platform installation instructions](https://github.com/sanny32/OpenModSim#readme).
Use **RTU** for this firmware. Menu labels can vary by OpenModSim version; the
settings below specify the protocol values rather than Witte keyboard shortcuts.

This procedure requires a connected ESP32 and CH340. Without the board, you can
prepare the simulator's registers, but cannot demonstrate this physical data path.

## 1. Connect the simulator to ESP32

Power ESP32 and CH340 through their own USB connections. Use verified 3.3 V UART
logic on CH340; the adapter's VCC selector alone does not prove its TXD level.

| CH340 | ESP32 |
| --- | --- |
| TXD | GPIO16 / RX2 |
| RXD | GPIO17 / TX2 |
| GND | GND |

Leave VCC, 5V and 3.3V pins between boards unconnected. This is a TTL bench link;
industrial RS-485 requires an appropriate transceiver. See the
[hardware wiring guide](../test/hardware/README.md#usb-to-ttl-bench-wiring).

Select the **CH340** serial port in OpenModSim, not the ESP32 programming port.
On Linux, inspect `/dev/serial/by-id/`; on Windows, use Device Manager > Ports.
Close any other program using that same port.

## 2. Set up OpenModSim

Configure the serial server and register table with these values:

| Setting | Value |
| --- | --- |
| Protocol | Modbus RTU |
| Serial port | CH340 port discovered above |
| Baud rate | 9600 |
| Data bits / parity / stop bits | 8 / None / 1 (8N1) |
| Flow control | None |
| Slave / unit ID | 1 |
| Register type | Holding Registers (read function 03) |
| Address display | Zero-based |
| Register range | Raw addresses 0 through 49 |

Enter the raw values below. Use 16-bit signed display for temperature and unsigned
for current/rpm, with no display scaling. Firmware applies scale once.

| Raw address | Modicon label for reference | Raw value | Decoded metric |
| --- | --- | --- | --- |
| 0 | 40001 | 250 | temperature = 25 C |
| 1 | 40002 | 123 | current = 1.23 A |
| 2 | 40003 | 1500 | rpm = 1500 |
| 49 | 40050 | 420 | alternate temperature = 42 C |

Start the RTU server and inspect OpenModSim's traffic log once ESP32 is configured.
The ESP32 initiates reads; changing a cell alone does not send MQTT or update the
frontend. Firmware JSON uses raw addresses such as `0` and `49`, not `40001` or
`40050`.

## 3. Prepare the team's data path

Start the team's Mosquitto/PostgreSQL stack using the
[infrastructure guide](../../../infrastructure/README.md), then start the backend
MQTT consumer and HTTP API. Open the team's frontend connected to that API.

Ensure ESP32's ignored `include/local_settings.h` points to the broker's reachable
LAN address and matching credentials. ESP32 needs 2.4 GHz Wi-Fi and NTP access.
The backend can use localhost when it runs on the broker machine; ESP32 cannot.
Changing the laptop's OS or network can change its IP address.

The supplied profiles use device ID **BENCH-01**. Ensure this device exists in the
backend device catalog so `/machines` and the frontend can list it. If the team
uses another ID, update both profiles and the matching catalog entry consistently.
The register map must match the simulator table above.

Publish the [base profile](../examples/hackathon-modbus.json) to the gateway config
topic. Use the gateway ID printed in the ESP32 startup log. Subscribe to
`legacy-link/gateways/<gatewayId>/config/ack` before publishing.

For example, from the repository root on Linux with Mosquitto CLI tools installed:

```bash
# Replace this with the ID printed by the connected board.
GATEWAY_ID=643C60A7DBCC
mosquitto_sub -h localhost -p 1883 -u legacy_admin -P legacy_secret_2026 \
  -t "legacy-link/gateways/$GATEWAY_ID/config/ack" -v
```

In another terminal, set the same `GATEWAY_ID` and publish:

```bash
GATEWAY_ID=643C60A7DBCC
mosquitto_pub -h localhost -p 1883 -u legacy_admin -P legacy_secret_2026 \
  -q 1 -r -t "legacy-link/gateways/$GATEWAY_ID/config" \
  -f firmware/legacy-link-core/examples/hackathon-modbus.json
```

On Windows, invoke `mosquitto_sub.exe` / `mosquitto_pub.exe` from the Mosquitto
installation directory with the same arguments, substituting the gateway ID
literally in the topic. The credentials above are the repository's demo defaults;
use the actual broker account if changed. Replace localhost if the broker is remote.

Require an ACK with `requestId: "hackathon-base"`, `result: "applied"` or
`"unchanged"`, and `persisted: true`. Then check `/machines` and the frontend for
BENCH-01 with 25 C, 1.23 A and 1500 rpm. MQTT receipt alone does not prove database
insertion or frontend delivery.

## 4. Demonstrate by changing register values

Keep each value for at least three complete samples before advancing. The base
profile samples every two seconds. Observe readings on the team's frontend.

| Action in OpenModSim | Expected result |
| --- | --- |
| Keep raw 0 = 250 | Frontend shows approximately 25 C |
| Set raw 0 = -180 (unsigned word 65356 if needed) | Frontend shows approximately -18 C |
| Set raw 0 = 950 | 95 C; firmware emits one OVERHEAT/high alarm |
| Keep 950, then 895, then 910 | Telemetry continues without repeated high alarms |
| Set raw 0 = 870, wait, then 950 | Alarm rearms at 87 C and fires high again above 90 C |
| Set raw 0 = 1050 | 105 C; one OVERHEAT/critical alarm above 100 C |

Alarm display requires the team's frontend and backend alarm API integration.
Until available, validate alarms in MQTT/database separately and do not claim that
the frontend supports them. These thresholds are illustrative demo settings.

Optionally show configuration changes without reflashing: restore raw 0 = 250,
keep raw 49 = 420, then publish
[the remapped profile](../examples/hackathon-modbus-remapped.json) using the same
command with its file path. Wait for `requestId: "hackathon-remap"` in the ACK.
Temperature becomes 42 C and the sampling interval becomes one second. Restore the
base profile afterward. Configuration changes reset alarm suppression.

Stopping OpenModSim causes failed reads and missing fresh telemetry; the gateway
can remain online on MQTT. The frontend should distinguish stale measurements
from gateway connectivity.

## Evidence and remaining checks

The [2026-10-06 hardware report](hardware-validation-2026-10-06.md) records a passing
CH340 -> ESP32 -> MQTT run, including signed temperature decoding. That run did
not test PostgreSQL insertion, physical alarm crossings or this OpenModSim setup.
Record the actual simulator version and end-to-end results during rehearsal.

For DENSO D1, present the simulator as a PLC substitute and the ESP32 as the physical
gateway. Use actual component prices and measured setup times for cost/time
comparisons. Real machine compatibility and RS-485 installation need separate checks.
