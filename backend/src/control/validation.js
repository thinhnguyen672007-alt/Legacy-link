import { ALLOWED_METRICS } from '../validation/telemetry.js';

export class ControlError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const fail = message => { throw new ControlError(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const text = (value, max) => typeof value === 'string' && !value.includes('\0') && Buffer.byteLength(value) <= max;
export const validGatewayId = id => typeof id === 'string' && /^[A-F0-9]{12}$/.test(id);

// Normalize once, then compare this exact configuration with the successful probe.
export function validateConfig(value) {
  if (!object(value)) fail('config must be an object');
  if (!text(value.deviceId, 31) || !/^[A-Za-z0-9_-]+$/.test(value.deviceId)) fail('Use 1–31 letters, digits, hyphens or underscores for device ID');
  if (!text(value.deviceName, 47) || !value.deviceName.trim()) fail('Machine name is required (maximum 47 UTF-8 bytes)');
  const cfg = {
    deviceId: value.deviceId, deviceName: value.deviceName,
    protocol: value.protocol ?? 'MODBUS_RTU', baudRate: value.baudRate ?? 9600,
    parity: value.parity ?? 'NONE', stopBits: value.stopBits ?? 1,
    slaveId: value.slaveId ?? 1, samplingIntervalMs: value.samplingIntervalMs ?? 2000,
  };
  if (cfg.protocol !== 'MODBUS_RTU' || !integer(cfg.baudRate, 300, 2000000) ||
      !['NONE', 'EVEN', 'ODD'].includes(cfg.parity) || ![1, 2].includes(cfg.stopBits) ||
      !integer(cfg.slaveId, 1, 247) || !integer(cfg.samplingIntervalMs, 100, 86400000)) fail('Invalid Modbus communication settings');
  if (!Array.isArray(value.registerMap) || value.registerMap.length < 1 || value.registerMap.length > 16) fail('Provide 1–16 registers');
  const seen = new Set();
  cfg.registerMap = value.registerMap.map(row => {
    if (!object(row) || !ALLOWED_METRICS.has(row.key) || seen.has(row.key)) fail('Choose distinct supported metrics');
    seen.add(row.key);
    const reg = { key: row.key, address: row.address, functionCode: row.functionCode ?? 3,
      dataType: row.dataType ?? 'INT16', scale: row.scale ?? 1, unit: row.unit ?? '',
      wordOrder: row.wordOrder ?? 'HIGH_FIRST' };
    if (!integer(reg.address, 0, reg.dataType === 'UINT32' ? 65534 : 65535) ||
        ![3, 4].includes(reg.functionCode) || !['INT16', 'UINT16', 'UINT32'].includes(reg.dataType) ||
        !finite(reg.scale) || Math.abs(reg.scale) > 3.4028234e38 || !text(reg.unit, 7) ||
        !['HIGH_FIRST', 'LOW_FIRST'].includes(reg.wordOrder)) fail(`Invalid register settings for ${reg.key}`);
    for (const bound of ['expectedMin', 'expectedMax']) {
      if (row[bound] != null) {
        if (!finite(row[bound])) fail(`${reg.key}: expected range must contain finite numbers`);
        reg[bound] = row[bound];
      }
    }
    if (reg.expectedMin != null && reg.expectedMax != null && reg.expectedMin > reg.expectedMax) fail(`${reg.key}: minimum exceeds maximum`);
    if (row.alarm != null) {
      const alarm = row.alarm;
      if (!object(alarm) || !finite(alarm.threshold) || Math.abs(alarm.threshold) > 3.4028234e38 ||
          !finite(alarm.hysteresis ?? 0) || (alarm.hysteresis ?? 0) < 0 ||
          !['OVERHEAT', 'OVERCURRENT', 'OVERSPEED', 'VIBRATION'].includes(alarm.code) ||
          !['low', 'medium', 'high', 'critical'].includes(alarm.severity)) fail(`${reg.key}: invalid alarm`);
      reg.alarm = { threshold: alarm.threshold, hysteresis: alarm.hysteresis ?? 0, code: alarm.code, severity: alarm.severity };
      if (alarm.criticalThreshold != null) {
        if (!finite(alarm.criticalThreshold) || Math.abs(alarm.criticalThreshold) > 3.4028234e38 ||
            alarm.severity !== 'high' || alarm.criticalThreshold <= alarm.threshold)
          fail(`${reg.key}: invalid critical alarm threshold`);
        reg.alarm.criticalThreshold = alarm.criticalThreshold;
      }
    }
    return reg;
  });
  if (Buffer.byteLength(JSON.stringify({ ...cfg, requestId: 'x'.repeat(36), expectedBootId: 'x'.repeat(16), expiresAt: 9999999999999, expectedConfigRequestId: 'x'.repeat(64) })) > 4095) fail('Configuration exceeds the ESP32 4095-byte limit');
  return cfg;
}

export function validateReadings(rows, config) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 16) fail('Invalid read report');
  if (config && rows.length !== config.registerMap.length) fail('Incomplete probe report');
  const seen = new Set();
  return rows.map((row, index) => {
    if (!object(row) || !ALLOWED_METRICS.has(row.key) || seen.has(row.key) ||
        !integer(row.address, 0, 65535) || typeof row.success !== 'boolean' ||
        !integer(row.errorCode, 0, 255) || !integer(row.sampledAt, Date.UTC(2020, 0, 1), Date.now() + 60000)) fail('Malformed register result');
    seen.add(row.key);
    const reg = config?.registerMap[index];
    if (reg && (row.key !== reg.key || row.address !== reg.address)) fail('Probe response does not match requested registers');
    if (row.success && (row.errorCode !== 0 || !finite(row.rawValue) || !finite(row.value) ||
        !Array.isArray(row.rawWords) || ![1, 2].includes(row.rawWords.length) ||
        row.rawWords.some(word => !integer(word, 0, 65535)))) fail('Malformed successful reading');
    if (!row.success && row.errorCode === 0) fail('Failed reading needs an error code');
    const result = { key: row.key, address: row.address, success: row.success,
      errorCode: row.errorCode, sampledAt: row.sampledAt };
    if (row.success) Object.assign(result, { rawValue: row.rawValue, value: row.value, rawWords: row.rawWords });
    if (reg && row.success) result.withinRange =
      (reg.expectedMin == null || row.value >= reg.expectedMin) &&
      (reg.expectedMax == null || row.value <= reg.expectedMax);
    return result;
  });
}
