// Gemini chọn công cụ và giải thích. Backend tính trạng thái và số liệu từ nguồn thật.
import { ControlError } from "../control/validation.js";
import { validMetricKey } from "../validation/telemetry.js";
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
      "Lịch sử số đo và xu hướng tối đa 60 phút. metricKey chọn chính xác số đo đã đăng ký; bỏ qua để xem nhiệt độ. Không kết luận nguyên nhân hỏng.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        deviceId: { type: "string" },
        metricKey: {
          type: "string",
          maxLength: 19,
          description:
            "Tên số đo đã đăng ký, ví dụ current hoặc rpm; không đoán đơn vị.",
        },
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
declarations.push(
  {
    name: "get_anomalous_devices",
    description:
      "Máy cần chú ý: cảnh báo, mất kết nối, đọc lỗi, dữ liệu cũ hoặc thiếu căn cứ. Ưu tiên được backend tính; không xác nhận máy hỏng.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
  {
    name: "get_device_alerts",
    description:
      "Cảnh báo gần đây của một thiết bị; xác nhận đã xem không chứng minh đã hết sự cố.",
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
    name: "compare_devices",
    description:
      "So sánh lịch sử giá trị lưu của tối đa 6 thiết bị. Đơn vị lịch sử chưa xác minh, không xếp hạng nhiệt độ vật lý khác đơn vị.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        deviceIds: {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 6,
          uniqueItems: true,
        },
        minutes: { type: "integer", minimum: 1, maximum: 60 },
      },
      required: ["deviceIds"],
    },
  },
);
export function validateTool(name, args) {
  if (
    !args ||
    typeof args !== "object" ||
    Array.isArray(args) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(args))
  )
    bad("Tham số công cụ phải là object");
  const contracts = {
    get_factory_summary: [],
    get_devices_by_temperature_status: ["status"],
    get_device_status: ["deviceId"],
    get_device_telemetry_history: ["deviceId", "minutes", "metricKey"],
    get_recent_alerts: [],
    get_device_alerts: ["deviceId", "minutes"],
    compare_devices: ["deviceIds", "minutes"],
    get_anomalous_devices: [],
  };
  const allowed = Object.hasOwn(contracts, name) ? contracts[name] : null;
  if (!allowed || Reflect.ownKeys(args).some((k) => !allowed.includes(k)))
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
  if (args.metricKey !== undefined && !validMetricKey(args.metricKey))
    bad("Tên số đo không hợp lệ");
  if (
    name === "compare_devices" &&
    (!Array.isArray(args.deviceIds) ||
      args.deviceIds.length < 1 ||
      args.deviceIds.length > 6 ||
      new Set(args.deviceIds).size !== args.deviceIds.length ||
      args.deviceIds.some(
        (id) => typeof id !== "string" || !/^[A-Za-z0-9_-]{1,31}$/.test(id),
      ))
  )
    bad("Cần 1–6 mã máy khác nhau, hợp lệ");
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
    critical:
      reg.alarm?.code === "OVERHEAT"
        ? (reg.alarm.criticalThreshold ?? null)
        : null,
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
  if (
    machine.configRequestId &&
    machine.diagnostics?.configRequestId &&
    machine.configRequestId !== machine.diagnostics.configRequestId
  )
    return {
      ...result,
      value: null,
      reason:
        "Số đo thuộc cấu hình khác; chờ diagnostics và số đo của cấu hình hiện tại.",
    };
  const measuredAt = Date.parse(machine.lastMeasurementAt);
  if (Number.isFinite(measuredAt) && measuredAt > now + 1000)
    return {
      ...result,
      reason: "Thời gian số đo ở tương lai; cần kiểm tra đồng hồ.",
    };
  if (
    !machine.dataFresh ||
    !Number.isFinite(measuredAt) ||
    now - measuredAt > Math.max(5000, machine.samplingIntervalMs * 3)
  )
    return {
      ...result,
      status: "stale",
      reason: "Số đo đã cũ hoặc chưa có số đo.",
    };
  if (
    machine.diagnostics?.timestamp !== undefined &&
    (!Number.isFinite(machine.diagnostics.timestamp) ||
      machine.diagnostics.timestamp > now + 1000 ||
      now - machine.diagnostics.timestamp >
        Math.max(5000, machine.samplingIntervalMs * 3))
  )
    return {
      ...result,
      reason: "Diagnostics đã cũ hoặc thời gian không hợp lệ.",
    };
  if (
    reading &&
    (!reading.success ||
      !Number.isFinite(reading.sampledAt) ||
      reading.sampledAt > now + 1000 ||
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
    let config,
      catalogError = false;
    try {
      config = await read(() => db.getCatalog(machine.deviceId));
      catalogError = !config;
    } catch {
      catalogError = true;
    }
    const configMatches = !(
      machine.configRequestId &&
      machine.diagnostics?.configRequestId &&
      machine.configRequestId !== machine.diagnostics.configRequestId
    );
    const d = {
      deviceId: machine.deviceId,
      name: machine.name ?? machine.deviceId,
      gatewayOnline: !!machine.gatewayOnline,
      dataFresh:
        configMatches &&
        !!machine.dataFresh &&
        Number.isFinite(Date.parse(machine.lastMeasurementAt)) &&
        Date.parse(machine.lastMeasurementAt) <= clock() + 1000 &&
        clock() - Date.parse(machine.lastMeasurementAt) <=
          Math.max(5000, machine.samplingIntervalMs * 3),
      readHealth: machine.readHealth ?? "unknown",
      deliveryHealth: machine.deliveryHealth ?? "unknown",
      provenance: ["simulator", "bench"].includes(
        machine.machineType?.toLowerCase(),
      )
        ? "simulation"
        : "unverified",
      samplingIntervalMs:
        config?.samplingIntervalMs ?? machine.samplingIntervalMs ?? null,
      metrics: (config?.registerMap ?? []).slice(0, 16).map((r) => {
        const reading = machine.diagnostics?.readings?.find(
          (item) => item.key === r.key,
        );
        return {
          key: r.key,
          value:
            configMatches && Number.isFinite(machine.metrics?.[r.key])
              ? machine.metrics[r.key]
              : null,
          unit: typeof r.unit === "string" ? r.unit : "",
          measuredAt: Number.isFinite(Date.parse(machine.lastMeasurementAt))
            ? new Date(machine.lastMeasurementAt).toISOString()
            : null,
          readSuccess:
            configMatches && typeof reading?.success === "boolean"
              ? reading.success
              : null,
        };
      }),
      failureConfirmed: false,
      temperatures: temperatureRegisters(config).map((r) =>
        temperatureStatus(machine, r, clock()),
      ),
      priority: "low",
      reasons: [],
      nextChecks: [],
      partial: catalogError,
    };
    const attention = (priority, reason, next) => {
      if (
        priority === "high" ||
        (priority === "medium" && d.priority === "low")
      )
        d.priority = priority;
      d.reasons.push(reason);
      d.nextChecks.push(next);
    };
    if (!d.gatewayOnline)
      attention(
        "high",
        "Gateway mất kết nối; chưa xác nhận máy hỏng.",
        "Kiểm tra nguồn gateway, Wi-Fi và broker MQTT.",
      );
    if (d.readHealth === "read_error")
      attention(
        "high",
        "Có thanh ghi đọc lỗi; chưa xác nhận lỗi cơ khí.",
        "Kiểm tra địa chỉ thanh ghi, slave ID và dây Modbus.",
      );
    if (
      machine.readHealth !== undefined &&
      !["healthy", "read_error"].includes(d.readHealth)
    )
      attention(
        "medium",
        "Chất lượng đọc chưa được xác minh hoặc đã cũ: " + d.readHealth,
        "Kiểm tra diagnostics mới nhất và kết nối Modbus.",
      );
    if (!d.dataFresh && d.gatewayOnline)
      attention(
        "medium",
        "Dữ liệu đã cũ hoặc chưa có mẫu.",
        "Kiểm tra chu kỳ lấy mẫu, đồng hồ và truyền dữ liệu.",
      );
    if (
      ["stale", "backlog", "rejected", "loss_observed"].includes(
        d.deliveryHealth,
      )
    )
      attention(
        "medium",
        "Đường truyền dữ liệu cần kiểm tra: " + d.deliveryHealth,
        "Đối chiếu diagnostics, queue và ACK lưu dữ liệu.",
      );
    for (const t of d.temperatures) {
      if (["overheat", "underheat"].includes(t.status)) {
        const critical =
          t.status === "overheat" &&
          t.critical !== null &&
          t.value > t.critical;
        attention(
          critical ? "high" : "medium",
          `${t.metricKey}: ${t.value} ${t.unit}; ${critical ? "vượt ngưỡng nghiêm trọng" : "vượt ngưỡng cấu hình"}.`,
          "Đối chiếu cảm biến và quy trình kiểm tra an toàn của nhà máy; chưa xác định nguyên nhân.",
        );
      } else if (t.status === "unknown")
        attention(
          "medium",
          t.reason ?? "Chưa đủ căn cứ đánh giá nhiệt độ.",
          "Kiểm tra metadata, ngưỡng và chất lượng số đo.",
        );
    }
    if (catalogError || !d.temperatures.length)
      attention(
        "medium",
        catalogError
          ? "Không đọc được cấu hình thiết bị."
          : "Chưa có thanh ghi được xác nhận là nhiệt độ.",
        "Kiểm tra catalog và loại số đo; không suy đoán theo tên thanh ghi.",
      );
    d.nextChecks = [...new Set(d.nextChecks)];
    return d;
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
    const minutes = args.minutes ?? 30,
      from = now - minutes * 60000;
    async function history(d, metricKey, maximumPoints = 6000) {
      const selected =
        metricKey === undefined
          ? d.temperatures
          : d.metrics
              .filter((metric) => metric.key === metricKey)
              .map((metric) => ({ metricKey: metric.key, unit: metric.unit }));
      if (metricKey !== undefined && !selected.length)
        throw new ControlError("Số đo chưa được đăng ký cho thiết bị", 404);
      const sampleLimit = Math.min(
        2000,
        Math.floor(maximumPoints / Math.max(1, selected.length)),
      );
      const items = [],
        seen = new Set();
      let cursor = null,
        truncated = false;
      do {
        if (Date.now() >= deadline) {
          truncated = true;
          break;
        }
        const limit = Math.min(200, sampleLimit - items.length);
        if (limit <= 0) {
          truncated = true;
          break;
        }
        let page;
        try {
          page = await read(() =>
            db.telemetryHistory(d.deviceId, { from, to: now, limit, cursor }),
          );
        } catch (error) {
          if (!items.length) throw error;
          truncated = true;
          break;
        }
        items.push(...page.items.slice(0, limit));
        if (!page.nextCursor) break;
        if (seen.has(page.nextCursor)) {
          truncated = true;
          break;
        }
        seen.add(page.nextCursor);
        try {
          cursor = JSON.parse(
            Buffer.from(page.nextCursor, "base64url").toString(),
          );
        } catch {
          truncated = true;
          break;
        }
        if (
          !cursor ||
          !Number.isFinite(Number(cursor.ts)) ||
          !/^\d+$/.test(String(cursor.id))
        ) {
          truncated = true;
          break;
        }
      } while (true);
      const series = selected.map((t) => {
        const points = items
          .filter(
            (p) =>
              p.timestamp >= from &&
              p.timestamp <= now &&
              Number.isFinite(p.metrics?.[t.metricKey]),
          )
          .map((p) => ({
            timestamp: p.timestamp,
            value: p.metrics[t.metricKey],
          }))
          .sort((a, b) => a.timestamp - b.timestamp);
        const values = points.map((p) => p.value);
        return {
          deviceId: d.deviceId,
          metricKey: t.metricKey,
          unit: "chưa xác minh đơn vị lịch sử",
          currentUnit: t.unit ?? null,
          unitVerified: false,
          samplingIntervalMs: d.samplingIntervalMs,
          points,
          sampledCount: points.length,
          min: values.length ? Math.min(...values) : null,
          max: values.length ? Math.max(...values) : null,
          change:
            points.length > 1 ? points.at(-1).value - points[0].value : null,
          coverage: {
            from,
            to: now,
            firstSampleAt: points[0]?.timestamp ?? null,
            lastSampleAt: points.at(-1)?.timestamp ?? null,
          },
        };
      });
      return { series, truncated };
    }
    if (name === "get_recent_alerts" || name === "get_device_alerts") {
      let devices;
      if (args.deviceId) {
        const machine = await read(() => db.getMachine(args.deviceId));
        if (!machine) throw new ControlError("Không tìm thấy thiết bị", 404);
        devices = [await device(machine, read)];
      }
      const page = await read(() =>
        db.listAlarms({
          deviceId: args.deviceId,
          from: name === "get_recent_alerts" ? now - 3600000 : from,
          to: now,
          limit: 50,
          cursor: null,
        }),
      );
      return {
        ...base,
        ...(devices ? { devices } : {}),
        alerts: page.items,
        truncated: !!page.nextCursor,
        note: "Sự kiện đã xảy ra; xác nhận đã xem không chứng minh sự cố đã hết.",
      };
    }
    if (name === "compare_devices") {
      const devices = [],
        series = [],
        errors = [];
      let truncated = false;
      for (const id of args.deviceIds) {
        try {
          const machine = await read(() => db.getMachine(id));
          if (!machine) throw new ControlError("Không tìm thấy thiết bị", 404);
          const d = await device(machine, read);
          devices.push(d);
          const remainingPoints =
            6000 - series.reduce((sum, item) => sum + item.points.length, 0);
          const h = await history(d, undefined, remainingPoints);
          series.push(...h.series);
          truncated ||= h.truncated;
        } catch {
          errors.push({
            deviceId: id,
            message: "Không truy xuất được thiết bị hoặc lịch sử.",
          });
        }
      }
      return {
        ...base,
        devices,
        series,
        errors,
        partial: errors.length > 0 || devices.some((d) => d.partial),
        truncated,
        comparableUnits: false,
        note: "Tối đa 6000 điểm cho toàn so sánh. Giá trị lịch sử chưa đối chiếu cấu hình từng mẫu. Không so sánh vật lý hoặc xếp hạng nhiệt độ giữa các đơn vị chưa xác minh.",
      };
    }
    if (args.deviceId) {
      const machine = await read(() => db.getMachine(args.deviceId));
      if (!machine) throw new ControlError("Không tìm thấy thiết bị", 404);
      const d = await device(machine, read);
      if (name === "get_device_status")
        return { ...base, devices: [d], partial: d.partial };
      return {
        ...base,
        devices: [d],
        ...(await history(d, args.metricKey)),
        partial: d.partial,
        note: "Tối đa 6000 điểm truy vấn. Thống kê giá trị đã lưu; chưa xác minh đơn vị lịch sử hoặc ngưỡng tại từng mẫu. Dữ liệu bị cắt không đại diện toàn khoảng; không kết luận nguyên nhân hỏng.",
      };
    }
    const machines = await read(() => db.listMachines());
    const devices = [];
    // Giới hạn dữ liệu gửi sang UI/model; báo rõ danh sách có bị giới hạn.
    for (const machine of machines.slice(0, 100))
      devices.push(await device(machine, read));
    // Một cảm biến bình thường không đủ kết luận cả máy bình thường.
    const matches = (d, status) => {
      if (status === "offline") return !d.gatewayOnline;
      if (status === "stale") return d.gatewayOnline && !d.dataFresh;
      if (status === "normal")
        return (
          d.temperatures.length > 0 &&
          d.temperatures.every((t) => t.status === "normal")
        );
      if (status === "unknown" && !d.temperatures.length)
        return d.gatewayOnline && d.dataFresh;
      return d.temperatures.some((t) => t.status === status);
    };
    const filtered = args.status
      ? devices.filter((d) => matches(d, args.status))
      : name === "get_anomalous_devices"
        ? devices
            .filter((d) => d.priority !== "low")
            .sort(
              (a, b) =>
                ({ high: 0, medium: 1, low: 2 })[a.priority] -
                { high: 0, medium: 1, low: 2 }[b.priority],
            )
        : devices;
    const counts = {
      inspected: devices.length,
      gatewayOnline: devices.filter((d) => d.gatewayOnline).length,
      ...Object.fromEntries(
        states.map((status) => [
          status,
          devices.filter((d) => matches(d, status)).length,
        ]),
      ),
    };
    return {
      ...base,
      devices: filtered,
      counts,
      inspected: devices.length,
      truncated: machines.length > 100,
      partial: devices.some((d) => d.partial),
      note: "Kết nối gateway không đồng nghĩa máy đang sản xuất. UNDERHEAT là dưới ngưỡng cấu hình, không tự động là máy hỏng.",
    };
  };
}
