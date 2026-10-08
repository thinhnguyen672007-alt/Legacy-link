import { pool } from './pool.js';
import { fingerprint } from '../ingestion/identity.js';

import { IngestionError } from '../ingestion/errors.js';

export async function requireDevice(client, deviceId, gatewayId) {
  const result = await client.query('SELECT gateway_id FROM device WHERE device_id=$1 FOR SHARE', [deviceId]);
  if (!result.rowCount) throw new IngestionError('unknown_device');
  if (gatewayId && result.rows[0].gateway_id !== gatewayId) throw new IngestionError('gateway_mismatch');
}

// The receipt and event share a transaction. A receipt is never committed alone.
export async function storeEvent(kind, event, write) {
  const client = await pool.connect();
  const id = kind === 'alarm' ? event.eventId : event.messageId;
  const storageId = id ? `${event.gatewayId}:${id}` : null;
  try {
    await client.query('BEGIN');
    await requireDevice(client, event.deviceId, event.gatewayId);
    if (storageId) {
      const hash = fingerprint(event);
      const receipt = await client.query(`INSERT INTO ingestion_receipt
        (device_id, kind, message_id, payload_hash) VALUES ($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING message_id`, [event.deviceId, kind, storageId, hash]);
      if (!receipt.rowCount) {
        const previous = await client.query(`SELECT payload_hash FROM ingestion_receipt
          WHERE device_id=$1 AND kind=$2 AND message_id=$3`, [event.deviceId, kind, storageId]);
        if (previous.rows[0]?.payload_hash !== hash) throw new IngestionError('identity_conflict');
        await client.query('COMMIT');
        return { inserted: false };
      }
    }
    const result = await write(client, storageId);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally { client.release(); }
}
