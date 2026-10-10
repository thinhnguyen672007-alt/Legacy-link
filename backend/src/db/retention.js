// Mỗi lần chỉ xóa tối đa batch dòng/bảng để không khóa DB quá lâu. Không xóa receipt.
import { pool } from './pool.js';
export async function runRetention({
  telemetryDays = 30,
  alarmDays = 90,
  operationDays = 30,
  batch = 5000,
  dryRun = true,
} = {}) {
  for (const value of [telemetryDays, alarmDays, operationDays])
    if (!Number.isInteger(value) || value < 7 || value > 3650)
      throw new Error('Retention phải là 7..3650 ngày');
  if (!Number.isInteger(batch) || batch < 1 || batch > 10000)
    throw new Error('Batch phải là 1..10000');
  const policies = [
    ['telemetry', 'received_at', telemetryDays],
    ['alarms', 'received_at', alarmDays],
    ['control_operation', 'updated_at', operationDays],
    ['device_config_history', 'retired_at', 7],
  ];
  const result = { dryRun, receipts: 'kept', tables: {} };
  for (const [table, column, days] of policies) {
    // Tên bảng/cột lấy từ hằng số bên trên, không lấy từ request.
    const extra =
      table === 'alarms'
        ? ' AND acknowledged_at IS NOT NULL'
        : table === 'control_operation'
          ? " AND data->>'phase' IN ('completed','applied','rejected','timed_out','publish_failed','catalog_error')"
          : '';
    const rows = await pool.query(
      dryRun
        ? `SELECT count(*)::int n FROM (SELECT 1 FROM ${table} WHERE ${column}<now()-$1*interval '1 day' ${extra} LIMIT $2) x`
        : `WITH doomed AS (SELECT ctid FROM ${table} WHERE ${column}<now()-$1*interval '1 day' ${extra} LIMIT $2 FOR UPDATE SKIP LOCKED), deleted AS (DELETE FROM ${table} WHERE ctid IN(SELECT ctid FROM doomed) RETURNING 1) SELECT count(*)::int n FROM deleted`,
      [days, batch]
    );
    result.tables[table] = rows.rows[0].n;
  }
  return result;
}
