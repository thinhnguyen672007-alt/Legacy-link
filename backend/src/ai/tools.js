// Gemini chỉ chọn công cụ. Trạng thái và số liệu luôn được code tính từ nguồn thật.
import { ControlError } from "../control/validation.js";
const bad = (message) => {
  throw new ControlError(message);
};
const states = [
  "overheat",
  "underheat",
  "offline",
  "stale",
  "unknown",
  "normal",
];
export const declarations = [
  {
    name: "get_factory_summary",
    description: "Tóm tắt kết nối và nhiệt độ nhà máy.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "get_devices_by_temperature_status",
    description: "Lọc máy theo nhiệt độ, mất kết nối hoặc dữ liệu cũ.",
    parametersJsonSchema: {
      type: "object",
      properties: { status: { type: "string", enum: states } },
      required: ["status"],
    },
  },
  {
    name: "get_device_status",
    description: "Đọc trạng thái một máy theo device ID.",
    parametersJsonSchema: {
      type: "object",
      properties: { deviceId: { type: "string" } },
      required: ["deviceId"],
    },
  },
  {
    name: "get_device_telemetry_history",
    description:
      "Lịch sử và xu hướng nhiệt độ, tối đa 60 phút; không kết luận nguyên nhân hỏng.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        deviceId: { type: "string" },
        minutes: { type: "integer", minimum: 1, maximum: 60 },
      },
      required: ["deviceId"],
    },
  },
  {
    name: "get_recent_alerts",
    description:
      "Sự kiện cảnh báo trong giờ qua. Chưa xác nhận không đồng nghĩa đang xảy ra.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
];
export function validateTool(name, args) {
  if (!args || typeof args !== "object" || Array.isArray(args))
    bad("Tham số công cụ phải là object");
  const contracts = {
    get_factory_summary: [],
    get_devices_by_temperature_status: ["status"],
    get_device_status: ["deviceId"],
    get_device_telemetry_history: ["deviceId", "minutes"],
    get_recent_alerts: [],
  };
  const allowed = Object.hasOwn(contracts, name) ? contracts[name] : null;
  if (!allowed || Object.keys(args).some((k) => !allowed.includes(k)))
    bad("Công cụ hoặc tham số không được phép");
  if (
    allowed.includes("deviceId") &&
    (typeof args.deviceId !== "string" ||
      !/^[A-Za-z0-9_-]{1,31}$/.test(args.deviceId))
  )
    bad("Device ID không hợp lệ");
  if (
    name === "get_devices_by_temperature_status" &&
    !states.includes(args.status)
  )
    bad("Trạng thái không hợp lệ");
  if (
    args.minutes !== undefined &&
    (!Number.isInteger(args.minutes) || args.minutes < 1 || args.minutes > 60)
  )
    bad("Khoảng thời gian phải từ 1 đến 60 phút");
  return args;
}
// Không đoán theo tên "temp". Mã cảnh báo hoặc metadata phải xác nhận đây là nhiệt độ.
export const temperatureRegisters = (config) =>
  (config?.registerMap ?? []).filter(
    (r) =>
      r.metricType === "temperature" ||
      r.alarm?.code === "OVERHEAT" ||
      r.lowAlarm?.code === "UNDERHEAT",
  );
