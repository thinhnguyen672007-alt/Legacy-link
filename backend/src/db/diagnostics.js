import { pool } from './pool.js';
import { validGatewayId, validateReadings } from '../control/validation.js';

export function parseDiagnostics(deviceId, data) {
  if (!data || data.schemaVersion !== 1 || data.deviceId !== deviceId || !validGatewayId(data.gatewayId) ||
      !Number.isSafeInteger(data.timestamp) || data.timestamp < Date.UTC(2020, 0, 1) || data.timestamp > Date.now() + 60000 ||
      !Number.isInteger(data.samplingIntervalMs) || data.samplingIntervalMs < 100 || data.samplingIntervalMs > 86400000 ||
      typeof data.configRequestId !== 'string' || data.configRequestId.length > 64) throw new Error('Invalid diagnostics envelope');
  return { gatewayId: data.gatewayId, configRequestId: data.configRequestId,
    timestamp: data.timestamp, samplingIntervalMs: data.samplingIntervalMs,
    readings: validateReadings(data.readings) };
}
export async function saveDiagnostics(deviceId, data) {
  const diagnostics = parseDiagnostics(deviceId, data);
  await pool.query(`INSERT INTO machine_state (device_id, diagnostics, diagnostics_at, last_seen_at, updated_at)
    VALUES ($1,$2,$3,now(),now()) ON CONFLICT (device_id) DO UPDATE
    SET diagnostics=EXCLUDED.diagnostics, diagnostics_at=EXCLUDED.diagnostics_at,
        last_seen_at=EXCLUDED.last_seen_at, updated_at=EXCLUDED.updated_at
    WHERE machine_state.diagnostics_at IS NULL OR machine_state.diagnostics_at < EXCLUDED.diagnostics_at`,
  [deviceId, JSON.stringify(diagnostics), data.timestamp]);
}
