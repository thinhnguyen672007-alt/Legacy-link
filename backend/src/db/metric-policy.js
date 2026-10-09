// C11: dùng cấu hình đã áp dụng của máy; chỉ dùng register_map khi chưa commissioning.
// Chạy trên cùng connection/transaction với lưu mẫu để lỗi policy không tạo receipt giả.
import { IngestionError } from '../ingestion/errors.js';
export async function requireCatalogMetrics(client, event) {
  const { rows } = await client.query(`SELECT
    CASE WHEN d.applied_config IS NOT NULL THEN
      ARRAY(SELECT item->>'key' FROM jsonb_array_elements(d.applied_config->'registerMap') item)
    ELSE ARRAY(SELECT metric_key FROM register_map WHERE machine_type=d.machine_type) END AS keys
    FROM device d WHERE device_id=$1`, [event.deviceId]);
  const allowed = new Set(rows[0]?.keys ?? []);
  if (Object.keys(event.metrics).some(key => !allowed.has(key))) {
    throw new IngestionError('metric_not_configured');
  }
}
