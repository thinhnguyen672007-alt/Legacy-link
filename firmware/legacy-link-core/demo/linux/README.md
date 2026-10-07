# D1 Modbus demo on Linux without an ESP32

This is a software rehearsal for **D1 — Low-Cost Connectivity for Non-IPC
Legacy Equipment**. The [DENSO challenge page](https://densohackathon.vn/home)
describes collecting legacy PLC data to a server using a low-cost gateway, with
a prototype, server data demo, and cost/deployment-time comparison as deliverables.
The challenge text is embedded in the site's JavaScript; do not infer that every
legacy PLC supports Modbus or that a rehearsal proves factory compatibility.

## What runs

```text
Virtual PLC (RTU slave 1)
    -> Linux pseudo-terminal pair, real Modbus RTU frames and CRC
    -> firmware C++ parser / decoding / scaling / alarm logic on the host
    -> Python MQTT bridge -> authenticated local broker
    -> separate MQTT subscriber -> actual backend validators
    -> local receiver page and .pio/d1-demo/events.jsonl
```

Production firmware sources are compiled for the host using demo/test adapters.
ESP32 hardware, Wi-Fi, NTP setup, PubSubClient sockets and Preferences are
simulated. Host system time supplies epoch milliseconds. MQTT traffic between
Python clients and the aMQTT broker is real. Backend validators run in Node;
the team's backend consumer, PostgreSQL and production dashboard do not run.
The receiver is a demonstration server, not a replacement frontend.

The host gateway identity is `123456789ABC`; device ID is `D1-DEMO-01`, keeping
rehearsal topics separate from the physical board. The embedded broker binds
only to `127.0.0.1:18883`, with the shared demo account and no anonymous plugin.
Do not use it for a physical power-loss/LWT acceptance claim: use Mosquitto
and the physical procedure in the hardware report for that check.

## Start

Requirements: Linux, Python 3.10–3.14, C++17 compiler, Node.js, and the firmware's
ArduinoJson dependency. From the repository root:

```bash
# Only needed if firmware dependencies are not installed yet:
pio pkg install -d firmware/legacy-link-core

python3 -m venv firmware/legacy-link-core/.pio/demo-venv
firmware/legacy-link-core/.pio/demo-venv/bin/python -m pip install \
  -r firmware/legacy-link-core/demo/linux/requirements.txt
firmware/legacy-link-core/.pio/demo-venv/bin/python \
  firmware/legacy-link-core/demo/linux/run.py
```

Open **http://127.0.0.1:8765**. Keep the terminal open; Ctrl+C stops the demo.
Choose other ports with `--http-port` / `--mqtt-port` if occupied. All generated
binaries, credentials and receipt logs stay in ignored `.pio/` files. No board
is erased/flashed, and site Wi-Fi settings are never displayed by this runner.
Host builds define `LEGACYLINK_HOST_BUILD` to omit the private site header; they
cannot embed its Wi-Fi credentials or inherit its physical RS-485 pin override.
On this development machine, PlatformIO is also available at
`/home/nezine/.platformio/penv/bin/pio`.

## Four-minute presentation

1. **Problem:** legacy equipment's useful measurements remain local. Show the
   three raw registers and named values received at the server: 250 -> 25°C,
   123 -> 1.23 A, 1500 -> 1500 rpm. The gateway applies scale once.
2. **Signed decoding:** select −18°C. The raw INT16 word becomes `0xff4c`
   (−180), and the server receives approximately −18°C.
3. **Operational alert:** select 95°C. Expect one `OVERHEAT/high` event. Hold
   that value across several samples and observe that the alarm count stays
   constant. Select 105°C for one critical escalation. Cool to 86°C, wait for
   a received sample, then return to 95°C to produce a new high alarm.
4. **Adapt to another PLC:** select address 49 and a two-second interval, then
   send configuration through MQTT. Wait for the correlated `applied` ACK and
   new readings. Show request bytes changing from address 0 to 49. The simulator
   moves its temperature register at the same time; this does not change a real
   PLC's register map. A transitional read may fail during the change.
5. **Source failure:** disconnect the virtual Modbus source. Let a full scan
   complete (up to six seconds for three timeouts). The last reading is marked
   stale; gateway status can stay online. Reconnect and observe recovery. This
   is source loss, not a physical ESP32 power-loss test.

The upper thresholds are illustrative: **above** 90°C is high, above 100°C
critical. The high alarm rearms at or below 87°C. Use machine-approved limits
in a deployment. Configuration updates reset alarm suppression for the changed
map; perform the flooding demonstration before changing config.

Say: “The PLC and board are simulated in this rehearsal. The actual C++ firmware
decodes Modbus data and sends its payloads through MQTT to this local receiver.
Our [separate physical acceptance report](../../docs/hardware-validation-2026-10-06.md)
records the successful CH340 → ESP32 → MQTT test.”

## D1 evidence still needed

| Deliverable | Evidence available | Remaining evidence |
| --- | --- | --- |
| Low-cost prototype | Firmware, register config, prior physical UART/MQTT test | Suitable RS-485 interface and real PLC register/manual compatibility |
| Data on a server | This local MQTT receiver, validation and receipt log | Team backend/database/dashboard end-to-end run; physical demo at venue |
| Cost/time comparison | Fill-in table below | Actual supplier prices and measured installation/configuration time |

Do not invent percentage savings. Record dated quotes and measured steps for
the same machine, signal count and deployment scope. An ESP32 gateway supplements
compatible data collection; it is not a full industrial PC replacement.

| Item | ESP32 gateway | Existing/alternative solution |
| --- | --- | --- |
| Board / gateway hardware | Actual price: TBD | Quoted price: TBD |
| Industrial interface, power, enclosure | Actual price: TBD | Quoted price: TBD |
| Engineering, installation and maintenance | Measured/estimated with assumptions: TBD | Same scope: TBD |
| Initial deployment time | Measure: wiring, config, verification | Measure same steps |
| Second machine onboarding | Measure config/verification time | Measure equivalent work |

This demo performs read-only Modbus operations. It does not stop a machine,
implement predictive maintenance, buffer offline history or prove industrial
electrical isolation, Wi-Fi reliability, cost savings or ESP32 flash persistence.

## Automated rehearsal check

With the demo running, in another terminal:

```bash
python3 firmware/legacy-link-core/demo/linux/check.py
```

The check changes only this demo's virtual registers/configuration and restores
the normal address-0, one-second, 25°C setup when it finishes.
