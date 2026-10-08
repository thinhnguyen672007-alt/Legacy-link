import { ControlError } from '../control/validation.js';
export function integer(value, name, fallback, min, max) {
  if (value === null || value === undefined) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max)
    throw new ControlError(`${name} must be an integer between ${min} and ${max}`);
  return Number(value);
}
export function deviceId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,31}$/.test(value)) throw new ControlError('Invalid deviceId');
  return value;
}
export function rowId(value) {
  if (!/^[1-9][0-9]{0,18}$/.test(value) || BigInt(value) > 9223372036854775807n) throw new ControlError('Invalid record ID');
  return value;
}
export function pageParams(params) {
  const to = integer(params.get('to'), 'to', Date.now(), 0, 8640000000000000);
  const from = integer(params.get('from'), 'from', Math.max(0, to - 86400000), 0, to);
  if (to - from > 31 * 86400000) throw new ControlError('Time range cannot exceed 31 days');
  const limit = integer(params.get('limit'), 'limit', 100, 1, 500);
  let cursor = null;
  if (params.has('cursor')) {
    try {
      const raw=params.get('cursor');
      if (!/^[A-Za-z0-9_-]{1,160}$/.test(raw)) throw new Error();
      cursor=JSON.parse(Buffer.from(raw,'base64url').toString());
      if (!cursor || !Number.isSafeInteger(cursor.ts) || cursor.ts < from || cursor.ts > to || typeof cursor.id !== 'string') throw new Error();
      rowId(cursor.id);
    } catch { throw new ControlError('Invalid cursor for this time range'); }
  }
  return { from, to, limit, cursor };
}
