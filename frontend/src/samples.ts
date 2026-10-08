import type { Catalog, Machine } from "./model";
// Explicit interface fixtures, never used as a fallback for failed live requests.
export function sampleMachines(now: number): Machine[] {
  return [
    {
      deviceId: "sample-cnc-01",
      name: "CNC 01",
      machineType: "CNC",
      online: true,
      lastSeenAt: new Date(now).toISOString(),
      lastTelemetryAt: new Date(now).toISOString(),
      metrics: { temperature: 25, current: 1.23, rpm: 1500 },
    },
    {
      deviceId: "sample-cnc-02",
      name: "CNC 02",
      machineType: "CNC",
      online: false,
      lastSeenAt: new Date(now - 180_000).toISOString(),
      lastTelemetryAt: new Date(now - 180_000).toISOString(),
      metrics: { temperature: 32.4, current: 0, rpm: 0 },
    },
    {
      deviceId: "sample-cnc-03",
      name: "CNC 03",
      machineType: "CNC",
      online: false,
      lastSeenAt: null,
      metrics: null,
    },
  ];
}
export function sampleCatalog(id: string): Catalog {
  return {
    deviceId: id,
    deviceName: `CNC ${id.slice(-2)}`,
    protocol: "MODBUS_RTU",
    baudRate: 9600,
    parity: "NONE",
    stopBits: 1,
    slaveId: 1,
    samplingIntervalMs: 1000,
    registerMap: [
      {
        key: "temperature",
        address: 0,
        functionCode: 3,
        dataType: "INT16",
        scale: 0.1,
        unit: "C",
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
