import test from "node:test";
import assert from "node:assert/strict";
import {
  createTools,
  temperatureStatus,
  validateTool,
  declarations,
} from "./tools.js";
const now = Date.now();
const reg = {
  key: "temperature",
  unit: "C",
  alarm: { code: "OVERHEAT", threshold: 90, criticalThreshold: 100 },
  lowAlarm: { code: "UNDERHEAT", threshold: 10 },
};
const machine = {
  deviceId: "CNC-01",
  machineType: "cnc",
  gatewayOnline: true,
  dataFresh: true,
  samplingIntervalMs: 2000,
  lastMeasurementAt: new Date(now).toISOString(),
  metrics: { temperature: 25 },
  readHealth: "healthy",
  deliveryHealth: "healthy",
};
const db = {
  getMachine: async (id) => ({ ...machine, deviceId: id }),
  getCatalog: async () => ({ registerMap: [reg] }),
  listMachines: async () => [machine],
  telemetryHistory: async () => ({ items: [], nextCursor: null }),
  listAlarms: async () => ({ items: [], nextCursor: null }),
};
test("new read-only declarations and strict arguments", () => {
  for (const name of [
    "compare_devices",
    "get_device_alerts",
    "get_anomalous_devices",
  ])
    assert.ok(declarations.some((d) => d.name === name));
  for (const args of [
    { deviceIds: [] },
    { deviceIds: ["CNC-01", "CNC-01"] },
    { deviceIds: ["bad id"] },
    { deviceIds: ["CNC-01"], minutes: 61 },
    { deviceIds: ["CNC-01"], sql: "x" },
    Object.create({ deviceIds: ["CNC-01"] }),
  ])
    assert.throws(() => validateTool("compare_devices", args));
  assert.throws(() =>
    validateTool("get_factory_summary", { [Symbol("x")]: true }),
  );
  assert.deepEqual(
    validateTool("compare_devices", { deviceIds: ["CNC-01"], minutes: 60 }),
    { deviceIds: ["CNC-01"], minutes: 60 },
  );
});
test("stale and future measurements / diagnostics cannot substantiate temperature", () => {
  for (const m of [
    { ...machine, lastMeasurementAt: new Date(now + 60000).toISOString() },
    { ...machine, lastMeasurementAt: new Date(now - 60000).toISOString() },
    { ...machine, diagnostics: { timestamp: now + 60000, readings: [] } },
    {
      ...machine,
      diagnostics: {
        timestamp: now,
        readings: [
          { key: "temperature", success: true, sampledAt: now + 60000 },
        ],
      },
    },
  ])
    assert.notEqual(temperatureStatus(m, reg, now).status, "normal");
});
test("priority derives from facts; offline does not become confirmed failure; provenance explicit", async () => {
  const tools = createTools(
    {
      ...db,
      listMachines: async () => [
        { ...machine, deviceId: "HOT-01", metrics: { temperature: 101 } },
        { ...machine, deviceId: "OFF-01", gatewayOnline: false },
        { ...machine, deviceId: "BAD-01", readHealth: "read_error" },
        { ...machine, deviceId: "SIM-01", machineType: "simulator" },
      ],
    },
    () => now,
  );
  const result = await tools("get_factory_summary", {});
  assert.equal(result.devices[0].priority, "high");
  assert.equal(result.devices[1].priority, "high");
  assert.equal(result.devices[2].priority, "high");
  assert.ok(result.devices.every((d) => d.failureConfirmed === false));
  assert.equal(result.devices[0].provenance, "unverified");
  assert.equal(result.devices[3].provenance, "simulation");
  const anomalous = await tools("get_anomalous_devices", {});
  assert.equal(anomalous.devices.length, 3);
});
test("catalog failure preserves factory device with unknown partial result", async () => {
  const tools = createTools(
    {
      ...db,
      getCatalog: async () => {
        throw new Error("DB temporarily unavailable");
      },
    },
    () => now,
  );
  const result = await tools("get_factory_summary", {});
  assert.equal(result.partial, true);
  assert.equal(result.devices.length, 1);
  assert.equal(result.devices[0].priority, "medium");
  assert.equal(result.devices[0].temperatures.length, 0);
});
test("history fetches pages and sorts timestamps; units stay unverified", async () => {
  const options = [];
  const tools = createTools(
    {
      ...db,
      telemetryHistory: async (id, o) => {
        options.push(o);
        return !o.cursor
          ? {
              items: [{ timestamp: now, metrics: { temperature: 40 } }],
              nextCursor: Buffer.from(
                JSON.stringify({ ts: now, id: "2" }),
              ).toString("base64url"),
            }
          : {
              items: [{ timestamp: now - 1000, metrics: { temperature: 30 } }],
              nextCursor: null,
            };
      },
    },
    () => now,
  );
  const result = await tools("get_device_telemetry_history", {
    deviceId: "CNC-01",
    minutes: 60,
  });
  assert.equal(options.length, 2);
  assert.deepEqual(options[1].cursor, { ts: now, id: "2" });
  assert.equal(result.truncated, false);
  assert.equal(result.series[0].sampledCount, 2);
  assert.equal(result.series[0].change, 10);
  assert.equal(result.series[0].unitVerified, false);
  assert.equal(result.series[0].currentUnit, "C");
  assert.equal(result.series[0].deviceId, "CNC-01");
});
test("2000 samples bound is explicit; no claim whole window covered", async () => {
  let calls = 0;
  const tools = createTools(
    {
      ...db,
      telemetryHistory: async (id, o) => {
        calls++;
        return {
          items: Array.from({ length: o.limit }, (_, i) => ({
            timestamp: now - calls * 1000 - i,
            metrics: { temperature: 30 },
          })),
          nextCursor: Buffer.from(
            JSON.stringify({ ts: now - calls * 1000, id: String(calls) }),
          ).toString("base64url"),
        };
      },
    },
    () => now,
  );
  const result = await tools("get_device_telemetry_history", {
    deviceId: "CNC-01",
  });
  assert.equal(calls, 10);
  assert.equal(result.series[0].points.length, 2000);
  assert.equal(result.truncated, true);
});
test("comparison retains available devices on missing machine and alarm query scoped to device", async () => {
  let filter;
  const tools = createTools(
    {
      ...db,
      getMachine: async (id) =>
        id === "NONE" ? null : { ...machine, deviceId: id },
      listAlarms: async (o) => {
        filter = o;
        return { items: [], nextCursor: null };
      },
    },
    () => now,
  );
  const comparison = await tools("compare_devices", {
    deviceIds: ["CNC-01", "NONE"],
  });
  assert.equal(comparison.partial, true);
  assert.equal(comparison.devices.length, 1);
  assert.equal(comparison.errors[0].deviceId, "NONE");
  assert.equal(comparison.comparableUnits, false);
  await tools("get_device_alerts", { deviceId: "CNC-01", minutes: 15 });
  assert.equal(filter.deviceId, "CNC-01");
  assert.equal(filter.from, now - 900000);
});
test("registered current/rpm visible without guessed units; optional specific history", async () => {
  const tools = createTools(
    {
      ...db,
      getMachine: async (id) => ({
        ...machine,
        deviceId: id,
        metrics: { temperature: 25, current: 1.79, rpm: 1534 },
        diagnostics: { readings: [{ key: "current", success: true }] },
      }),
      getCatalog: async () => ({
        samplingIntervalMs: 2000,
        registerMap: [
          reg,
          { key: "current", unit: "A" },
          { key: "rpm", unit: "rpm" },
        ],
      }),
      telemetryHistory: async () => ({
        items: [{ timestamp: now, metrics: { current: 1.79, rpm: 1534 } }],
        nextCursor: null,
      }),
    },
    () => now,
  );
  const status = await tools("get_device_status", { deviceId: "CNC-01" });
  assert.deepEqual(
    status.devices[0].metrics.find((m) => m.key === "current"),
    {
      key: "current",
      value: 1.79,
      unit: "A",
      measuredAt: machine.lastMeasurementAt,
      readSuccess: true,
    },
  );
  const h = await tools("get_device_telemetry_history", {
    deviceId: "CNC-01",
    metricKey: "rpm",
  });
  assert.equal(h.series.length, 1);
  assert.equal(h.series[0].metricKey, "rpm");
  assert.equal(h.series[0].points[0].value, 1534);
  assert.equal(h.series[0].currentUnit, "rpm");
  assert.equal(h.series[0].unitVerified, false);
  assert.equal(h.series[0].samplingIntervalMs, 2000);
  await assert.rejects(
    tools("get_device_telemetry_history", {
      deviceId: "CNC-01",
      metricKey: "unregistered",
    }),
    { status: 404 },
  );
  for (const metricKey of ["bad-key", "", "a".repeat(20), "__proto__"])
    assert.throws(() =>
      validateTool("get_device_telemetry_history", {
        deviceId: "CNC-01",
        metricKey,
      }),
    );
});
test("explicit stale/unknown read health needs attention", async () => {
  for (const readHealth of ["stale", "unknown"]) {
    const result = await createTools(
      { ...db, listMachines: async () => [{ ...machine, readHealth }] },
      () => now,
    )("get_factory_summary", {});
    assert.equal(result.devices[0].priority, "medium");
  }
});
test("comparison bound applies across devices and multiple registered thermal metrics", async () => {
  const tools = createTools(
    {
      ...db,
      getCatalog: async () => ({
        registerMap: [reg, { ...reg, key: "second" }],
      }),
      telemetryHistory: async (id, o) => ({
        items: Array.from({ length: o.limit }, (_, i) => ({
          timestamp: now - i,
          metrics: { temperature: 25, second: 30 },
        })),
        nextCursor: Buffer.from(
          JSON.stringify({
            ts: now,
            id: String((o.cursor?.id ? Number(o.cursor.id) : 0) + 1),
          }),
        ).toString("base64url"),
      }),
    },
    () => now,
  );
  const result = await tools("compare_devices", {
    deviceIds: ["CNC-01", "CNC-02", "CNC-03", "CNC-04"],
  });
  assert.equal(
    result.series.reduce((sum, s) => sum + s.points.length, 0),
    6000,
  );
  assert.equal(result.truncated, true);
});
test("device-level freshness cannot trust future measurement flags for arbitrary metrics", async () => {
  const result = await createTools(
    {
      ...db,
      listMachines: async () => [
        { ...machine, lastMeasurementAt: new Date(now + 60000).toISOString() },
      ],
    },
    () => now,
  )("get_factory_summary", {});
  assert.equal(result.devices[0].dataFresh, false);
  assert.equal(result.devices[0].priority, "medium");
});

