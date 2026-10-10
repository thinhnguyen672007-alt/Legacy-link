// C11: dùng cấu hình đã áp dụng của máy; chỉ dùng register_map khi chưa commissioning.
// Chạy trên cùng connection/transaction với lưu mẫu để lỗi policy không tạo receipt giả.
import { IngestionError } from '../ingestion/errors.js';
export async function requireCatalogMetrics(client, event) {
  const { rows } = await client.query(
    `SELECT
    CASE WHEN d.applied_config IS NOT NULL THEN
      ARRAY(SELECT item->>'key' FROM jsonb_array_elements(d.applied_config->'registerMap') item)
    ELSE ARRAY(SELECT metric_key FROM register_map WHERE machine_type=d.machine_type) END AS keys
    FROM device d WHERE device_id=$1`,
    [event.deviceId]
  );
  const allowed = new Set(rows[0]?.keys ?? []);
  if (Object.keys(event.metrics).some((key) => !allowed.has(key))) {
    // Tương thích firmware v1 chưa có configVersion: chỉ cho replay có ID, cùng gateway,
    // timestamp trước lúc cấu hình cũ nghỉ dùng, và history chưa quá 7 ngày.
    const history =
      event.messageId && event.gatewayId
        ? await client.query(
            `SELECT config FROM device_config_history
      WHERE device_id=$1 AND gateway_id=$2 AND retired_at>=now()-interval '7 days'
      AND $3::bigint<=extract(epoch FROM retired_at)*1000 ORDER BY retired_at DESC LIMIT 100`,
            [event.deviceId, event.gatewayId, event.timestamp]
          )
        : { rows: [] };
    const matched = history.rows.some((row) => {
      const keys = new Set(row.config.registerMap.map((reg) => reg.key));
      return Object.keys(event.metrics).every((key) => keys.has(key));
    });
    if (!matched) throw new IngestionError('metric_not_configured');
  }
}
