import type { Catalog, Register } from "./model";
export interface DraftRegister extends Register {
  wordOrder?: "HIGH_FIRST" | "LOW_FIRST";
  expectedMin?: number;
  expectedMax?: number;
  alarm?: {
    threshold: number;
    hysteresis: number;
    code: string;
    severity: string;
  };
}
export interface DraftConfig extends Catalog {
  registerMap: DraftRegister[];
}
export interface Gateway {
  gatewayId: string;
  deviceId: string | null;
  online: boolean;
  bootId: string;
  configRequestId: string;
  persisted: boolean;
  restored: boolean;
}
export interface ReadResult {
  key: string;
  address: number;
  success: boolean;
  errorCode: number;
  sampledAt: number;
  rawWords?: number[];
  rawValue?: number;
  value?: number;
  withinRange?: boolean;
}
export interface Operation {
  id: string;
  gatewayId: string;
  kind: "probe" | "apply";
  phase: string;
  received: boolean;
  persisted: boolean;
  applied?: boolean;
  restoredAfterRestart?: boolean;
  startedAt: number;
  finishedAt?: number;
  error?: string;
  readings?: ReadResult[];
}
export function demoProfile(kind: "A" | "B"): DraftConfig {
  return {
    deviceId: `DEMO-${kind}`,
    deviceName: `Demo machine ${kind}`,
    protocol: "MODBUS_RTU",
    baudRate: 9600,
    parity: "NONE",
    stopBits: 1,
    slaveId: 1,
    samplingIntervalMs: 2000,
    registerMap: [
      {
        key: "temperature",
        address: kind === "A" ? 0 : 49,
        functionCode: 3,
        dataType: "INT16",
        scale: 0.1,
        unit: "C",
        expectedMin: -40,
        expectedMax: 150,
      },
      {
        key: "current",
        address: 1,
        functionCode: 3,
        dataType: "UINT16",
        scale: 0.01,
        unit: "A",
      },
      {
        key: "rpm",
        address: 2,
        functionCode: 3,
        dataType: "UINT16",
        scale: 1,
        unit: "rpm",
      },
    ],
  };
}
export function readError(code: number): string {
  return (
    (
      {
        1: "Unsupported function",
        2: "Register address unavailable",
        3: "Invalid request value",
        4: "Slave device failure",
        224: "Wrong slave ID",
        225: "Unexpected function",
        226: "No Modbus response",
        227: "Invalid CRC",
      } as Record<number, string>
    )[code] ??
    `Modbus error 0x${code.toString(16).toUpperCase().padStart(2, "0")}`
  );
}
export const terminalOperation = (phase: string) =>
  [
    "completed",
    "applied",
    "rejected",
    "timed_out",
    "publish_failed",
    "catalog_error",
  ].includes(phase);
