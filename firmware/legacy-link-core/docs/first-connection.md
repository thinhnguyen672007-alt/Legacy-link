# First connection to a backend on another computer

The data path is ESP32 -> MQTT broker -> backend -> PostgreSQL (telemetry).
The broker and backend may run on different computers. The ESP32 needs the
broker address, not the database address or a backend HTTP URL.

## Before connecting hardware

Ask the teammate running the services for:

- The broker's LAN IP address or hostname and TCP port (commonly 1883).
- MQTT credentials and permission for device telemetry/status/alarm publishing
  and gateway configuration subscriptions.
- Confirmation that the broker listens on an interface reachable from the ESP32,
  and that the LAN firewall allows the selected MQTT port.
- Confirmation that their backend subscribes to this same broker and has its
  PostgreSQL database and tables ready. Current `main` requires `DATABASE_URL`.

Use the same reachable LAN for the first test. `localhost` in ESP32 settings
would refer to the ESP32 itself. In the backend configuration, `localhost` is
correct only when its broker runs on that backend computer.

Before wiring, identify the ESP32 board, the Modbus device or simulator, and the
electrical interface/adapter in use. UART pins alone are not an RS-485 interface.
The current firmware uses UART2 TX GPIO17 and RX GPIO16; adapter wiring and any
direction-control requirements must be checked against the actual hardware.

## Configure and upload the gateway

Set `ssid`, `password`, `mqtt_server`, `mqtt_port`, `mqtt_user`, and `mqtt_pass`
in `src/main.cpp` locally. Do not commit real credentials. Build and upload using
the actual port shown by PlatformIO:

```bash
pio device list
pio run -d firmware/legacy-link-core
pio run -d firmware/legacy-link-core -t upload --upload-port <ESP32_PORT>
pio device monitor -d firmware/legacy-link-core -b 115200 --port <ESP32_PORT>
```

The Serial log prints the gateway ID, its configuration topic, Wi-Fi connection
and MQTT subscription. Internet access to the configured NTP servers is needed
to establish a valid clock after boot; unsynchronized time suppresses publishing.

## Start with a known Modbus register map

`examples/bench-device.json` is a simulator fixture, not a real machine profile.
It uses slave ID 1, 9600 baud, no parity, one stop bit and holding registers
(function code 3) at zero-based addresses 0, 1 and 2:

| Address | Raw simulator value | Firmware metric | Expected scaled value |
| --- | --- | --- | --- |
| 0 | 250 | `temperature` (`INT16`, scale 0.1) | 25 C |
| 1 | 123 | `current` (`UINT16`, scale 0.01) | 1.23 A |
| 2 | 1500 | `rpm` (`UINT16`, scale 1) | 1500 RPM |

Some simulator interfaces label address 0 as 40001. Check their addressing
convention. For real equipment, replace the addresses, communication settings,
types and scales using its manual. The fixture omits alarms because equipment
limits have not been provided. It polls every two seconds.

From the repository root, print a single line and paste that line into Serial
Monitor, followed by Enter:

```bash
node -e 'console.log(JSON.stringify(require("./firmware/legacy-link-core/examples/bench-device.json")))'
```

Alternatively, publish from a computer with Mosquitto client tools. Set the
environment variables to the broker details and the gateway ID printed by the
ESP32. This retained message will be reapplied after reconnect:

```bash
mosquitto_pub -h "$MQTT_HOST" -p "$MQTT_PORT" \
  -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
  -t "legacy-link/gateways/$GATEWAY_ID/config" -q 1 -r \
  -f firmware/legacy-link-core/examples/bench-device.json
```

## Verify each step separately

1. Serial should report `Configuration applied successfully`, then successful
   Modbus readings with the expected scaled values. `Modbus Error` means the
   device link must be fixed before telemetry can be sent.
2. Subscribe to the bench device from a computer that can reach the broker:

   ```bash
   mosquitto_sub -h "$MQTT_HOST" -p "$MQTT_PORT" \
     -u "$MQTT_USERNAME" -P "$MQTT_PASSWORD" \
     -t 'legacy-link/devices/BENCH-01/#' -v
   ```

   Check telemetry metrics against the table. Online status is retained and sent
   periodically; receiving status alone does not prove Modbus reads succeed.
3. Ask the backend operator to check logs for `BENCH-01`. A validation rejection
   identifies a topic/payload mismatch. A database error means reception reached
   the handler but storage failed; inspect the PostgreSQL setup with that owner.
4. Have the backend operator confirm that fresh `BENCH-01` rows appear in the
   `telemetry` table. A broker message or ESP32 `Published` log by itself does not
   confirm database storage.

Record firmware commit, backend commit, gateway ID, device ID, the received
payload and storage result. Keep credentials out of shared logs/screenshots.

## Check message compatibility without hardware

This command compiles the real firmware configuration, Modbus and publishing
code with simulated hardware interfaces, captures its JSON, and passes the
messages to the actual backend validators from a selected Git revision:

```bash
git fetch origin
python3 firmware/legacy-link-core/test/host/run_contract.py --backend-ref origin/main
```

Requires Python 3, Node.js, a C++ compiler and the ArduinoJson dependency installed
by the PlatformIO build. If LeakSanitizer cannot run under a ptrace sandbox, prefix
the Python command with `ASAN_OPTIONS=detect_leaks=0`.

The command reports the exact backend commit tested. It checks telemetry, both
status values, all 16 alarm code/severity combinations, and rejection of mismatched
device IDs and schema versions. It reads backend files into a temporary directory
without switching branches or modifying them. No npm dependencies are needed.

The host Modbus stub returns raw 0xFFFF, so this automated test deliberately checks
signed and unsigned decoding rather than the physical simulator values above.
It does not contact a broker, run the backend process, access PostgreSQL or prove
delivery from an ESP32. Both online and offline status serializers are tested;
automatic offline status/Last Will is not yet implemented in the running firmware.
