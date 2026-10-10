import test from "node:test";
import assert from "node:assert/strict";
import { temperatureStatus, createTools, validateTool } from "./tools.js";
import { createCopilot } from "./service.js";
import { validateConfig } from "../control/validation.js";
import { validateAlarm } from "../validation/alarm.js";
import { getCatalog } from "../db/catalog.js";
const now = Date.now();
const reg = {
  key: "temperature",
  unit: "°C",
  alarm: { threshold: 80, code: "OVERHEAT" },
  lowAlarm: { threshold: 20, code: "UNDERHEAT" },
};
const machine = {
  deviceId: "BENCH-01",
  gatewayOnline: true,
  dataFresh: true,
  metrics: { temperature: 40 },
  lastMeasurementAt: new Date(now).toISOString(),
  samplingIntervalMs: 2000,
};
const config = {
  deviceId: "BENCH-01",
  deviceName: "Bench",
  registerMap: [
    {
      key: "temperature",
      address: 0,
      unit: "°C",
      alarm: {
        threshold: 80,
        hysteresis: 2,
        code: "OVERHEAT",
        severity: "high",
      },
      lowAlarm: {
        threshold: 20,
        hysteresis: 2,
        code: "UNDERHEAT",
        severity: "high",
      },
    },
  ],
};
const db = {
  listMachines: async () => [machine],
  getMachine: async (id) => (id === "BENCH-01" ? machine : null),
  getCatalog: async () => ({ registerMap: [reg] }),
  listAlarms: async () => ({ items: [], nextCursor: null }),
  telemetryHistory: async () => ({
    items: [
      { timestamp: now, metrics: { temperature: 40 } },
      { timestamp: now - 1000, metrics: { temperature: 30 } },
    ],
    nextCursor: null,
  }),
};
test("Nhiệt độ: ngưỡng nghiêm ngặt, normal cần cả hai ngưỡng", () => {
  for (const [value, status] of [
    [19, "underheat"],
    [20, "normal"],
    [80, "normal"],
    [81, "overheat"],
  ])
    assert.equal(
      temperatureStatus(
        { ...machine, metrics: { temperature: value } },
        reg,
        now,
      ).status,
      status,
    );
  assert.equal(
    temperatureStatus(machine, { ...reg, lowAlarm: undefined }).status,
    "unknown",
  );
  assert.equal(
    temperatureStatus(machine, { ...reg, unit: "A" }).status,
    "unknown",
  );
});
test("Không kết luận nhiệt độ hiện tại từ máy offline, stale, lỗi đọc hoặc thiếu số đo", () => {
  assert.equal(
    temperatureStatus({ ...machine, gatewayOnline: false }, reg).status,
    "offline",
  );
  assert.equal(
    temperatureStatus({ ...machine, dataFresh: false }, reg).status,
    "stale",
  );
  assert.equal(
    temperatureStatus({ ...machine, metrics: {} }, reg).status,
    "unknown",
  );
  for (const reading of [
    { key: reg.key, success: false },
    { key: reg.key, success: true, sampledAt: now - 60000 },
  ])
    assert.equal(
      temperatureStatus(
        { ...machine, diagnostics: { readings: [reading] } },
        reg,
        now,
      ).status,
      "unknown",
    );
});
test("Config chuẩn giữ lowAlarm qua validation; ngưỡng đảo, sai code, hysteresis âm bị từ chối", () => {
  assert.equal(validateConfig(config).registerMap[0].lowAlarm.threshold, 20);
  for (const low of [
    { threshold: 80 },
    { code: "OVERHEAT" },
    { hysteresis: -1 },
    { threshold: 3e38, hysteresis: 3e38 },
  ])
    assert.throws(() =>
      validateConfig({
        ...config,
        registerMap: [
          {
            ...config.registerMap[0],
            lowAlarm: { ...config.registerMap[0].lowAlarm, ...low },
          },
        ],
      }),
    );
  assert.equal(
    validateAlarm("BENCH-01", {
      schemaVersion: 1,
      deviceId: "BENCH-01",
      timestamp: now,
      code: "UNDERHEAT",
      severity: "high",
      value: 19,
    }).ok,
    true,
  );
});
test("Catalog ghép alarm_low từ DB, không làm mất ngưỡng khi lấy cấu hình", async () => {
  const stub = {
    query: async (sql) =>
      sql.includes("FROM device")
        ? {
            rowCount: 1,
            rows: [
              {
                device_id: "BENCH-01",
                name: "Bench",
                machine_type: "bench",
                protocol: "MODBUS_RTU",
                baud_rate: 9600,
                parity: "NONE",
                stop_bits: 1,
                slave_id: 1,
                sampling_interval_ms: 2000,
              },
            ],
          }
        : {
            rows: [
              {
                metric_key: "temperature",
                protocol_address: 0,
                function_code: 3,
                data_type: "INT16",
                scale: 1,
                unit: "°C",
                word_order: "HIGH_FIRST",
                alarm_high: 80,
                alarm_low: 20,
                alarm_code: "OVERHEAT",
                alarm_critical: null,
                alarm_hysteresis: 2,
                alarm_severity: "high",
              },
            ],
          },
  };
  assert.equal(
    (await getCatalog("BENCH-01", stub)).registerMap[0].lowAlarm.code,
    "UNDERHEAT",
  );
});
test("Tools chặn SQL, ghi máy, tham số lạ và lịch sử quá rộng", () => {
  for (const [name, args] of [
    ["apply_config", {}],
    ["get_device_status", { deviceId: "x'; DROP TABLE device" }],
    ["get_device_status", { deviceId: "BENCH-01", sql: "x" }],
    ["get_device_telemetry_history", { deviceId: "BENCH-01", minutes: 61 }],
  ])
    assert.throws(() => validateTool(name, args));
});
test("Tool dữ liệu thật: lọc nhiều máy, history tính xu hướng, máy không tồn tại", async () => {
  const tools = createTools({
    ...db,
    listMachines: async () => [
      machine,
      { ...machine, deviceId: "BENCH-02", metrics: { temperature: 90 } },
      { ...machine, deviceId: "BENCH-03", metrics: { temperature: 91 } },
    ],
  });
  assert.equal(
    (await tools("get_devices_by_temperature_status", { status: "overheat" }))
      .devices.length,
    2,
  );
  assert.equal(
    (await tools("get_devices_by_temperature_status", { status: "underheat" }))
      .devices.length,
    0,
  );
  assert.equal(
    (await tools("get_device_telemetry_history", { deviceId: "BENCH-01" }))
      .series[0].change,
    10,
  );
  await assert.rejects(tools("get_device_status", { deviceId: "NONE" }), {
    status: 404,
  });
});
test("Máy nhiều cảm biến: một cảm biến normal không che cảnh báo của cảm biến còn lại", async () => {
  const mixed = { ...machine, metrics: { temperature: 40, second: 90 } };
  const tools = createTools({
    ...db,
    listMachines: async () => [mixed],
    getCatalog: async () => ({ registerMap: [reg, { ...reg, key: "second" }] }),
  });
  assert.equal(
    (await tools("get_devices_by_temperature_status", { status: "normal" }))
      .devices.length,
    0,
  );
  const summary = await tools("get_factory_summary", {});
  assert.equal(summary.counts.normal, 0);
  assert.equal(summary.counts.overheat, 1);
  assert.equal(summary.counts.gatewayOnline, 1);
});
