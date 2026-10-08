import { describe, it, expect } from "vitest";
import { measurementHealth } from "../src/measurement-health";
import { parseMachines } from "../src/model";
import type { Machine } from "../src/model";
const now = Date.now();
const machine: Machine = {
  deviceId: "A",
  name: "A",
  machineType: "CNC",
  online: true,
  lastSeenAt: new Date(now).toISOString(),
  metrics: { temperature: 25 },
  lastTelemetryAt: new Date(now - 60000).toISOString(),
  samplingIntervalMs: 2000,
};
describe("measurement freshness is independent of gateway heartbeat", () => {
  it("accepts merged gateway state and uses measurement time instead of server receipt", () => {
    const { online: _online, ...row } = machine;
    const parsed = parseMachines([{ ...row, gatewayOnline: true,
      lastTelemetryAt: new Date(now).toISOString(),
      lastMeasurementAt: new Date(now - 60000).toISOString() }])[0];
    expect(parsed.online).toBe(true);
    expect(measurementHealth(parsed, "temperature", now).state).toBe("stale");
    const unknown = parseMachines([{ ...row, gatewayOnline: true,
      lastTelemetryAt: new Date(now).toISOString(), lastMeasurementAt: null }])[0];
    expect(measurementHealth(unknown, "temperature", now).state).toBe("unknown");
  });
  it("fresh heartbeat cannot revive an old measurement", () => {
    expect(measurementHealth(machine, "temperature", now).state).toBe("stale");
  });
  it("never substitutes gateway contact for missing measurement timestamps", () => {
    expect(
      measurementHealth(
        { ...machine, lastTelemetryAt: null },
        "temperature",
        now,
      ).state,
    ).toBe("unknown");
  });
  it("shows a read failure immediately and recovers after a successful scan", () => {
    const diagnostics = {
      timestamp: now,
      configRequestId: "config-a",
      samplingIntervalMs: 2000,
      readings: [
        { key: "temperature", success: false, errorCode: 226, sampledAt: now },
      ],
    };
    const failed = { ...machine, diagnostics, configRequestId: "config-a" };
    expect(measurementHealth(failed, "temperature", now).label).toContain(
      "No Modbus response",
    );
    diagnostics.readings[0] = {
      ...diagnostics.readings[0],
      success: true,
      errorCode: 0,
    };
    expect(measurementHealth(failed, "temperature", now).state).toBe("fresh");
    expect(measurementHealth(failed, "temperature", now + 7000).state).toBe(
      "stale",
    );
  });
  it("does not confuse a previous config with the active one", () => {
    expect(
      measurementHealth(
        { ...machine, configRequestId: "new" },
        "temperature",
        now,
      ).label,
    ).toContain("Waiting for this configuration");
  });
  it("preserves negative diagnostic values from the API", () => {
    const parsed = parseMachines([
      {
        ...machine,
        diagnostics: {
          timestamp: now,
          configRequestId: "a",
          samplingIntervalMs: 2000,
          readings: [
            {
              key: "temperature",
              success: true,
              errorCode: 0,
              sampledAt: now,
              value: -18,
            },
          ],
        },
      },
    ]);
    expect(parsed[0].diagnostics?.readings[0].value).toBe(-18);
  });
});
