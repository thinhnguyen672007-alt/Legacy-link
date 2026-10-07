#!/usr/bin/env python3
"""D1 rehearsal: virtual Modbus RTU -> host firmware -> MQTT -> local server.

No ESP32 is flashed or connected. All listeners bind to loopback.
"""
import argparse
import asyncio
from collections import deque
import copy
import json
import logging
import os
from pathlib import Path
import select
import signal
import struct
import subprocess
import threading
import time
import tty
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import paho.mqtt.client as mqtt
from amqtt.broker import Broker
from pwdlib import PasswordHash

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parent.parent
RUNTIME = PROJECT / ".pio/d1-demo"
GATEWAY = "123456789ABC"  # Host test identity, distinct from the physical ESP32.
CONFIG_TOPIC = f"legacy-link/gateways/{GATEWAY}/config"
USER, PASSWORD = "legacy_admin", "legacy_secret_2026"


def crc(data):
    value = 0xffff
    for byte in data:
        value ^= byte
        for _ in range(8):
            value = (value >> 1) ^ 0xa001 if value & 1 else value >> 1
    return struct.pack("<H", value)


def build():
    include = PROJECT / ".pio/libdeps/esp32dev/ArduinoJson/src"
    if not (include / "ArduinoJson.h").exists():
        raise RuntimeError("Install firmware dependencies first: pio pkg install -d firmware/legacy-link-core")
    binary = RUNTIME / "gateway"
    subprocess.run([
        "c++", "-std=c++17", "-Wall", "-Wextra", "-Werror", "-pthread",
        "-DLEGACYLINK_HOST_BUILD",
        "-I", str(HERE / "host"), "-I", str(PROJECT / "test/host/stubs"),
        "-I", str(PROJECT / "include"), "-I", str(include),
        str(HERE / "host/gateway.cpp"),
        *[str(PROJECT / f"src/{name}.cpp") for name in
          ("modbus_reader", "alarm_monitor", "config_parser", "config_store")],
        "-o", str(binary),
    ], check=True)
    return binary


