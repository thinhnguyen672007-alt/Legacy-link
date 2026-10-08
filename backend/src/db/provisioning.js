import { pool } from './pool.js';

export async function saveAppliedConfig(config, machineType, gatewayId, requestId) {
  await pool.query(`INSERT INTO device
    (device_id, name, machine_type, protocol, baud_rate, parity, stop_bits,
     slave_id, sampling_interval_ms, applied_config, gateway_id, config_request_id)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (device_id) DO UPDATE SET name=EXCLUDED.name, machine_type=EXCLUDED.machine_type,
      protocol=EXCLUDED.protocol, baud_rate=EXCLUDED.baud_rate, parity=EXCLUDED.parity,
      stop_bits=EXCLUDED.stop_bits, slave_id=EXCLUDED.slave_id,
      sampling_interval_ms=EXCLUDED.sampling_interval_ms, applied_config=EXCLUDED.applied_config,
      gateway_id=EXCLUDED.gateway_id, config_request_id=EXCLUDED.config_request_id`,
  [config.deviceId, config.deviceName, machineType, config.protocol, config.baudRate,
    config.parity, config.stopBits, config.slaveId, config.samplingIntervalMs,
    JSON.stringify(config), gatewayId, requestId]);
}
