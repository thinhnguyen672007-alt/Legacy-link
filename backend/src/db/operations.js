// PostgreSQL là nơi giữ lịch sử và khóa chung cho mọi HTTP process/đường gửi lệnh.
import { pool } from './pool.js';
import { ControlError } from '../control/validation.js';
export async function acquireLease(client, gatewayId, id, deadline) {
  const result = await client.query(
    `INSERT INTO gateway_command_lease(gateway_id,operation_id,expires_at) VALUES($1,$2,to_timestamp($3/1000.0))
 ON CONFLICT(gateway_id) DO UPDATE SET operation_id=EXCLUDED.operation_id,expires_at=EXCLUDED.expires_at
 WHERE gateway_command_lease.expires_at<=now() RETURNING operation_id`,
    [gatewayId, id, deadline]
  );
  if (!result.rowCount) throw new ControlError('Gateway đang có thao tác khác', 409);
}
// Một deviceId cũng chỉ thuộc một gateway; không chỉ khóa theo gatewayId.
// Dùng prefix để tên tài nguyên device không trùng MAC gateway 12 ký tự hex.
export async function acquireDeviceLease(client, deviceId, gatewayId, id, deadline) {
  await acquireLease(client, `device:${deviceId}`, id, deadline);
  const owner = (await client.query('SELECT gateway_id FROM device WHERE device_id=$1', [deviceId]))
    .rows[0];
  if (owner?.gateway_id && owner.gateway_id !== gatewayId)
    throw new ControlError(
      'Device ID đã thuộc gateway khác; cần quy trình chuyển thiết bị riêng',
      409
    );
}
export const operationStore = {
  async begin(op, deadline) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await acquireLease(client, op.gatewayId, op.id, deadline);
      await acquireDeviceLease(client, op.config.deviceId, op.gatewayId, op.id, deadline);
      await client.query('INSERT INTO control_operation(id,gateway_id,data) VALUES($1,$2,$3)', [
        op.id,
        op.gatewayId,
        op,
      ]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },
  async save(op) {
    // Phản hồi ở process khác có thể đến trước callback publish của process này.
    // Chỉ tiến trạng thái về phía trước; callback cũ không được ghi đè kết quả cuối.
    await pool.query(
      `UPDATE control_operation SET data=$2,updated_at=now() WHERE id=$1
    AND (data->>'phase' NOT IN ('completed','applied','rejected','timed_out','publish_failed','catalog_error'))
    AND NOT (data->>'phase'='saving_catalog' AND $2::jsonb->>'phase' IN ('sending','sent','received','timed_out'))
    AND NOT (data->>'phase'='received' AND $2::jsonb->>'phase' IN ('sending','sent'))`,
      [op.id, op]
    );
    // Timeout/publish failure còn chưa rõ kết quả: giữ khóa tới deadline, không mở sớm.
    if (['completed', 'applied', 'rejected', 'catalog_error'].includes(op.phase))
      await pool.query('DELETE FROM gateway_command_lease WHERE operation_id=$1', [op.id]);
  },
  async load(id) {
    return (
      (await pool.query('SELECT data FROM control_operation WHERE id=$1', [id])).rows[0]?.data ??
      null
    );
  },
  async list(gatewayId, limit = 50) {
    return (
      await pool.query(
        'SELECT data FROM control_operation WHERE ($1::text IS NULL OR gateway_id=$1) ORDER BY updated_at DESC,id DESC LIMIT $2',
        [gatewayId ?? null, limit]
      )
    ).rows.map((r) => r.data);
  },
};