export function temperatureStatus(machine, reg, now = Date.now()) {
  const value = machine.metrics?.[reg.key];
  const reading = machine.diagnostics?.readings?.find((r) => r.key === reg.key);
  const result = {
    metricKey: reg.key,
    unit: reg.unit,
    value: Number.isFinite(value) ? value : null,
    low: reg.lowAlarm?.threshold ?? null,
    high: reg.alarm?.code === "OVERHEAT" ? reg.alarm.threshold : null,
    measuredAt: machine.lastMeasurementAt ?? null,
    status: "unknown",
    reason: null,
  };
  if (!machine.gatewayOnline)
    return {
      ...result,
      status: "offline",
      reason: "Gateway mất kết nối; không kết luận nhiệt độ hiện tại.",
    };
  if (!machine.dataFresh)
    return {
      ...result,
      status: "stale",
      reason: "Số đo đã cũ hoặc chưa có số đo.",
    };
  if (
    reading &&
    (!reading.success ||
      !Number.isFinite(reading.sampledAt) ||
      now - reading.sampledAt > Math.max(5000, machine.samplingIntervalMs * 3))
  )
    return { ...result, reason: "Thanh ghi đọc lỗi hoặc số đo riêng đã cũ." };
  if (!Number.isFinite(value))
    return { ...result, reason: "Chưa có số đo hợp lệ." };
  if (!["°C", "C", "degC", "℃", "°F", "F", "K"].includes(reg.unit))
    return { ...result, reason: "Chưa xác minh đơn vị nhiệt độ." };
  if (result.low !== null && value < result.low)
    return { ...result, status: "underheat" };
  if (result.high !== null && value > result.high)
    return { ...result, status: "overheat" };
  // Có một ngưỡng vẫn phát hiện được vi phạm ngưỡng đó, nhưng không đủ kết luận normal.
  if (result.low === null || result.high === null)
    return {
      ...result,
      reason:
        "Chưa cấu hình đủ ngưỡng thấp và cao; không kết luận bình thường.",
    };
  return { ...result, status: "normal" };
}
export function createTools(db, clock = Date.now) {
  async function device(machine, read) {
    const config = await read(() => db.getCatalog(machine.deviceId));
    return {
      deviceId: machine.deviceId,
      name: machine.name ?? machine.deviceId,
      gatewayOnline: machine.gatewayOnline,
      dataFresh: machine.dataFresh,
      temperatures: temperatureRegisters(config).map((r) =>
        temperatureStatus(machine, r, clock()),
      ),
    };
  }
  return async (name, rawArgs, budget = {}) => {
    const args = validateTool(name, rawArgs),
      now = clock(),
      deadline = Math.min(Date.now() + 8000, budget.deadline ?? Infinity);
    async function read(run) {
      const remaining = deadline - Date.now();
      if (remaining <= 0)
        throw new ControlError("Đọc dữ liệu AI quá thời gian chờ", 503);
      let timer;
      try {
        return await Promise.race([
          run(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new ControlError("Đọc dữ liệu AI quá thời gian chờ", 503),
                ),
              remaining,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    const base = {
      tool: name,
      source: "database",
      queriedAt: new Date(now).toISOString(),
    };
    if (name === "get_recent_alerts") {
      const page = await read(() =>
        db.listAlarms({
          from: now - 3600000,
          to: now,
          limit: 50,
          cursor: null,
        }),
      );
      return {
        ...base,
        alerts: page.items,
        truncated: !!page.nextCursor,
        note: "Sự kiện đã xảy ra; xác nhận đã xem không chứng minh sự cố đã hết.",
      };
    }
    if (args.deviceId) {
      const machine = await read(() => db.getMachine(args.deviceId));
      if (!machine) throw new ControlError("Không tìm thấy thiết bị", 404);
      const d = await device(machine, read);
      if (name === "get_device_status") return { ...base, devices: [d] };
      const page = await read(() =>
        db.telemetryHistory(args.deviceId, {
          from: now - (args.minutes ?? 30) * 60000,
          to: now,
          limit: 100,
          cursor: null,
        }),
      );
      const series = d.temperatures.map((t) => {
        const points = page.items
          .filter((p) => Number.isFinite(p.metrics[t.metricKey]))
          .map((p) => ({
            timestamp: p.timestamp,
            value: p.metrics[t.metricKey],
          }))
          .reverse();
        const values = points.map((p) => p.value);
        return {
          metricKey: t.metricKey,
          unit: "chưa xác minh đơn vị lịch sử",
          points,
          min: values.length ? Math.min(...values) : null,
          max: values.length ? Math.max(...values) : null,
          change:
            points.length > 1 ? points.at(-1).value - points[0].value : null,
        };
      });
      return {
        ...base,
        devices: [d],
        series,
        truncated: !!page.nextCursor,
        note: "Tối đa 100 mẫu gần nhất, không phải thống kê toàn khoảng nếu bị cắt. Chỉ có nhiệt độ chưa đủ kết luận nguyên nhân hỏng. Ngưỡng hiển thị là cấu hình hiện tại. Chưa đối chiếu cấu hình tại từng mẫu lịch sử; các số thống kê chỉ mô tả giá trị đã lưu, không khẳng định cùng đơn vị hoặc đã vượt ngưỡng cũ.",
      };
    }
    const machines = await read(() => db.listMachines());
    const devices = [];
    // Giới hạn dữ liệu gửi sang UI/model; báo rõ danh sách có bị giới hạn.
    for (const machine of machines.slice(0, 100))
      devices.push(await device(machine, read));
    const filtered = args.status
      ? devices.filter((d) =>
          args.status === "offline"
            ? !d.gatewayOnline
            : args.status === "stale"
              ? d.gatewayOnline && !d.dataFresh
              : (args.status === "unknown" && !d.temperatures.length) ||
                d.temperatures.some((t) => t.status === args.status),
        )
      : devices;
    return {
      ...base,
      devices: filtered,
      inspected: devices.length,
      truncated: machines.length > 100,
      note: "Kết nối gateway không đồng nghĩa máy đang sản xuất. UNDERHEAT là dưới ngưỡng cấu hình, không tự động là máy hỏng.",
    };
  };
}
