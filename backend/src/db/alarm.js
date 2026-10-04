import { pool } from './pool.js';

export async function saveAlarm({ deviceId, timestamp, alarm }) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO alarm (device_id, ts, alarm)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (device_id, ts) DO NOTHING
       RETURNING id`,
      [deviceId, timestamp, JSON.stringify(alarm)],
    );

    await client.query(
      `INSERT INTO machine_state (device_id, online, last_alarm, last_seen_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (device_id) DO UPDATE
         SET online = EXCLUDED.online,
             last_seen_at = EXCLUDED.last_seen_at,
             updated_at   = EXCLUDED.updated_at`,
      [deviceId, alarm.online, JSON.stringify(alarm)],
    );

    await client.query('COMMIT');

    return { inserted: inserted.rowCount > 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}