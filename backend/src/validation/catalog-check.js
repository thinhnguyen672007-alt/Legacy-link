// C11: kiểm tra tên metric trong catalog khi khởi động; không có allowlist viết cứng.
import { pool } from '../db/pool.js';
import { validMetricKey } from './telemetry.js';
export async function checkCatalogMetrics() {
  const { rows } = await pool.query('SELECT DISTINCT metric_key FROM register_map');
  const missing = rows.map(row => row.metric_key).filter(key => !validMetricKey(key));
  if (missing.length) console.warn('[CATALOG] Tên metric không hợp lệ:', missing.join(', '));
  return { ok: missing.length === 0, missing };
}
