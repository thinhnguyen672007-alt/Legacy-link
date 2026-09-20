// validation/telemetry.test.js
// Chay bang: npm test    (hoac truc tiep: node --test src/)
//
// Day chinh la ly do khien validateTelemetry phai la ham THUAN: bo test nay
// chay trong vai chuc mili-giay, khong can broker, khong can Docker, khong
// can mang. Neu ham tu goi console.error thi test se in rac va khong phan
// biet duoc dau la log cua test, dau la log that.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateTelemetry } from './telemetry.js';

function validPayload() {
  return {
    schemaVersion: 1,
    deviceId: 'esp32-01',
    timestamp: Date.now(),
    metrics: { temperature: 72.5 },
  };
}

test('payload hop le thi ok', () => {
  const result = validateTelemetry('esp32-01', validPayload());

  assert.equal(result.ok, true);
  assert.equal(result.value.deviceId, 'esp32-01');
  assert.equal(result.value.metrics.temperature, 72.5);
});

test('thieu deviceId thi bi tu choi', () => {
  const payload = validPayload();
  delete payload.deviceId;

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('deviceId')));
});

test('deviceId lech voi topic thi bi tu choi', () => {
  const payload = { ...validPayload(), deviceId: 'esp32-99' };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('does not match topic')));
});

test('timestamp la chuoi thi bi tu choi', () => {
  const payload = { ...validPayload(), timestamp: '1757846130000' };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('metrics rong thi bi tu choi', () => {
  const payload = { ...validPayload(), metrics: {} };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('payload sai nhieu cho thi gom du loi trong mot lan', () => {
  const payload = {
    deviceId: 'esp32-99',
    timestamp: 'sai',
    metrics: { a: 'b' },
  };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 4);
});

test('metrics ngoai danh sach cho phep thi bi tu choi', () => {
  const payload = {
    ...validPayload(),
    metrics: { temperature: 72.5, doAm: 55 },
  };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
  assert.ok(result.errors.some((message) => message.includes('doAm')));
});

test('payload null thi tu choi chu khong nem loi', () => {
  const result = validateTelemetry('esp32-01', null);

  assert.equal(result.ok, false);
});

test('payload la mang thi bi tu choi', () => {
  const result = validateTelemetry('esp32-01', [1, 2, 3]);

  assert.equal(result.ok, false);
});
