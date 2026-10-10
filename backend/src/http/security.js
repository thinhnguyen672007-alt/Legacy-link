// C15: token đọc và token thao tác tách biệt; không ghi token vào log hoặc URL.
import { createHash, timingSafeEqual } from 'node:crypto';
import { ControlError } from '../control/validation.js';
const digest = value => createHash('sha256').update(value).digest();
const equals = (value, expected) => Boolean(expected) && timingSafeEqual(digest(value), digest(expected));
export function securitySettings(env = process.env) {
  const disabled = env.API_AUTH_DISABLED === 'true';
  if (disabled && (env.NODE_ENV === 'production' || !['127.0.0.1', '::1'].includes(env.HTTP_HOST))) {
    throw new Error('Chỉ tắt auth khi development và HTTP_HOST là loopback');
  }
  const readToken = env.API_READ_TOKEN ?? '', writeToken = env.API_WRITE_TOKEN ?? '';
  if (!disabled && (readToken.length < 32 || writeToken.length < 32 || readToken === writeToken)) {
    throw new Error('Cần API_READ_TOKEN và API_WRITE_TOKEN khác nhau, dài ít nhất 32 ký tự');
  }
  const origins = (env.CORS_ORIGINS ?? '').split(',').map(x => x.trim()).filter(Boolean);
  for (const origin of origins) {
    let url; try { url = new URL(origin); } catch { throw new Error('CORS_ORIGINS phải chứa origin cụ thể'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('CORS origin không hợp lệ');
  }
  return { disabled, readToken, writeToken, origins };
}
export function createSecurity(settings) {
  return (req, res, path) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Origin');
    const origin = req.headers.origin;
    if (origin) {
      if (!settings.origins.includes(origin)) throw new ControlError('Origin not allowed', 403);
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    }
    // Health công khai cho Docker/proxy; preflight không chạy nghiệp vụ.
    if (req.method === 'OPTIONS' || ['/health', '/health/live', '/health/ready'].includes(path)) return;
    if (settings.disabled) return;
    const header = req.headers.authorization ?? '';
    const token = /^Bearer ([^\s]+)$/.exec(header)?.[1] ?? '';
    const writer = equals(token, settings.writeToken);
    if (!writer && !equals(token, settings.readToken)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      throw new ControlError('Authentication required', 401);
    }
    if (!['GET', 'HEAD'].includes(req.method) && !(req.method === 'POST' && ['/ai/chat', '/ai/query'].includes(path)) && !writer) throw new ControlError('Write permission required', 403);
  };
}
