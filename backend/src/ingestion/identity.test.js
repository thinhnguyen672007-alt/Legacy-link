import test from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from './identity.js';

test('dấu vân tay không đổi khi JSONB sắp xếp key trong registerMap', () => {
  const a = { registerMap: [{ address: 1, alarm: { code: 'HOT', threshold: 80 } }] };
  const b = { registerMap: [{ alarm: { threshold: 80, code: 'HOT' }, address: 1 }] };
  assert.equal(fingerprint(a), fingerprint(b));
  assert.notEqual(
    fingerprint(a),
    fingerprint({ registerMap: [{ address: 2, alarm: b.registerMap[0].alarm }] })
  );
  assert.notEqual(fingerprint([1, 2]), fingerprint([2, 1]));
});
