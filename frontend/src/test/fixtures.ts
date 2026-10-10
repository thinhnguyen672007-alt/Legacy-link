import type { Config, Machine, Operation } from "../api/schema";
export const config: Config = {
  deviceId: "TEST-01",
  deviceName: "Thiết bị mô phỏng kiểm thử",
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
  ],
};
export const machine: Machine = {
  deviceId: "TEST-01",
  name: "Thiết bị mô phỏng kiểm thử",
  gatewayId: "ABCDEF123456",
  gatewayOnline: true,
  dataFresh: true,
  readHealth: "healthy",
  deliveryHealth: "healthy",
  metrics: { temperature: 0 },
  samplingIntervalMs: 2000,
  lastMeasurementAt: new Date().toISOString(),
};
export function operation(patch: Partial<Operation> = {}): Operation {
  return {
    id: "test-operation",
    gatewayId: "ABCDEF123456",
    kind: "probe",
    phase: "completed",
    bootId: "boot-1",
    config,
    startedAt: Date.now() - 1000,
    finishedAt: Date.now(),
    readings: [
      {
        key: "temperature",
        address: 1,
        success: true,
        errorCode: 0,
        withinRange: true,
        value: 25,
      },
    ],
    ...patch,
  };
}