test("old configuration diagnostics cannot substantiate new catalog values", async () => {
  const changed = {
    ...machine,
    configRequestId: "new",
    diagnostics: {
      configRequestId: "old",
      timestamp: now,
      readings: [{ key: "temperature", success: true, sampledAt: now }],
    },
  };
  assert.equal(temperatureStatus(changed, reg, now).status, "unknown");
  assert.equal(temperatureStatus(changed, reg, now).value, null);
  const result = await createTools(
    { ...db, getMachine: async () => changed },
    () => now,
  )("get_device_status", { deviceId: "CNC-01" });
  assert.equal(result.devices[0].dataFresh, false);
  assert.equal(result.devices[0].metrics[0].value, null);
});
test("standalone multi-metric history remains within report point budget", async () => {
  const keys = ["temperature", "temp2", "temp3", "temp4"];
  const tools = createTools(
    {
      ...db,
      getCatalog: async () => ({
        registerMap: keys.map((key) => ({ ...reg, key })),
      }),
      telemetryHistory: async (id, o) => ({
        items: Array.from({ length: o.limit }, (_, i) => ({
          timestamp: now - i,
          metrics: Object.fromEntries(keys.map((k) => [k, 25])),
        })),
        nextCursor: Buffer.from(
          JSON.stringify({
            ts: now,
            id: String((o.cursor?.id ? Number(o.cursor.id) : 0) + 1),
          }),
        ).toString("base64url"),
      }),
    },
    () => now,
  );
  const result = await tools("get_device_telemetry_history", {
    deviceId: "CNC-01",
  });
  assert.equal(
    result.series.reduce((n, s) => n + s.points.length, 0),
    6000,
  );
  assert.equal(result.truncated, true);
  const { validateResult } = await import("./report.js");
  assert.equal(validateResult(result, result.tool), result);
});
