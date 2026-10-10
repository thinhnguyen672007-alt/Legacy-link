import { z } from "zod";
const finite = z.number().finite();
const maybeTime = z.string().nullable().optional();
const queue = z.object({
  pending: finite,
  capacity: finite,
  committed: finite,
  failedEnqueues: finite,
  highWater: finite.optional(),
  headId: z.string().optional(),
  rejection: z.unknown().optional(),
});
export const machineSchema = z.object({
  deviceId: z.string(),
  name: z.string().nullable().optional(),
  machineType: z.string().optional(),
  gatewayId: z.string().nullable().optional(),
  gatewayOnline: z.boolean(),
  dataFresh: z.boolean().optional(),
  readHealth: z.enum(["unknown", "stale", "healthy", "read_error"]).optional(),
  deliveryHealth: z
    .enum([
      "unknown",
      "stale",
      "rejected",
      "loss_observed",
      "backlog",
      "healthy",
    ])
    .optional(),
  metrics: z.record(z.string(), finite).nullable().optional(),
  lastSeenAt: maybeTime,
  lastMeasurementAt: maybeTime,
  lastTelemetryAt: maybeTime,
  samplingIntervalMs: finite.optional(),
  dataAgeSeconds: finite.nullable().optional(),
  diagnostics: z
    .object({
      timestamp: finite.optional(),
      readings: z
        .array(
          z
            .object({
              key: z.string(),
              success: z.boolean(),
              errorCode: finite.optional(),
            })
            .passthrough(),
        )
        .optional(),
      delivery: z
        .object({
          storage: z.string(),
          bootId: z.string(),
          clockReady: z.boolean().optional(),
          telemetry: queue,
          alarm: queue,
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .nullable()
    .optional(),
});
export type Machine = z.infer<typeof machineSchema>;
export const telemetrySchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  timestamp: finite,
  receivedAt: z.string().optional(),
  metrics: z.record(z.string(), finite),
  deliveryDelayMs: finite.optional(),
  delayed: z.boolean().optional(),
});
export type Telemetry = z.infer<typeof telemetrySchema>;
export const alarmSchema = z.object({
  id: z.string(),
  deviceId: z.string(),
  timestamp: finite,
  receivedAt: z.string().optional(),
  code: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  value: finite.nullable().optional(),
  metricKey: z.string().nullable().optional(),
  acknowledgedAt: maybeTime,
});
export type Alarm = z.infer<typeof alarmSchema>;
export const registerSchema = z.object({
  key: z.string(),
  address: finite,
  functionCode: finite,
  dataType: z.enum(["INT16", "UINT16", "UINT32"]),
  scale: finite,
  unit: z.string(),
  wordOrder: z.enum(["HIGH_FIRST", "LOW_FIRST"]),
  expectedMin: finite.optional(),
  expectedMax: finite.optional(),
  alarm: z
    .object({
      threshold: finite,
      hysteresis: finite,
      code: z.enum(["OVERHEAT", "OVERCURRENT", "OVERSPEED", "VIBRATION"]),
      severity: z.enum(["low", "medium", "high", "critical"]),
      criticalThreshold: finite.optional(),
    })
    .optional(),
});
export const configSchema = z.object({
  deviceId: z.string(),
  deviceName: z.string(),
  protocol: z.literal("MODBUS_RTU"),
  baudRate: finite,
  parity: z.enum(["NONE", "EVEN", "ODD"]),
  stopBits: finite,
  slaveId: finite,
  samplingIntervalMs: finite,
  registerMap: z.array(registerSchema),
});
export type Config = z.infer<typeof configSchema>;
export type Register = z.infer<typeof registerSchema>;
export const gatewaySchema = z
  .object({
    gatewayId: z.string(),
    online: z.boolean(),
    bootId: z.string(),
    deviceId: z.string().nullable().optional(),
    persisted: z.boolean().optional(),
    configRequestId: z.string().nullable().optional(),
  })
  .passthrough();
export const operationSchema = z
  .object({
    id: z.string(),
    gatewayId: z.string(),
    kind: z.enum(["probe", "apply"]),
    phase: z.enum([
      "sending",
      "sent",
      "received",
      "completed",
      "saving_catalog",
      "applied",
      "rejected",
      "timed_out",
      "publish_failed",
      "catalog_error",
    ]),
    persisted: z.boolean().optional(),
    restoredAfterRestart: z.boolean().optional(),
    config: configSchema,
    startedAt: finite,
    finishedAt: finite.optional(),
    bootId: z.string().optional(),
    error: z.string().nullable().optional(),
    readings: z
      .array(
        z.object({
          key: z.string(),
          address: finite,
          success: z.boolean(),
          errorCode: finite,
          withinRange: z.boolean().optional(),
          value: finite.optional(),
        }),
      )
      .optional(),
  })
  .passthrough();
export type Operation = z.infer<typeof operationSchema>;
export const previewSchema = z.object({
  config: configSchema,
  bytes: finite,
  warnings: z.array(z.string()),
  requiresProbe: z.literal(true),
});
export const profileSchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: finite,
});
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    from: finite,
    to: finite,
  });
}
export const terminal = (op: Operation) =>
  [
    "completed",
    "applied",
    "rejected",
    "timed_out",
    "publish_failed",
    "catalog_error",
  ].includes(op.phase);
export function canApply(
  op: Operation | undefined,
  config: Config | undefined,
  gateway: { gatewayId: string; bootId: string; online: boolean } | undefined,
  now: number,
) {
  return !!(
    op &&
    config &&
    gateway?.online &&
    op.phase === "completed" &&
    op.kind === "probe" &&
    op.gatewayId === gateway.gatewayId &&
    op.bootId === gateway.bootId &&
    op.finishedAt &&
    now - op.finishedAt < 60000 &&
    JSON.stringify(op.config) === JSON.stringify(config) &&
    op.readings?.length === config.registerMap.length &&
    op.readings.every(
      (r, i) =>
        r.success &&
        r.value !== undefined &&
        r.key === config.registerMap[i].key &&
        r.address === config.registerMap[i].address,
    )
  );
}
