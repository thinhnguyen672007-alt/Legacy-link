export interface Machine {
  deviceId: string;
  name: string;
  machineType: string;
  online: boolean;
  lastSeenAt: string | null;
  metrics: Record<string, number> | null;
  lastTelemetryAt?: string | null;
  samplingIntervalMs?: number;
  gatewayId?: string | null;
  configRequestId?: string | null;
  diagnostics?: {
    timestamp: number;
    configRequestId: string;
    samplingIntervalMs: number;
    readings: {
      key: string;
      success: boolean;
      errorCode: number;
      sampledAt: number;
      value?: number;
    }[];
  } | null;
}
export interface Register {
  key: string;
  address: number;
  functionCode: 3 | 4;
  dataType: string;
  scale: number;
  unit: string;
  alarm_high?: number;
  alarm_critical?: number;
  alarm_code?: string;
}
export interface Catalog {
  deviceId: string;
  deviceName: string;
  protocol: string;
  baudRate: number;
  parity: string;
  stopBits: number;
  slaveId: number;
  samplingIntervalMs: number;
  registerMap: Register[];
}
export type MachineState = "online" | "offline" | "quiet" | "waiting" | "clock";
export const CONTACT_TIMEOUT_MS = 15_000;
export const STATE_LABELS: Record<MachineState, string> = {
  online: "Online",
  offline: "Offline",
  quiet: "No recent contact",
  waiting: "Awaiting data",
  clock: "Check timestamp",
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an object.");
  return value as Record<string, unknown>;
}
function string(value: unknown): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error("Expected a non-empty string.");
  return value;
}
function number(value: unknown): number {
  // PostgreSQL NUMERIC fields in /catalog can be serialized as decimal strings.
  if (
    typeof value !== "number" &&
    !(typeof value === "string" && value.trim() !== "")
  )
    throw new Error("Expected a number.");
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error("Expected a finite number.");
  return parsed;
}
export function parseMachines(payload: unknown): Machine[] {
  if (!Array.isArray(payload))
    throw new Error("The machines response must be an array.");
  const ids = new Set<string>();
  return payload.map((item) => {
    const row = object(item);
    const deviceId = string(row.deviceId);
    if (ids.has(deviceId))
      throw new Error("The machines response contains duplicate device IDs.");
    ids.add(deviceId);
    const online = row.gatewayOnline ?? row.online;
    if (typeof online !== "boolean")
      throw new Error("Invalid machine online state.");
    const metrics = row.metrics == null ? null : object(row.metrics);
    if (
      metrics &&
      Object.values(metrics).some(
        (v) => typeof v !== "number" || !Number.isFinite(v),
      )
    )
      throw new Error("Invalid measurement value.");
    const lastSeenAt = row.lastSeenAt == null ? null : string(row.lastSeenAt);
    if (lastSeenAt && !Number.isFinite(Date.parse(lastSeenAt)))
      throw new Error("Invalid last-seen timestamp.");
    let diagnostics: Machine["diagnostics"] = null;
    if (row.diagnostics != null) {
      const d = object(row.diagnostics);
      if (
        !Number.isSafeInteger(d.timestamp) ||
        typeof d.configRequestId !== "string" ||
        typeof d.samplingIntervalMs !== "number" ||
        d.samplingIntervalMs < 100 ||
        !Array.isArray(d.readings)
      )
        throw new Error("Invalid measurement diagnostics.");
      const readings = d.readings.map((value) => {
        const r = object(value);
        if (
          typeof r.key !== "string" ||
          typeof r.success !== "boolean" ||
          !Number.isInteger(r.errorCode) ||
          typeof r.sampledAt !== "number" ||
          !Number.isFinite(r.sampledAt)
        )
          throw new Error("Invalid register result.");
        return {
          key: r.key,
          success: r.success,
          errorCode: r.errorCode as number,
          sampledAt: r.sampledAt,
          value:
            typeof r.value === "number" && Number.isFinite(r.value)
              ? r.value
              : undefined,
        };
      });
      diagnostics = {
        timestamp: d.timestamp as number,
        configRequestId: d.configRequestId,
        samplingIntervalMs: d.samplingIntervalMs,
        readings,
      };
    }
    const measurementTime = "lastMeasurementAt" in row ? row.lastMeasurementAt : row.lastTelemetryAt;
    const lastTelemetryAt = measurementTime == null ? null : string(measurementTime);
    if (lastTelemetryAt && !Number.isFinite(Date.parse(lastTelemetryAt)))
      throw new Error("Invalid telemetry timestamp.");
    return {
      deviceId,
      name: string(row.name),
      machineType: string(row.machineType),
      online,
      lastSeenAt,
      metrics: metrics as Machine["metrics"],
      lastTelemetryAt,
      diagnostics,
      samplingIntervalMs:
        typeof row.samplingIntervalMs === "number"
          ? row.samplingIntervalMs
          : undefined,
      gatewayId: typeof row.gatewayId === "string" ? row.gatewayId : null,
      configRequestId:
        typeof row.configRequestId === "string" ? row.configRequestId : null,
    };
  });
}
export function parseCatalog(payload: unknown, expectedId: string): Catalog {
  const row = object(payload);
  if (row.deviceId !== expectedId)
    throw new Error("The catalog belongs to a different device.");
  if (!Array.isArray(row.registerMap))
    throw new Error("The catalog is missing registerMap.");
  const keys = new Set<string>();
  const registerMap = row.registerMap.map((item) => {
    const reg = object(item);
    const key = string(reg.key);
    const address = number(reg.address);
    const functionCode = number(reg.functionCode);
    if (keys.has(key))
      throw new Error("The catalog contains duplicate metric keys.");
    keys.add(key);
    if (
      !Number.isInteger(address) ||
      address < 0 ||
      address > 65535 ||
      ![3, 4].includes(functionCode)
    )
      throw new Error("Invalid Modbus register address or function.");
    const result: Register = {
      ...reg,
      key,
      address,
      functionCode: functionCode as 3 | 4,
      dataType: string(reg.dataType),
      scale: number(reg.scale),
      unit: typeof reg.unit === "string" ? reg.unit : "",
    };
    if (reg.alarm_high != null) result.alarm_high = number(reg.alarm_high);
    if (reg.alarm_critical != null)
      result.alarm_critical = number(reg.alarm_critical);
    if (typeof reg.alarm_code === "string") result.alarm_code = reg.alarm_code;
    return result;
  });
  return {
    ...row,
    deviceId: expectedId,
    deviceName: string(row.deviceName),
    protocol: string(row.protocol),
    baudRate: number(row.baudRate),
    parity: string(row.parity),
    stopBits: number(row.stopBits),
    slaveId: number(row.slaveId),
    samplingIntervalMs: number(row.samplingIntervalMs),
    registerMap,
  };
}
export function machineState(machine: Machine, now: number): MachineState {
  if (!machine.lastSeenAt) return "waiting";
  if (!machine.online) return "offline";
  const age = now - Date.parse(machine.lastSeenAt);
  if (age < -5_000) return "clock";
  if (age > CONTACT_TIMEOUT_MS) return "quiet";
  if (!machine.metrics || Object.keys(machine.metrics).length === 0)
    return "waiting";
  return "online";
}
export function relativeTime(iso: string | null, now: number): string {
  if (!iso) return "Never received";
  const seconds = Math.floor((now - Date.parse(iso)) / 1000);
  if (seconds < -5) return "In the future";
  if (seconds < 2) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a full URL, for example http://192.168.1.20:3000.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "Use an HTTP or HTTPS URL without credentials, query parameters or a fragment.",
    );
  return url.toString().replace(/\/+$/, "");
}
export const metricName = (key: string) =>
  ({
    temperature: "Temperature",
    current: "Current",
    rpm: "Spindle speed",
    speed: "Speed",
    torque: "Torque",
    pressure: "Pressure",
    vibration: "Vibration",
  })[key] ?? key.replaceAll("_", " ");
export const formatValue = (value: number | undefined) =>
  value == null
    ? "—"
    : new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
export const modiconReference = (reg: Register) =>
  (reg.functionCode === 3 ? 40001 : 30001) + reg.address;
