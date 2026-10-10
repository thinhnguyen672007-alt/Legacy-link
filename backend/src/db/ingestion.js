// C7/C8: kiểm tra thiết bị đã đăng ký, chống trùng bằng biên nhận và lưu dữ liệu trong một giao dịch.
import { pool } from './pool.js';
import { fingerprint } from '../ingestion/identity.js';

import { IngestionError } from '../ingestion/errors.js';

// Thiết bị phải có trong registry; bản tin có gatewayId còn phải khớp gateway đã đăng ký.
export async function requireDevice(client, deviceId, gatewayId) {
  const result = await client.query('SELECT gateway_id FROM device WHERE device_id=$1 FOR SHARE', [deviceId]);
  if (!result.rowCount) throw new IngestionError('unknown_device');
  if (gatewayId && result.rows[0].gateway_id !== gatewayId) throw new IngestionError('gateway_mismatch');
}

// Biên nhận chống trùng và số đo nằm trong cùng transaction (giao dịch database).
// Cả hai cùng được lưu hoặc cùng bị hủy; không thể có biên nhận cho một mẫu chưa lưu.
export async function storeEvent(kind, event, write) {
  const client = await pool.connect();
  const id = kind === 'alarm' ? event.eventId : event.messageId;
  const storageId = id ? `${event.gatewayId}:${id}` : null;
  try {
    // BEGIN mở giao dịch: lỗi ở bất kỳ bước nào thì ROLLBACK hủy toàn bộ thay đổi.
    await client.query('BEGIN');
    await requireDevice(client, event.deviceId, event.gatewayId);
    if (storageId) {
      const hash = fingerprint(event);
      const receipt = await client.query(`INSERT INTO ingestion_receipt
        (device_id, kind, message_id, payload_hash) VALUES ($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING message_id`, [event.deviceId, kind, storageId, hash]);
      // Không thêm được biên nhận tức ID đã có: so nội dung trước khi coi là bản gửi lại.
      if (!receipt.rowCount) {
        const previous = await client.query(`SELECT payload_hash FROM ingestion_receipt
          WHERE device_id=$1 AND kind=$2 AND message_id=$3`, [event.deviceId, kind, storageId]);
        if (previous.rows[0]?.payload_hash !== hash) throw new IngestionError('identity_conflict');
        // Bản trùng đã lưu trước đó: xác nhận giao dịch xong rồi trả kết quả cho handler.
        await client.query('COMMIT');
        return { inserted: false };
      }
    }
    const result = await write(client, storageId);
    // COMMIT là mốc lưu xong; handler chỉ được gửi ACK committed sau mốc này.
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* Nếu rollback cũng lỗi, vẫn giữ lỗi ban đầu để biết nguyên nhân chính. */ }
    throw error;
  } finally { client.release(); }
}
