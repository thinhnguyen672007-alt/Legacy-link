#!/usr/bin/env python3
"""Exercise a flashed ESP32 over USB. Replaces its saved config with --config.

Requires pyserial (included in PlatformIO's Python environment). Close other
serial readers first. This checks Serial/NVS behavior, not MQTT or RS-485 values.
"""

import argparse
import json
from pathlib import Path
import time

import serial


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", required=True)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--log", type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    payload = json.dumps(config, separators=(",", ":"), ensure_ascii=False).encode()
    if not isinstance(config, dict) or not config.get("deviceId") or len(payload) > 4095:
        parser.error("Use a valid device config of at most 4095 UTF-8 bytes")
    args.log.parent.mkdir(parents=True, exist_ok=True)
    checks = []
    with args.log.open("wb") as log, serial.Serial(args.port, 115200, timeout=0.1,
                                                  write_timeout=5) as board:
        board.dtr = False
        board.rts = False

        def wait_for(expected, timeout=12):
            received = bytearray()
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                chunk = board.read(4096)
                if chunk:
                    log.write(chunk)
                    log.flush()
                    received.extend(chunk)
                    text = received.decode("utf-8", "replace")
                    if "Guru Meditation" in text or "Stack canary watchpoint" in text:
                        raise RuntimeError("ESP32 crashed; see serial log")
                    if all(item in text for item in expected):
                        return text
            raise RuntimeError(f"Timed out waiting for {expected!r}; see {args.log}")

        def send(data):
            # Drain old output so a prior ACK cannot satisfy the next assertion.
            old = board.read(board.in_waiting)
            log.write(old)
            board.write(data + b"\n")
            board.flush()

        def reset():
            board.dtr = False
            board.rts = True
            time.sleep(0.1)
            board.rts = False

        def passed(name):
            checks.append(name)
            print(f"PASS: {name}", flush=True)

        reset()
        wait_for(["Paste JSON config and press Enter"])
        passed("normal boot")
        send(payload)
        wait_for(["ok; persisted=true"])
        passed("valid configuration saved")

        invalid = dict(config, slaveId=257)
        send(json.dumps(invalid, separators=(",", ":")).encode())
        wait_for(["[CONFIG] rejected: invalid_config"])
        send(payload)
        wait_for(["[CONFIG] unchanged: ok; persisted=true"])
        passed("invalid config preserves active settings")

        send(payload + b" " * (4095 - len(payload)))
        wait_for(["[CONFIG] unchanged: ok; persisted=true"])
        passed("4095-byte Serial payload accepted")
        send(payload + b" " * (4096 - len(payload)))
        wait_for(["[ERROR] Input too long (max 4095 bytes)"])
        send(payload)
        wait_for(["[CONFIG] unchanged: ok; persisted=true"])
        passed("4096-byte rejection and next-line recovery")

        send(b'{"deviceId":"bad\x00id"}')
        wait_for(["[CONFIG] Rejected: NUL-containing Serial input"])
        send(payload)
        wait_for(["[CONFIG] unchanged: ok; persisted=true"])
        passed("NUL rejection and next-line recovery")

        reset()
        wait_for(["[CONFIG] Restored validated configuration from flash",
                  config["deviceId"], "Paste JSON config and press Enter"])
        send(payload)
        wait_for(["[CONFIG] unchanged: ok; persisted=true"])
        passed("reset restores configuration from flash")
    print(f"PASS: {len(checks)} USB smoke checks; log: {args.log}")
    print(f"Board retains the supplied {config['deviceId']} configuration.")
    print("Not tested: Wi-Fi, MQTT, NTP delivery, physical Modbus values or database storage.")


if __name__ == "__main__":
    main()
