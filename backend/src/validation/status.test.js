// validation/status.test.js
// Chay bang: npm test    (hoac truc tiep: node --test src/)
//
// Hai test cuoi la quan trong nhat: chung khang dinh rang du lieu ban khong
// lam sap tien trinh. Day la lop bao ve ma backend cu (tag attempt-1-backend)
// hoan toan khong co.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateStatus } from './status.js';

function validPayload() {
  return {
    schemaVersion: 1,
    deviceId: 'esp32-01',
    timestamp: Date.now(),
    status: true,
  };
}

test('payload hop le thi ok', () => {
  const result = validateStatus('esp32-01', validPayload());

  assert.equal(result.ok, true);
  assert.equal(result.value.status, true);
});

test('status la chuoi "true" thi bi tu choi', () => {
  const payload = { ...validPayload(), status: 'true' };

  const result = validateStatus('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('timestamp qua cu thi bi tu choi', () => {
  const payload = { ...validPayload(), timestamp: 1000 };

  const result = validateStatus('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('deviceId lech voi topic thi tu choi, khong nem loi', () => {
  const payload = { ...validPayload(), deviceId: 'esp32-99' };

  const result = validateStatus('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('payload null thi tu choi chu khong nem loi', () => {
  const result = validateStatus('esp32-01', null);

  assert.equal(result.ok, false);
});
