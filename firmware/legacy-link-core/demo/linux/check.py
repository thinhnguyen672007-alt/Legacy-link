#!/usr/bin/env python3
"""Check the running D1 rehearsal through its local HTTP controls and receipts."""
import argparse
import json
import math
import time
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8765")
    args = parser.parse_args()
    def state():
        with urlopen(args.url + "/state", timeout=3) as response:
            return json.load(response)
    def command(**body):
        request = Request(args.url + "/command", json.dumps(body).encode(),
                          {"Content-Type": "application/json"}, method="POST")
        with urlopen(request, timeout=8) as response:
            assert json.load(response)["ok"]
    def until(predicate, name, timeout=15):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            current = state()
            if predicate(current):
                print("PASS: " + name, flush=True)
                return current
            time.sleep(.2)
        raise AssertionError(name + ": timed out")
    def temperature(value):
        before = state()["receivedAt"]
        command(action="temperature", value=value)
        return until(lambda s: s["receivedAt"] != before and
                     math.isclose(s["metrics"].get("temperature", 999), value, abs_tol=.0001),
                     f"RTU -> firmware -> MQTT -> validated receiver: {value} C")
    try:
        command(action="slave", online=True)
        previous = state()["ack"]
        command(action="config", address=0, interval=1000)
        until(lambda s: s["ack"] and s["ack"] != previous and
              s["ack"]["result"] in ("applied", "unchanged"), "baseline configuration")
        temperature(25)
        temperature(-18)
        baseline = temperature(86)["counts"]["alarms"]
        temperature(95)
        until(lambda s: s["counts"]["alarms"] == baseline + 1 and
              any(e["kind"] == "alarm" and e["payload"]["severity"] == "high" for e in s["events"]),
              "high alarm")
        time.sleep(3)
        assert state()["counts"]["alarms"] == baseline + 1, "Repeated high alarms"
        print("PASS: sustained high value does not flood alarms", flush=True)
        temperature(105)
        until(lambda s: s["counts"]["alarms"] == baseline + 2 and
              any(e["kind"] == "alarm" and e["payload"]["severity"] == "critical" for e in s["events"]),
              "critical escalation")
        temperature(86)
        temperature(95)
        until(lambda s: s["counts"]["alarms"] == baseline + 3, "hysteresis rearm")
        temperature(25)
        old_ack = state()["ack"].get("requestId")
        command(action="config", address=49, interval=2000)
        until(lambda s: s["ack"] and s["ack"].get("requestId") != old_ack and
              s["ack"]["result"] == "applied", "correlated runtime config ACK")
        until(lambda s: any(f["address"] == 49 and f["response"] != "No response" for f in s["frames"]),
              "real RTU requests use new raw address 49")
        temperature(-18)
        command(action="slave", online=False)
        time.sleep(8)
        stale = state()
        time.sleep(3)
        assert state()["receivedAt"] == stale["receivedAt"], "Telemetry continued with slave disconnected"
        print("PASS: disconnected source produces no new telemetry", flush=True)
        command(action="slave", online=True)
        temperature(25)
        current = state()
        assert current["counts"]["crcErrors"] == 0
        assert current["counts"]["rejected"] == 0
        assert math.isclose(current["metrics"]["current"], 1.23, abs_tol=.0001)
        assert current["metrics"]["rpm"] == 1500
        print("PASS: recovery, scaling, CRC and backend validation", flush=True)
    finally:
        command(action="slave", online=True)
        command(action="temperature", value=25)
        command(action="config", address=0, interval=1000)


if __name__ == "__main__":
    main()
