import { pool } from './pool.js';
import { fingerprint } from '../ingestion/identity.js';
import { getCatalog } from './catalog.js';
import { validateConfig, ControlError } from '../control/validation.js';

export async function saveAppliedConfig(config, machineType, gatewayId, requestId) {
  config = validateConfig(config);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Khóa lease trong cùng transaction để recovery không chạy đua với lệnh mới.
    await client.query(
      'SELECT operation_id FROM gateway_command_lease WHERE gateway_id=$1 FOR UPDATE',
      [gatewayId]
    );
    const stale = await client.query(
      `SELECT 1 FROM control_operation newer JOIN control_operation original ON original.id=$2
    WHERE newer.gateway_id=$1 AND (newer.data->>'startedAt')::numeric>(original.data->>'startedAt')::numeric LIMIT 1`,
      [gatewayId, requestId]
    );
    if (stale.rowCount) throw new Error('Không phục hồi catalog cũ sau một thao tác mới');
    // Cả trường hợp device chưa có dòng cũng cần khóa để hai gateway không cùng tạo.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['device:' + config.deviceId]);
    const previous = (
      await client.query('SELECT gateway_id FROM device WHERE device_id=$1 FOR UPDATE', [
        config.deviceId,
      ])
    ).rows[0];
    if (previous?.gateway_id && previous.gateway_id !== gatewayId)
      throw new ControlError('Device ID đã thuộc gateway khác', 409);
    if (previous) {
      const old = await getCatalog(config.deviceId, client);
      if (old && previous.gateway_id && fingerprint(old) !== fingerprint(config))
        await client.query(
          'INSERT INTO device_config_history(device_id,gateway_id,config) VALUES($1,$2,$3)',
          [config.deviceId, previous.gateway_id, old]
        );
    }
    await client.query(
      `INSERT INTO device
    (device_id, name, machine_type, protocol, baud_rate, parity, stop_bits,
     slave_id, sampling_interval_ms, applied_config, gateway_id, config_request_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (device_id) DO UPDATE SET name=EXCLUDED.name, machine_type=EXCLUDED.machine_type,
      protocol=EXCLUDED.protocol, baud_rate=EXCLUDED.baud_rate, parity=EXCLUDED.parity,
      stop_bits=EXCLUDED.stop_bits, slave_id=EXCLUDED.slave_id,
      sampling_interval_ms=EXCLUDED.sampling_interval_ms, applied_config=EXCLUDED.applied_config,
      gateway_id=EXCLUDED.gateway_id, config_request_id=EXCLUDED.config_request_id`,
      [
        config.deviceId,
        config.deviceName,
        machineType,
        config.protocol,
        config.baudRate,
        config.parity,
        config.stopBits,
        config.slaveId,
        config.samplingIntervalMs,
        JSON.stringify(config),
        gatewayId,
        requestId,
      ]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
