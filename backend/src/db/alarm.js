// C9: mỗi cảnh báo có ID riêng; cùng thời điểm không có nghĩa là cùng sự kiện.
import { storeEvent } from './ingestion.js';
import { fingerprint } from '../ingestion/identity.js';

export async function saveAlarm(event) {
  const { deviceId, timestamp, code, severity, value, metricKey } = event;
  return storeEvent('alarm', event, async (client, storageId) => {
    // Firmware cũ chưa có eventId: dùng dấu vân tay toàn bộ nội dung để nhận biết bản gửi lại.
    // Hai sự kiện khác nhau nhưng có nội dung giống hệt chỉ phân biệt được khi firmware thêm eventId.
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
