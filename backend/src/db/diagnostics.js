import { requireDevice } from './ingestion.js';
import { pool } from './pool.js';
import { parseDiagnostics } from '../validation/diagnostics.js';
export { parseDiagnostics } from '../validation/diagnostics.js';

export async function saveDiagnostics(deviceId, data) {
  const diagnostics = parseDiagnostics(deviceId, data);
  await requireDevice(pool, deviceId, diagnostics.gatewayId);
  await pool.query(`INSERT INTO machine_state (device_id, diagnostics, diagnostics_at, last_seen_at, updated_at)
    VALUES ($1,$2,$3,now(),now()) ON CONFLICT (device_id) DO UPDATE
    SET diagnostics=EXCLUDED.diagnostics, diagnostics_at=EXCLUDED.diagnostics_at,
        last_seen_at=EXCLUDED.last_seen_at, updated_at=EXCLUDED.updated_at
    WHERE machine_state.diagnostics_at IS NULL OR machine_state.diagnostics_at < EXCLUDED.diagnostics_at`,
  [deviceId, JSON.stringify(diagnostics), data.timestamp]);
}
