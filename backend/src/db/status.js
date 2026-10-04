import { pool } from './pool.js';

// Hàm này dùng để ghi một bản ghi status DA QUA VALIDATION vào database.
// Lưu ý: hàm này IDEMPOTENT.
export async function saveStatus({ deviceId, timestamp, status }) {
  const client = await pool.connect();

  try {
    // Hai lệnh phải cùng thành công hoặc cùng thất bại.
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO machine_state (device_id, ts, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id, ts) DO NOTHING
       RETURNING id`,
      [deviceId, timestamp, JSON.stringify(status)],
    );

    await client.query(
      `INSERT INTO machine_state (device_id, online, last_status, last_seen_at, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (device_id) DO UPDATE
         SET online = EXCLUDED.online,
             last_seen_at = EXCLUDED.last_seen_at,
             updated_at   = EXCLUDED.updated_at`,
      [deviceId, status.online, JSON.stringify(status)],
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