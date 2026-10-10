// Chỉ phục vụ kiểm thử UI; chạy riêng và nhập rõ URL này. Không tự bật khi API thật lỗi.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { validateConfig } from "../../backend/src/control/validation.js";
const gatewayId = "ABCDEF123456",
  bootId = "fixture-boot";
let config = {
  deviceId: "UI-DEMO-01",
  deviceName: "MÔ PHỎNG · Trạm kiểm thử",
  protocol: "MODBUS_RTU",
  baudRate: 9600,
  parity: "NONE",
  stopBits: 1,
  slaveId: 1,
  samplingIntervalMs: 2000,
  registerMap: [
    {
      key: "temperature",
      address: 1,
      functionCode: 3,
      dataType: "INT16",
      scale: 0.1,
      unit: "C",
      wordOrder: "HIGH_FIRST",
    },
    {
      key: "current",
      address: 2,
      functionCode: 3,
      dataType: "UINT16",
      scale: 0.01,
      unit: "A",
      wordOrder: "HIGH_FIRST",
    },
  ],
};
const operations = new Map();
let acknowledgedAt = null;
http
  .createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:5173");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const send = (data, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    const url = new URL(req.url, "http://fixture");
    const path = url.pathname;
    const token = req.headers.authorization;
    if (path === "/auth/login" && req.method === "POST") {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return send({error:"Body too large"},413); }
      let credentials; try { credentials=JSON.parse(raw); } catch { return send({error:"Invalid JSON"},400); }
      if (!["viewer","technician"].includes(credentials.username) || credentials.password !== "fixture-password") return send({error:"Invalid fixture credentials"},401);
      return send({token:credentials.username === "viewer" ? "fixture-read" : "fixture-write",user:{id:"fixture-user",username:credentials.username,role:credentials.username,disabled:false,mustChangePassword:false}});
    }
    if (path === "/auth/logout" && req.method === "POST") return send({ok:true});
    const writer = token === "Bearer fixture-write";
    if (token !== "Bearer fixture-read" && !writer)
      return send({ error: "Fixture token invalid" }, 401);
    if (req.method === "POST" && !writer)
      return send({ error: "Write permission required" }, 403);
    if (path === "/auth/me") return send({id:"fixture-user",username:writer?"technician":"viewer",role:writer?"technician":"viewer",disabled:false,mustChangePassword:false});
    let body = {};
    try {
      let raw = "";
      for await (const chunk of req) raw += chunk;
      if (raw) body = JSON.parse(raw);
      const now = Date.now();
      const machine = {
        deviceId: config.deviceId,
        name: config.deviceName,
        machineType: "SIMULATOR",
        gatewayId,
        gatewayOnline: true,
        dataFresh: true,
        readHealth: "healthy",
        deliveryHealth: "backlog",
        metrics: { temperature: 25, current: 1.44 },
        lastMeasurementAt: new Date(now - 1000).toISOString(),
        lastTelemetryAt: new Date(now - 800).toISOString(),
        samplingIntervalMs: 2000,
        diagnostics: {
          timestamp: now,
          readings: [
            { key: "temperature", success: true, errorCode: 0 },
            { key: "current", success: true, errorCode: 0 },
          ],
          delivery: {
            storage: "RAM",
            bootId,
            clockReady: true,
            telemetry: {
              pending: 2,
              capacity: 32,
              committed: 240,
              failedEnqueues: 0,
            },
            alarm: { pending: 0, capacity: 8, committed: 2, failedEnqueues: 0 },
          },
        },
      };
      if (path === "/machines")
        return send([
          machine,
          {
            ...machine,
            deviceId: "UI-DEMO-02",
            name: "MÔ PHỎNG · Thiết bị chưa có số đo",
            gatewayOnline: false,
            dataFresh: false,
            readHealth: "unknown",
            deliveryHealth: "unknown",
            metrics: null,
            lastMeasurementAt: null,
            diagnostics: null,
          },
        ]);
      if (path.endsWith("/telemetry")) {
        const to = Number(url.searchParams.get("to"));
        const rows = Array.from({ length: 24 }, (_, i) => ({
          id: String(100 - i),
          deviceId: config.deviceId,
          timestamp: to - i * 2000 - (i > 12 ? 16000 : 0),
          receivedAt: new Date(to - i * 2000).toISOString(),
          metrics: {
            temperature: i === 4 ? 0 : i === 8 ? -18 : 25 + Math.sin(i / 3) * 4,
            current: 1.44,
          },
        }));
        return send({
          items: rows,
          nextCursor: null,
          from: Number(url.searchParams.get("from")),
          to,
        });
      }
      if (path.startsWith("/machines/")) return send(machine);
      if (path === "/catalog") return send(config);
      if (path === "/gateways")
        return send([
          {
            gatewayId,
            bootId,
            online: true,
            deviceId: config.deviceId,
            persisted: true,
          },
        ]);
      if (path === "/profiles")
        return send([
          {
            id: "fixture-temperature",
            name: "MÔ PHỎNG · Profile nhiệt độ",
            revision: 1,
          },
        ]);
      if (path.includes("/export"))
        return send({
          schemaVersion: 1,
          id: "fixture-temperature",
          name: "Profile",
          revision: 1,
          config,
        });
      if (path === "/config/preview")
        return send({
          config: validateConfig(body.config),
          bytes: 500,
          warnings: [],
          requiresProbe: true,
        });
      if (path.endsWith("/probe") || path.endsWith("/apply")) {
        const kind = path.endsWith("/probe") ? "probe" : "apply";
        if (kind === "apply") {
          const p = operations.get(body.probeRequestId);
          if (
            !p ||
            p.phase !== "completed" ||
            JSON.stringify(p.config) !==
              JSON.stringify(validateConfig(body.config))
          )
            return send({ error: "Probe exact config first" }, 409);
        }
        const op = {
          id: randomUUID(),
          gatewayId,
          bootId,
          kind,
          phase: "sent",
          config: validateConfig(body.config),
          startedAt: now,
          persisted: false,
        };
        operations.set(op.id, op);
        return send(op, 202);
      }
      if (path === "/operations")
        return send([...operations.values()].reverse());
      if (path.startsWith("/operations/")) {
        const o = operations.get(path.split("/").at(-1));
        if (!o) return send({ error: "Not found" }, 404);
        if (now - o.startedAt > 800) {
          o.phase = o.kind === "probe" ? "completed" : "applied";
          o.finishedAt ??= now;
          if (o.kind === "probe")
            o.readings = o.config.registerMap.map((r) => ({
              key: r.key,
              address: r.address,
              success: true,
              errorCode: 0,
              withinRange: true,
              value: r.key === "temperature" ? 25 : 1.44,
            }));
          else {
            o.persisted = true;
            config = o.config;
          }
        }
        return send(o);
      }
      const alarm = {
        id: "9223372036854775807",
        deviceId: config.deviceId,
        timestamp: now - 60000,
        code: "OVERHEAT",
        severity: "high",
        value: 95,
        metricKey: "temperature",
        acknowledgedAt,
      };
      if (path === "/alarms") {
        const filter = url.searchParams.get("acknowledged");
        return send({
          items:
            (filter === "false" && acknowledgedAt) ||
            (filter === "true" && !acknowledgedAt)
              ? []
              : [alarm],
          nextCursor: null,
          from: Number(url.searchParams.get("from")),
          to: Number(url.searchParams.get("to")),
        });
      }
      if (path.endsWith("/ack")) {
        acknowledgedAt ??= new Date().toISOString();
        return send({ ...alarm, acknowledgedAt });
      }
      send({ error: "Not found" }, 404);
    } catch (e) {
      send({ error: e.message }, 400);
    }
  })
  .listen(4319, "127.0.0.1", () =>
    console.log(
      "API MÔ PHỎNG kiểm thử: http://127.0.0.1:4319 — token fixture-read / fixture-write. Không có phần cứng.",
    ),
  );
