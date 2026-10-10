// Đọc lịch sử số đo và cảnh báo để frontend hiển thị. Đây là đường đọc, tách khỏi đường ESP32 gửi dữ liệu.
import { pool } from './pool.js';
// Truy vấn lấy dư 1 dòng: nếu có dòng dư thì còn trang sau và cần trả nextCursor.
function page(rows, { limit, from, to }, map) {
  const more = rows.length > limit,
    selected = rows.slice(0, limit),
    last = selected.at(-1);
  return {
    items: selected.map(map),
    from,
    to,
    nextCursor: more
      ? Buffer.from(JSON.stringify({ ts: Number(last.ts), id: String(last.id) })).toString(
          'base64url'
        )
      : null,
  };
}
// ID database trả dạng chuỗi để JavaScript không làm mất chính xác khi số quá lớn.
export const toAlarm = (row) => ({
  id: String(row.id),
  deviceId: row.device_id,
  timestamp: Number(row.ts),
  receivedAt: row.received_at,
  code: row.code,
  severity: row.severity,
  value: row.value,
  metricKey: row.metric_key,
  eventId: row.event_id?.startsWith('legacy:') ? null : (row.event_id?.slice(13) ?? null),
  acknowledgedAt: row.acknowledged_at,
});
// Xếp theo thời điểm rồi ID để hai mẫu cùng thời điểm vẫn phân trang rõ ràng.
// $1, $2... là tham số riêng của SQL: không nối trực tiếp dữ liệu người dùng vào câu lệnh.
export async function telemetryHistory(deviceId, options) {
  const { from, to, limit, cursor } = options;
  const result = await pool.query(
    `SELECT id,device_id,ts,received_at,metrics,message_id FROM telemetry
    WHERE device_id=$1 AND ts BETWEEN $2 AND $3
    AND ($4::bigint IS NULL OR (ts,id)<($4::bigint,$5::bigint))
    ORDER BY ts DESC,id DESC LIMIT $6`,
    [deviceId, from, to, cursor?.ts ?? null, cursor?.id ?? null, limit + 1]
  );
  return page(result.rows, options, (row) => ({
    id: String(row.id),
    deviceId: row.device_id,
    timestamp: Number(row.ts),
    receivedAt: row.received_at,
    deliveryDelayMs: Math.max(0, new Date(row.received_at).getTime() - Number(row.ts)),
    delayed: new Date(row.received_at).getTime() - Number(row.ts) > 5000,
    metrics: row.metrics,
    messageId: row.message_id?.slice(13) ?? null,
  }));
}
export async function listAlarms(options) {
  const { deviceId, severity, acknowledged, from, to, limit, cursor } = options;
  const result = await pool.query(
    `SELECT * FROM alarms WHERE ts BETWEEN $1 AND $2
    AND ($3::text IS NULL OR device_id=$3) AND ($4::text IS NULL OR severity=$4)
    AND ($5::boolean IS NULL OR (acknowledged_at IS NOT NULL)=$5)
    AND ($6::bigint IS NULL OR (ts,id)<($6::bigint,$7::bigint))
    ORDER BY ts DESC,id DESC LIMIT $8`,
    [
      from,
      to,
      deviceId ?? null,
      severity ?? null,
      acknowledged ?? null,
      cursor?.ts ?? null,
      cursor?.id ?? null,
      limit + 1,
    ]
  );
  return page(result.rows, options, toAlarm);
}
// Đây là người dùng xác nhận đã xem cảnh báo; không phải ACK gửi ESP32.
// COALESCE giữ lần xác nhận đầu tiên, bấm lại không đổi thời điểm đó.
export async function acknowledgeAlarm(id) {
  const result = await pool.query(
    `UPDATE alarms SET acknowledged_at=COALESCE(acknowledged_at,now()) WHERE id=$1 RETURNING *`,
    [id]
  );
  return result.rowCount ? toAlarm(result.rows[0]) : null;
}
