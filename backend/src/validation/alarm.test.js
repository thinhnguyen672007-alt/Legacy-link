// validation/alarm.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateAlarm } from './alarm.js';

function validPayload() {
  return {
    schemaVersion: 1,
    deviceId: 'esp32-01',
    timestamp: Date.now(),
    code: 'OVERHEAT',
    severity: 'high',
  };
}

test('payload hop le thi ok', () => {
  const result = validateAlarm('esp32-01', validPayload());

  assert.equal(result.ok, true);
  assert.equal(result.value.code, 'OVERHEAT');
  assert.equal(result.value.severity, 'high');
});

test('thieu value van hop le, vi value la tuy chon', () => {
  const result = validateAlarm('esp32-01', validPayload());

  assert.equal(result.ok, true);
});

test('code khong nam trong danh sach cho phep thi bi tu choi', () => {
  const payload = { ...validPayload(), code: 'BAY_LA' };

  const result = validateAlarm('esp32-01', payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('code')));
});

test('severity khong nam trong danh sach cho phep thi bi tu choi', () => {
  const payload = { ...validPayload(), severity: 'cuc-manh' };

  const result = validateAlarm('esp32-01', payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('severity')));
});

test('thieu han code va severity thi bi tu choi', () => {
  const payload = { schemaVersion: 1, deviceId: 'esp32-01', timestamp: Date.now() };

  const result = validateAlarm('esp32-01', payload);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 2);
});

test('value la chuoi thi bi tu choi', () => {
  const payload = { ...validPayload(), value: 'nong' };

  const result = validateAlarm('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('value la so thi duoc chap nhan va co trong ket qua', () => {
  const payload = { ...validPayload(), value: 95.2 };

  const result = validateAlarm('esp32-01', payload);

  assert.equal(result.ok, true);
  assert.equal(result.value.value, 95.2);
});

test('deviceId lech voi topic thi tu choi, khong nem loi', () => {
  const payload = { ...validPayload(), deviceId: 'esp32-99' };

  const result = validateAlarm('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('payload null thi tu choi chu khong nem loi', () => {
  const result = validateAlarm('esp32-01', null);

  assert.equal(result.ok, false);
});

test('payload la mang thi bi tu choi', () => {
  const result = validateAlarm('esp32-01', [1, 2, 3]);

  assert.equal(result.ok, false);
});
