# DENSO hackathon: Modbus Slave and physical ESP32 demo

## Purpose and challenge alignment

The public [DENSO Factory Hacks 2026 homepage](https://densohackathon.vn/home)
lists D1, **Low-Cost Connectivity for Non-IPC Legacy Equipment**, under Data
Utilization. Its deliverables include a low-cost connectivity prototype, a demo
of data reaching a server, and a cost/implementation-time comparison. Its listed
technologies include OPC-UA/Modbus, Raspberry Pi/ESP32, MQTT and Node-RED.
This guide assumes D1; confirm the team's selected challenge before submission.

Demonstrate configurable data collection from a legacy PLC without a dedicated
IPC (industrial PC) beside each machine. Witte Modbus Slave represents the PLC's
register interface. The physical ESP32 performs requests, signed decoding,
scaling, alarm evaluation and MQTT transmission. The laptop hosts the simulator
and demo server; it is not evidence of a PC-free server deployment.

```text
Witte Modbus Slave (Windows, simulated PLC)
    | USB -> CH340 -> UART2 (Modbus RTU, 9600 8N1)
Physical ESP32 (Modbus master and MQTT client)
    | 2.4 GHz Wi-Fi
Mosquitto on Windows (MQTT server)
    | MQTT subscriptions
Live message viewer; optionally the team's backend, database and dashboard
```

This is a TTL bench prototype. Industrial RS-485 wiring needs a suitable
transceiver and equipment-specific acceptance. Do not describe the simulator as
a real DENSO PLC or CNC, threshold alerts as predictive AI, or the gateway as an
automatic machine shutdown system. Confirm that target equipment actually exposes
supported Modbus registers; this firmware does not support every legacy protocol.

## Before switching from Linux to Windows on the same laptop

The Linux broker stops when Linux shuts down. Install
[Modbus Slave](https://www.modbustools.com/modbus_slave.html) and
[Mosquitto for Windows](https://mosquitto.org/download/) on Windows. Modbus Slave
is commercial evaluation software; check its evaluation/license status before
the event. Clone the repository on Windows and use `feature/firmware-base`.

The tested board uses Wi-Fi `930T1` and broker `192.168.0.108:1883`. Those are
site-specific values, not universal defaults. Run `ipconfig` on Windows and find
the Wi-Fi IPv4 address. ESP32 must reach that address and obtain NTP time through
the network. Reconfigure ignored `include/local_settings.h` and rebuild/upload
only if Wi-Fi credentials, broker address or board wiring settings change. Machine
register maps and thresholds below do not require flashing. A shared local header
is not included in Git; retrieve the Wi-Fi password privately when needed.

Keep the ESP32 on a supported 2.4 GHz network. Windows can use a different Wi-Fi
band if it is on the same reachable LAN. Check for guest/client isolation if local
MQTT subscribers work but the ESP32 cannot connect.

## Wiring and Modbus Slave configuration

Power ESP32 and CH340 with their own USB connections. Use verified 3.3 V UART
logic on CH340; a 3.3/5 V VCC selector alone does not prove the TXD signal level.

| CH340 | ESP32 |
| --- | --- |
| TXD | GPIO16 / RX2 |
| RXD | GPIO17 / TX2 |
| GND | GND |

Leave VCC, 5V and 3.3V pins between the boards unconnected. See the
[bench wiring guide](../test/hardware/README.md#usb-to-ttl-bench-wiring).

Use Device Manager > Ports to identify **USB-SERIAL CH340 (COMx)**. The CP2102
port belongs to the ESP32 programming/log interface. Close every other program
using CH340, including previous Python simulators, before connecting Modbus Slave.

In Modbus Slave:

1. **Connection > Connect (F3):** serial connection, Modbus RTU, CH340 COM port,
   9600 baud, 8 data bits, no parity, one stop bit. Disable hardware flow control.
2. **Setup > Slave Definition (F8):** slave ID 1, function 03 Holding Registers,
   address 0, quantity 50. Only three registers are initially polled; 50 makes
   raw address 49 available for the remapping demonstration.
3. Use zero-based protocol addressing. Turn off **PLC Addresses (Base 1)** for
   this walkthrough. Do not enter Modicon label 40050 as the raw address.
4. Use native 16-bit display formats, signed for the temperature cells at raw
   addresses 0 and 49, unsigned for current/rpm. Disable display scaling so entered
   values match the raw table below. Double-click a cell to change its value.
5. Open **Display > Communication** to show real requests/responses from ESP32.

| Raw address | Optional Modicon label | Raw value | Meaning after ESP32 scaling |
| --- | --- | --- | --- |
| 0 | 40001 | 250 | temperature = 25 C |
| 1 | 40002 | 123 | current = 1.23 A |
| 2 | 40003 | 1500 | rpm = 1500 |
| 49 | 40050 | 420 | alternate temperature = 42 C |

The [Modbus Slave manual](https://www.modbustools.com/mbslave-user-manual.html)
documents these dialogs, native formats, address display and traffic view.

## Run an authenticated Windows demo broker

These PowerShell commands assume the standard Mosquitto installation directory
and repository root as the current directory. Keep three terminals open: broker,
subscriber and config publisher. This broker is separate from the team's Docker
stack and uses the agreed demo account, not production credentials.

For the first run, create a separate demo folder and password file:

```powershell
$mosq = 'C:\Program Files\mosquitto'
New-Item -ItemType Directory -Force C:\legacy-link-demo | Out-Null
& "$mosq\mosquitto_passwd.exe" -c C:\legacy-link-demo\passwd legacy_admin
```

At the password prompts enter the agreed demo password `legacy_secret_2026`.
Run the `-c` command only when creating this demo password file; it overwrites an
existing file. It does not configure a different Mosquitto installation/service.

Create the demo broker config and run it in terminal 1:

```powershell
@'
listener 1883 0.0.0.0
allow_anonymous false
password_file C:/legacy-link-demo/passwd
persistence false
log_dest stdout
log_type all
'@ | Set-Content -Encoding ascii C:\legacy-link-demo\mosquitto.conf
& "$mosq\mosquitto.exe" -c C:\legacy-link-demo\mosquitto.conf -v
```

If port 1883 is already in use, check the existing broker/service and select one
broker to use; do not run two listeners on the same port. Allow inbound TCP 1883
for this demo broker on the Windows private-network firewall profile. Keep the
firewall enabled. Stopping this terminal ends the demo broker; retained messages
are in memory only because persistence is disabled. ESP32 stores valid config
independently in flash.

Terminal 2 displays messages received by the server:

```powershell
$mosq = 'C:\Program Files\mosquitto'
& "$mosq\mosquitto_sub.exe" -h 127.0.0.1 -p 1883 -u legacy_admin -P legacy_secret_2026 -t 'legacy-link/devices/BENCH-01/+' -t 'legacy-link/gateways/+/config/ack' -v
```

This viewer is server-reception evidence. It is not the backend validator or
database. Keep it visible beside Modbus Slave during the presentation.

## Apply the demo configuration

In terminal 3, use the hardware gateway ID printed at ESP32 startup. For the board
tested on 2026-10-06 it was `643C60A7DBCC`; verify when using a different board.
Subscribe in terminal 2 **before** publishing so the non-retained ACK is captured.

```powershell
$mosq = 'C:\Program Files\mosquitto'
$gatewayId = '643C60A7DBCC'
& "$mosq\mosquitto_pub.exe" -h 127.0.0.1 -p 1883 -u legacy_admin -P legacy_secret_2026 -q 1 -r -t "legacy-link/gateways/$gatewayId/config" -f firmware/legacy-link-core/examples/hackathon-modbus.json
```

Look for an ACK with `requestId: "hackathon-base"`, `result: "applied"` (or
`"unchanged"` on repeat), `reason: "ok"` and `persisted: true`. Rejects or
`persisted: false` need investigation before presentation. A publish exit code
alone does not prove application. Wait for complete telemetry with temperature,
current and rpm; partial samples can occur while the simulator/config is changed.

## Five-minute presentation

Use the following steps in order. Keep each register value for at least three
complete telemetry samples before changing it. Display the MQTT timestamp and
topic as well as the values. Limits here are demonstration settings, not DENSO
machine-approved thresholds.

| Step | Change in Modbus Slave | Expected MQTT observation | Evidence for the problem |
| --- | --- | --- | --- |
| Baseline | raw 0 = 250, raw 1 = 123, raw 2 = 1500 | 25 C, 1.23 A, 1500 rpm, about one sample every 2 s | physical gateway reads PLC-style registers and delivers named values to server |
| Signed data | raw 0 = -180, then 250 | -18 C, then 25 C | correct signed decoding and scaling |
| High alarm | raw 0 = 950 | 95 C plus one `OVERHEAT`, severity `high` | configured local threshold evaluation |
| Suppression | keep 950, then use 895, then 910 | telemetry continues; no additional high alarm | fluctuations do not flood the server |
| Rearm | raw 0 = 870, wait, then 950 | a second high alarm | rearm at or below 87 C; trigger strictly above 90 C |
| Escalation | after high alarm, raw 0 = 1050 | 105 C plus one `OVERHEAT`, severity `critical` | separate severity configured above 100 C |
| Adapt another register layout | set raw 0 = 250 and raw 49 = 420; publish remapped profile below | temperature changes from 25 C to 42 C; interval becomes 1 s | runtime register mapping without reflashing |

Before the remap, let raw 0 = 250 appear in telemetry. Then publish:

```powershell
& "$mosq\mosquitto_pub.exe" -h 127.0.0.1 -p 1883 -u legacy_admin -P legacy_secret_2026 -q 1 -r -t "legacy-link/gateways/$gatewayId/config" -f firmware/legacy-link-core/examples/hackathon-modbus-remapped.json
```

Require the `hackathon-remap` ACK before interpreting the new values. The device
ID stays BENCH-01: this is a simulated change in the register layout for the same
gateway/device, not evidence of two physical machines connected simultaneously.
Changed config resets alarm suppression, so switch profiles at normal temperature.

Optional outage checks after the core demonstration:

- Disconnect **Modbus Slave** for a full scan: telemetry stops when all reads fail,
  but gateway status can stay online. Reconnect and show data recovery. Status
  means MQTT connection, not machine health or successful Modbus reads.
- Remove **ESP32 power** while the broker keeps running: wait for MQTT keepalive
  timeout and show retained `status: false`. The event is not immediate and its
  payload timestamp is connection time. Restore power; NTP and MQTT must recover.

Restore the base demo profile afterward by repeating its publish command. If you
want the original no-alarm bench profile, publish `examples/bench-device.json`
to the same gateway topic with `-r`; this also replaces the retained demo config.

## Backend and database acceptance

If the team's backend is ready, run it against this broker with matching MQTT
credentials and its database schema. With backend HTTP `/machines`, dashboard
and database available, show received rows instead of only terminal JSON. Verify
the demo identity is displayed; this fixture uses BENCH-01 rather than seed devices
esp32-01/esp32-03. Do not change device ID in only the viewer or topic.

Read-only SQL evidence, run by the backend operator:

```sql
SELECT device_id, ts, metrics FROM telemetry
WHERE device_id = 'BENCH-01' ORDER BY ts DESC LIMIT 5;
SELECT device_id, code, severity, value FROM alarms
WHERE device_id = 'BENCH-01' ORDER BY ts DESC LIMIT 5;
```

Do not label a successful MQTT subscription as a database insertion test. For the
reported run on 2026-10-06, physical TTL telemetry and backend validator acceptance
passed; database insertion and physical alarm crossings were not tested. This new
demo guide/configuration does not upgrade that evidence by itself. Record Windows,
Modbus Slave, firmware and backend versions plus actual results during rehearsal.

On 2026-10-07, both new profiles were checked with the real firmware parser and
alarm monitor on the host, with address/undefined-behavior sanitizers. Their
serialized file sizes were 791 and 798 bytes, both below 4095 bytes. Checks covered
raw temperature addresses 0/49, 2000/1000 ms intervals, and the presentation
sequence producing two high alarms and one critical alarm with repeat suppression.
No ESP32/CH340 was detected during that preparation run; Witte Modbus Slave on
Windows and the new physical alarm scenario have not been rehearsed yet.

## Cost and implementation-time evidence for D1

Present a comparison with the same scope in both columns: per-machine gateway,
power supply, interface hardware, enclosure, installation labor and shared server.
List actual receipts/quotes for ESP32 and industrial RS-485 hardware. Treat CH340
as simulator bench equipment, not the finished factory interface. Obtain a quote
for the IPC-based alternative; do not invent a saving percentage.

Measure setup time from the same starting conditions to the first server sample.
Record configuration time for the alternate map separately from firmware/network
provisioning. Show how many successful readings arrive, sample interval and outage
recovery time. Production work still includes electrical suitability, isolation,
enclosure, network approval, real register maps and reliability validation.

## Troubleshooting

| Symptom | First checks |
| --- | --- |
| No traffic in Modbus Slave | correct CH340 COM, exclusive port access, crossed TX/RX, GND, 9600 8N1, ESP32 configured |
| Requests but exceptions | slave ID 1, function 03, quantity 50, raw address 0 or 49 |
| Temperature is ten times too small | enter raw 250 for 25 C; disable simulator display scaling |
| Modbus works but no MQTT | Windows IP matches firmware broker host, listener/firewall, account, Wi-Fi reachability, NTP |
| Alarm missing | ACK confirms alarm-enabled profile, telemetry above 90 C, time synchronized, alarm may already be suppressed |
| Old map returns after reconnect | replace the retained gateway config with the desired profile |
| Gateway remains online when PLC is disconnected | expected; inspect telemetry freshness separately |

References: [Modbus Slave manual](https://www.modbustools.com/mbslave-user-manual.html),
[Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html),
[password tool](https://mosquitto.org/man/mosquitto_passwd-1.html),
[subscriber](https://mosquitto.org/man/mosquitto_sub-1.html),
and [firmware operation](firmware-operation.md).
