// Kiểm tra ID của mẫu/cảnh báo và tạo dấu vân tay nội dung. Cùng ID phải luôn đi kèm cùng dữ liệu.
import { createHash } from 'node:crypto';

export function checkIdentity(payload, errors, kind) {
  const field = kind === 'alarm' ? 'eventId' : 'messageId';
  const present = payload[field] !== undefined || payload.gatewayId !== undefined;
  if (present) {
    if (typeof payload[field] !== 'string' || !/^[A-Za-z0-9:_-]{1,128}$/.test(payload[field]))
      errors.push(`${field} must contain 1..128 letters, digits, colon, underscore or hyphen`);
    if (typeof payload.gatewayId !== 'string' || !/^[A-F0-9]{12}$/.test(payload.gatewayId))
      errors.push('gatewayId must contain 12 uppercase hexadecimal characters');
  }
  if (kind === 'alarm' && (present || payload.metricKey !== undefined) &&
      (typeof payload.metricKey !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(payload.metricKey)))
    errors.push('metricKey is required for identified alarms (1..64 characters)');
  return present ? { gatewayId: payload.gatewayId, [field]: payload[field] } : {};
}

// Sắp xếp tên trường trước khi băm: đổi thứ tự các key JSON không làm đổi dấu vân tay.
function canonical(value) {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
// Hàm băm tạo dấu vân tay để phát hiện cùng ID nhưng nội dung bị thay đổi.
export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
