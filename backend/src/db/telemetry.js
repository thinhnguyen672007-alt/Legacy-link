// db/telemetry.js
// Nhiem vu: ghi mot ban ghi telemetry DA QUA VALIDATION vao database.
//
// Diem quan trong nhat: ham nay IDEMPOTENT. Goi hai lan voi cung du lieu thi ket
// qua giong het goi mot lan. Nho vay khi QoS 1 gui lai cung mot message, ta
// khong sinh ra dong trung lap.
//
// Cach lam: de DATABASE tu chan bang rang buoc UNIQUE (device_id, ts), chu
// khong kiem tra trong code. Kiem tra trong code se sai khi co hai tien trinh
// cung ghi, hoac khi co race condition.

import { pool } from './pool.js';

export async function saveTelemetry({ deviceId, timestamp, metrics }) {
  const client = await pool.connect();

  try {
    // Hai lenh phai cung thanh cong hoac cung that bai. Neu ghi duoc lich su
    // ma khong cap nhat duoc trang thai thi dashboard se hien so cu.
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO telemetry (device_id, ts, metrics)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id, ts) DO NOTHING
       RETURNING id`,
      [deviceId, timestamp, JSON.stringify(metrics)],
    );

    // Trang thai hien tai van cap nhat ca khi ban ghi lich su la trung lap:
    // du lieu do van la du lieu moi nhat ta biet ve thiet bi.
    await client.query(
      `INSERT INTO machine_state (device_id, last_metrics, last_seen_at, updated_at)
       VALUES ($1, $2, now(), now())
       ON CONFLICT (device_id) DO UPDATE
         SET last_metrics = EXCLUDED.last_metrics,
             last_seen_at = EXCLUDED.last_seen_at,
             updated_at   = EXCLUDED.updated_at`,
      [deviceId, JSON.stringify(metrics)],
    );

    await client.query('COMMIT');

    return { inserted: inserted.rowCount > 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Luon tra ket noi ve pool, du thanh cong hay that bai. Quen buoc nay thi
    // pool can ket noi sau vai chuc lan loi.
    client.release();
  }
}