class Demo:
    def __init__(self, broker_port):
        self.port = broker_port
        self.lock = threading.RLock()
        self.pipe_lock = threading.Lock()
        self.stop = threading.Event()
        self.events = deque(maxlen=60)
        self.frames = deque(maxlen=20)
        self.metrics = {}
        self.counts = {"requests": 0, "crcErrors": 0, "exceptions": 0,
                       "telemetry": 0, "alarms": 0, "rejected": 0}
        self.temperature = 25.0
        self.address = 0
        self.slave_online = True
        self.received_at = None
        self.status = None
        self.ack = None
        self.config = json.loads((HERE / "device.json").read_text())
        self.master_fd, self.slave_fd = os.openpty()
        tty.setraw(self.slave_fd)
        self.uart = os.ttyname(self.slave_fd)
        self.validator = subprocess.Popen(["node", str(HERE / "validate.mjs")],
                                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                          text=True, bufsize=1)
        self.gateway = None
        self.clients = []
        self.threads = []

    def worker(self, function):
        def guarded():
            try:
                function()
            except Exception as error:
                if not self.stop.is_set():
                    self.record("error", {"message": str(error)})
                    logging.exception("Demo worker failed")
                    self.stop.set()
        thread = threading.Thread(target=guarded, daemon=True)
        self.threads.append(thread)
        thread.start()

    def record(self, kind, payload, **extra):
        event = {"kind": kind, "payload": payload, "receivedAt": int(time.time()*1000), **extra}
        with self.lock:
            self.events.appendleft(event)
            with (RUNTIME / "events.jsonl").open("a") as log:
                log.write(json.dumps(event) + "\n")

    def slave(self):
        buffer = bytearray()
        while not self.stop.is_set():
            if not select.select([self.master_fd], [], [], .1)[0]:
                continue
            buffer.extend(os.read(self.master_fd, 256))
            while len(buffer) >= 8:
                request = bytes(buffer[:8])
                if crc(request[:6]) != request[6:]:
                    del buffer[0]
                    with self.lock:
                        self.counts["crcErrors"] += 1
                    continue
                del buffer[:8]
                slave, function, address, count = struct.unpack(">BBHH", request[:6])
                with self.lock:
                    self.counts["requests"] += 1
                    values = {self.address: round(self.temperature*10), 1: 123, 2: 1500}
                    online = self.slave_online
                if not online or slave != 1:
                    response = b""
                elif function not in (3, 4) or not 1 <= count <= 2 or any(address+i not in values for i in range(count)):
                    response = bytes([slave, function | 0x80, 2])
                    with self.lock:
                        self.counts["exceptions"] += 1
                else:
                    response = bytes([slave, function, count*2]) + b"".join(
                        struct.pack(">H", values[address+i] & 0xffff) for i in range(count))
                if response:
                    response += crc(response)
                    os.write(self.master_fd, response)
                with self.lock:
                    self.frames.appendleft({"request": request.hex(" "),
                                            "response": response.hex(" ") or "No response",
                                            "address": address})

    def connect(self, name, callback, topics):
        ready = threading.Event()
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=name)
        client.username_pw_set(USER, PASSWORD)
        def connected(c, _u, _f, reason, _p):
            if not reason.is_failure:
                c.subscribe([(topic, 1) for topic in topics])
        client.on_connect = connected
        client.on_subscribe = lambda *_: ready.set()
        client.on_message = callback
        client.connect("127.0.0.1", self.port, 30)
        client.loop_start()
        self.clients.append(client)
        if not ready.wait(8):
            raise RuntimeError("MQTT subscription failed")
        return client

    def received(self, _client, _userdata, message):
        payload = json.loads(message.payload)
        kind = message.topic.rsplit("/", 1)[-1]
        if kind == "ack":
            with self.lock:
                self.ack = payload
            self.record(kind, payload, topic=message.topic)
            return
        self.validator.stdin.write(json.dumps({"topic": message.topic, "payload": payload}) + "\n")
        self.validator.stdin.flush()
        result = json.loads(self.validator.stdout.readline())
        if not result["ok"]:
            with self.lock:
                self.counts["rejected"] += 1
            self.record("rejected", result, topic=message.topic)
            return
        with self.lock:
            if kind == "telemetry":
                self.metrics = payload["metrics"]
                self.received_at = int(time.time()*1000)
                self.counts["telemetry"] += 1
            elif kind == "alarm":
                self.counts["alarms"] += 1
            elif kind == "status":
                self.status = payload["status"]
        self.record(kind, payload, topic=message.topic)

    def configured(self, _client, _userdata, message):
        line = json.dumps({"topic": message.topic, "payload": message.payload.decode()})
        with self.pipe_lock:
            self.gateway.stdin.write(line + "\n")
            self.gateway.stdin.flush()

    def forward(self):
        for line in self.gateway.stdout:
            message = json.loads(line)
            self.publisher.publish(message["topic"], message["payload"],
                                   qos=0, retain=message["retained"]).wait_for_publish(5)
        if not self.stop.is_set():
            raise RuntimeError("Host gateway stopped unexpectedly")

    def start(self, binary):
        self.connect("d1-demo-server", self.received, ["legacy-link/devices/D1-DEMO-01/+",
                                                       f"{CONFIG_TOPIC}/ack"])
        environment = dict(os.environ, LEGACYLINK_DEMO_UART=self.uart)
        self.gateway = subprocess.Popen([str(binary), str(HERE / "device.json")], env=environment,
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.publisher = self.connect("d1-demo-gateway-bridge", self.configured, [CONFIG_TOPIC])
        self.controller = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="d1-demo-controller")
        self.controller.username_pw_set(USER, PASSWORD)
        self.controller.connect("127.0.0.1", self.port, 30)
        self.controller.loop_start()
        self.clients.append(self.controller)
        self.worker(self.slave)
        self.worker(self.forward)

    def command(self, command):
        action = command.get("action")
        if action == "temperature":
            value = command.get("value")
            if isinstance(value, bool) or not isinstance(value, (float, int)) or not -100 <= value <= 200:
                raise ValueError("Temperature must be between -100 and 200 C")
            with self.lock:
                self.temperature = value
        elif action == "slave":
            if not isinstance(command.get("online"), bool):
                raise ValueError("online must be a boolean")
            with self.lock:
                self.slave_online = command["online"]
        elif action == "config":
            address = command.get("address", 0)
            interval = command.get("interval", 1000)
            if address not in (0, 49) or interval not in (1000, 2000):
                raise ValueError("Use address 0/49 and interval 1000/2000")
            with self.lock:
                self.config = copy.deepcopy(self.config)
                self.config["registerMap"][0]["address"] = address
                self.config["samplingIntervalMs"] = interval
                self.config["requestId"] = f"demo-{time.time_ns()}"
                payload = json.dumps(self.config, separators=(",", ":"))
                self.address = address  # Simulate choosing a PLC with a different map.
            self.controller.publish(CONFIG_TOPIC, payload, qos=1).wait_for_publish(5)
        else:
            raise ValueError("Unknown command")

    def state(self):
        with self.lock:
            return {"metrics": self.metrics, "counts": self.counts.copy(), "status": self.status,
                    "receivedAt": self.received_at, "temperature": self.temperature,
                    "slaveOnline": self.slave_online, "address": self.address,
                    "interval": self.config["samplingIntervalMs"], "ack": self.ack,
                    "events": list(self.events), "frames": list(self.frames),
                    "gatewayAlive": self.gateway is not None and self.gateway.poll() is None}

    def close(self):
        self.stop.set()
        if self.gateway:
            self.gateway.terminate()
            self.gateway.wait(timeout=5)
        for client in self.clients:
            client.disconnect()
            client.loop_stop()
        self.validator.terminate()
        self.validator.wait(timeout=5)
        for thread in self.threads:
            thread.join(timeout=3)
        os.close(self.master_fd)
        os.close(self.slave_fd)


