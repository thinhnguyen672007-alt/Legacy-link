// Giới hạn theo socket IP, không tin X-Forwarded-For tùy ý. Sau proxy dùng bucket chung.
import { ControlError } from '../control/validation.js';
export function createRateLimit({
  read = 300,
  write = 30,
  windowMs = 60000,
  maxClients = 10000,
  now = Date.now,
} = {}) {
  const buckets = new Map();
  return (req, res, path) => {
    if (path.startsWith('/health') || req.method === 'OPTIONS') return;
    const stamp = now(),
      key = req.socket?.remoteAddress ?? 'unknown';
    for (const [ip, b] of buckets) if (b.until <= stamp) buckets.delete(ip);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxClients) throw new ControlError('Rate limiter capacity reached', 503);
      bucket = { until: stamp + windowMs, read: 0, write: 0 };
      buckets.set(key, bucket);
    }
    const kind = ['GET', 'HEAD'].includes(req.method) ? 'read' : 'write',
      limit = kind === 'read' ? read : write;
    if (++bucket[kind] > limit) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.until - stamp) / 1000)));
      throw new ControlError('Too many requests', 429);
    }
  };
}
