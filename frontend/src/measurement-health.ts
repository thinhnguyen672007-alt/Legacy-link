import type { Machine } from "./model";
import { readError } from "./commissioning-model";
export function measurementHealth(
  machine: Machine,
  key: string,
  now: number,
  unverified = false,
) {
  if (unverified)
    return { state: "unknown", label: "Snapshot · connection unverified" };
  if (!machine.online)
    return { state: "stale", label: "Gateway offline · last stored value" };
  const diagnostics = machine.diagnostics;
  if (
    machine.configRequestId &&
    diagnostics?.configRequestId !== machine.configRequestId
  )
    return {
      state: "unknown",
      label: "Waiting for this configuration’s readings",
    };
  const reading = diagnostics?.readings.find((row) => row.key === key);
  if (diagnostics && !reading)
    return { state: "unknown", label: "Not present in the current scan" };
  const sampledAt =
    reading?.sampledAt ??
    (machine.lastTelemetryAt ? Date.parse(machine.lastTelemetryAt) : NaN);
  if (reading && !reading.success)
    return {
      state: "error",
      label: `${readError(reading.errorCode)} · last stored value`,
    };
  if (!Number.isFinite(sampledAt))
    return { state: "unknown", label: "Measurement time unavailable" };
  const age = now - sampledAt;
  const timeout = Math.max(
    5000,
    3 * (diagnostics?.samplingIntervalMs ?? machine.samplingIntervalMs ?? 2000),
  );
  if (age < -5000)
    return { state: "unknown", label: "Check measurement timestamp" };
  if (age > timeout)
    return {
      state: "stale",
      label: `Data not updating · ${Math.floor(age / 1000)}s old`,
    };
  return {
    state: "fresh",
    label: `Read ${Math.max(0, Math.floor(age / 1000))}s ago`,
  };
}
