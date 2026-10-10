// Parser thuần: chỉ nhận số đếm hữu hạn và danh tính ngắn, bỏ field lạ/credential.
import { validGatewayId, validateReadings } from '../control/validation.js';
function integer(value, maximum = 4294967295) {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error('Invalid delivery counter');
  return value;
}
function queue(data) {
  if (!data || typeof data !== 'object') throw new Error('Invalid delivery queue');
  const capacity = integer(data.capacity, 1024);
  if (capacity < 1) throw new Error('Invalid delivery capacity');
  const result = { capacity, pending: integer(data.pending, capacity), highWater: integer(data.highWater, capacity),
    committed: integer(data.committed), failedEnqueues: integer(data.failedEnqueues) };
  if (result.highWater < result.pending) throw new Error('Invalid high water');
  if (data.attempts !== undefined) result.attempts = integer(data.attempts);
  for (const [key, max] of [['headId', 79], ['deviceId', 63], ['rejection', 39]]) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== 'string' || data[key].length > max || /[\x00-\x1f]/.test(data[key])) throw new Error('Invalid delivery identity');
    result[key] = data[key];
  }
  return result;
}
export function parseDelivery(data) {
  if (!data || data.storage !== 'RAM' || typeof data.bootId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(data.bootId) || typeof data.clockReady !== 'boolean') throw new Error('Invalid delivery envelope');
  return { storage: 'RAM', bootId: data.bootId, clockReady: data.clockReady,
    freeHeapBytes: integer(data.freeHeapBytes), telemetry: queue(data.telemetry), alarm: queue(data.alarm) };
}
// Không gọi dữ liệu cũ là khỏe. Bộ đếm mất mẫu tính từ boot, không phải chỉ lần đọc này.
export function deliveryHealth(diagnostics, intervalMs, now = Date.now()) {
  if (!diagnostics?.delivery) return 'unknown';
  if (now - diagnostics.timestamp > Math.max(5000, intervalMs * 3)) return 'stale';
  const queues = [diagnostics.delivery.telemetry, diagnostics.delivery.alarm];
  if (queues.some(q => q.rejection)) return 'rejected';
  if (queues.some(q => q.failedEnqueues > 0)) return 'loss_observed';
  return queues.some(q => q.pending > 0) ? 'backlog' : 'healthy';
}
export function parseDiagnostics(deviceId, data) {
  if (!data || data.schemaVersion !== 1 || data.deviceId !== deviceId || !validGatewayId(data.gatewayId) ||
      !Number.isSafeInteger(data.timestamp) || data.timestamp < Date.UTC(2020, 0, 1) || data.timestamp > Date.now() + 60000 ||
      !Number.isInteger(data.samplingIntervalMs) || data.samplingIntervalMs < 100 || data.samplingIntervalMs > 86400000 ||
      typeof data.configRequestId !== 'string' || data.configRequestId.length > 64) throw new Error('Invalid diagnostics envelope');
  return { gatewayId: data.gatewayId, configRequestId: data.configRequestId,
    timestamp: data.timestamp, samplingIntervalMs: data.samplingIntervalMs,
    readings: validateReadings(data.readings),
    ...(data.delivery === undefined ? {} : { delivery: parseDelivery(data.delivery) }) };
}
