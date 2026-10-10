import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimit } from './rate-limit.js';
test('rate limit tách đọc/ghi, bỏ health, reset theo cửa sổ và không tin header proxy', () => {
  let time = 0;
  const limit = createRateLimit({ read: 2, write: 1, now: () => time, maxClients: 2 });
  const req = {
      method: 'POST',
      socket: { remoteAddress: 'one' },
      headers: { 'x-forwarded-for': 'fake' },
    },
    headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  limit(req, res, '/config/preview');
  assert.throws(
    () => limit(req, res, '/config/preview'),
    (e) => e.status === 429
  );
  assert.equal(headers['Retry-After'], '60');
  limit(req, res, '/health/live');
  req.method = 'GET';
  limit(req, res, '/machines');
  limit(req, res, '/machines');
  assert.throws(() => limit(req, res, '/machines'));
  time = 60000;
  limit(req, res, '/machines');
});