def handler(demo):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, code, payload, content_type="application/json"):
            data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path == "/":
                self.send(200, (HERE / "index.html").read_bytes(), "text/html; charset=utf-8")
            elif self.path == "/state":
                self.send(200, demo.state())
            else:
                self.send(404, {"error": "Not found"})

        def do_POST(self):
            # Browser actions are local, same-origin and limited to this demo.
            if self.path != "/command":
                self.send(404, {"error": "Not found"})
                return
            if self.headers.get("Origin") not in (None, f"http://{self.headers.get('Host')}"):
                self.send(403, {"error": "Use the local demo page"})
                return
            try:
                length = int(self.headers.get("Content-Length", "0"))
                if not 0 < length <= 1024:
                    raise ValueError("Invalid command size")
                demo.command(json.loads(self.rfile.read(length)))
                self.send(200, {"ok": True})
            except (ValueError, TypeError, AttributeError) as error:
                self.send(400, {"error": str(error)})
    return Handler


async def main(args):
    RUNTIME.mkdir(parents=True, exist_ok=True)
    binary = build()
    password_file = RUNTIME / "passwd"
    password_file.write_text(f"{USER}:{PasswordHash.recommended().hash(PASSWORD)}\n")
    password_file.chmod(0o600)
    broker = Broker({"listeners": {"default": {"type": "tcp", "bind": f"127.0.0.1:{args.mqtt_port}"}},
                     "plugins": {"amqtt.plugins.authentication.FileAuthPlugin":
                                 {"password_file": str(password_file)}}})
    await broker.start()
    demo = Demo(args.mqtt_port)
    server = None
    try:
        await asyncio.to_thread(demo.start, binary)
        server = ThreadingHTTPServer(("127.0.0.1", args.http_port), handler(demo))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        print(f"D1 SOFTWARE REHEARSAL: http://127.0.0.1:{args.http_port}", flush=True)
        print(f"Modbus RTU on {demo.uart}; MQTT on 127.0.0.1:{args.mqtt_port} (authenticated).", flush=True)
        print("No ESP32, Wi-Fi, physical RS-485 or PostgreSQL is used. Ctrl+C to stop.", flush=True)
        signal.signal(signal.SIGTERM, lambda *_: demo.stop.set())
        signal.signal(signal.SIGINT, lambda *_: demo.stop.set())
        while not demo.stop.is_set():
            await asyncio.sleep(.2)
    finally:
        if server:
            await asyncio.to_thread(server.shutdown)
            server.server_close()
        await asyncio.to_thread(demo.close)
        await broker.shutdown()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--http-port", type=int, default=8765)
    parser.add_argument("--mqtt-port", type=int, default=18883)
    args = parser.parse_args()
    if any(not 1 <= value <= 65535 for value in (args.http_port, args.mqtt_port)):
        parser.error("Ports must be between 1 and 65535")
    logging.basicConfig(level=logging.ERROR)
    asyncio.run(main(args))
