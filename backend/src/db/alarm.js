import { storeEvent } from './ingestion.js';
import { fingerprint } from '../ingestion/identity.js';

export async function saveAlarm(event) {
  const { deviceId, timestamp, code, severity, value, metricKey } = event;
  return storeEvent('alarm', event, async (client, storageId) => {
    // Legacy firmware has no event ID: identical content is the best available
    // identity. Distinct same-content occurrences require firmware eventId.
    const eventId = storageId ?? `legacy:${fingerprint({ deviceId, timestamp, code, severity,
      value: value ?? null, metricKey: metricKey ?? null })}`;
    const old = await client.query(`SELECT id FROM alarms WHERE event_id IS NULL
      AND device_id=$1 AND ts=$2 AND code=$3 AND severity=$4
      AND value IS NOT DISTINCT FROM $5::double precision
      AND metric_key IS NOT DISTINCT FROM $6::text LIMIT 1`,
    [deviceId, timestamp, code, severity, value ?? null, metricKey ?? null]);
    if (!storageId && old.rowCount) return { inserted: false };
    const result = await client.query(`INSERT INTO alarms
      (device_id, ts, code, severity, value, event_id, metric_key)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (device_id, event_id) DO NOTHING RETURNING id`,
    [deviceId, timestamp, code, severity, value ?? null, eventId, metricKey ?? null]);
    return { inserted: result.rowCount > 0 };
  });
}
