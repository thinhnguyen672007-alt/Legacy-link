# ESP32 USB smoke test

This test operates a real board that already runs Legacy-link. It resets the
board and replaces its active/saved configuration with the supplied fixture.
Back up the board before replacing another project's firmware, and close other
Serial Monitors before running this test.

From the repository root, using Python with `pyserial` installed (PlatformIO's
Python environment includes it):

```bash
python firmware/legacy-link-core/test/hardware/serial_smoke.py \
  --port /dev/ttyUSB0 \
  --config firmware/legacy-link-core/examples/bench-device.json \
  --log firmware/legacy-link-core/.pio/usb-smoke.log
```

It checks normal boot, a persisted valid config, rejection without replacing
active settings, the 4095/4096-byte boundary, NUL rejection, next-line recovery,
and restoration after a hardware reset. The supplied config remains on the board.
UART2 may report `0xE2` (response timeout) when no Modbus source is connected.
This test does not verify decoded physical measurements, Wi-Fi, MQTT or storage
in the backend. See the [operation checklist](../../docs/firmware-operation.md).

## USB-to-TTL bench wiring

For a short bench connection to a computer-based Modbus RTU simulator, use a
USB-to-TTL adapter with **3.3 V UART logic**. On a CH340 module, verify that its
3.3V/5V selector controls the TX signal level; some modules only switch the VCC
output. A 3.3V power pin label alone does not establish the TX logic level.

Disconnect USB power before wiring, then connect:

| USB-to-TTL adapter | ESP32 |
| --- | --- |
| GND | GND |
| TXD | GPIO16 (UART2 RX) |
| RXD | GPIO17 (UART2 TX) |
| VCC / 3.3V / 5V | Leave unconnected |

Power the ESP32 through its own USB connection and plug the adapter into a
second computer USB port. Identify each port separately: the ESP32's USB port
is for flashing/logs; the CH340 port belongs to the Modbus simulator. Do not use
ESP32 TX0/RX0, which are shared with the programming/Serial interface.

Use slave 1, 9600 baud, no parity and one stop bit with `bench-device.json`.
Configure the simulator as a **Modbus RTU slave/server**, with holding registers
0, 1 and 2 containing 250, 123 and 1500. Expected telemetry is temperature 25 C,
current 1.23 A and rpm 1500. Raw -180 (16-bit encoding 65356) at register 0 should
produce temperature -18 C. Sending arbitrary text in a terminal is not a Modbus
response. Leave `LEGACYLINK_RS485_DE_RE_PIN=-1` for this direct TTL connection.

This tests UART/Modbus on the bench. Connecting to an industrial RS-485 bus
requires a compatible RS-485 transceiver and its wiring/termination; a CH340
TTL adapter cannot connect directly to A/B bus terminals.
