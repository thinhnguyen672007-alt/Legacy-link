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

// ---------------------------------------------------------------------------
// TEST TAI HIEN LOI CRASH (C1)
//
// Tat ca payload duoi day deu la JSON HOP LE. Chi co gia tri metric la khong
// phai so. Truoc khi sua, chung lam validateTelemetry nem TypeError va giet
// tien trinh backend.
//
// Chung PHAI tra ve ok:false, KHONG duoc nem loi. Khac biet nay la song con:
//
//   tra ve ok:false  -> backend bo qua message, cac thiet bi khac van chay
//   nem loi          -> backend thoat, MOI thiet bi mat ket noi
//
// Mot thiet bi gui sai khong duoc phep lam mat du lieu cua tat ca thiet bi.
// ---------------------------------------------------------------------------

test('metric la object dac biet thi tu choi, KHONG nem loi', () => {
  // Object nay lam JavaScript khong the chuyen thanh chuoi: ca `toString` lan
  // `valueOf` deu khong phai ham. Chen no vao template string se nem
  // "TypeError: Cannot convert object to primitive value".
  //
  // Day chinh la payload da lam backend exit 1 trong thuc te.
  const payload = {
    ...validPayload(),
    metrics: { temperature: { toString: 0, valueOf: 0 } },
  };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('metric la mang thi tu choi, KHONG nem loi', () => {
  const payload = { ...validPayload(), metrics: { temperature: [1, 2] } };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('metric la null thi tu choi, KHONG nem loi', () => {
  const payload = { ...validPayload(), metrics: { temperature: null } };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('metric la chuoi thi tu choi, KHONG nem loi', () => {
  const payload = { ...validPayload(), metrics: { temperature: 'nong' } };

  const result = validateTelemetry('esp32-01', payload);

  assert.equal(result.ok, false);
});

test('metric la Infinity hoac NaN thi tu choi', () => {
  // JSON khong bieu dien duoc Infinity/NaN, nhung ham nay con duoc goi tu cho
  // khac (vi du REST API sau nay). Nen phai chiu duoc truong hop do.
  const inf = validateTelemetry('esp32-01', {
    ...validPayload(),
    metrics: { temperature: Infinity },
  });
  const nan = validateTelemetry('esp32-01', {
    ...validPayload(),
    metrics: { temperature: NaN },
  });

  assert.equal(inf.ok, false);
  assert.equal(nan.ok, false);
});

test('thong bao loi chi noi KIEU, khong noi gia tri', () => {
  const payload = { ...validPayload(), metrics: { temperature: {} } };

  const result = validateTelemetry('esp32-01', payload);

  // Phai noi "received type: object", khong phai "received: [object Object]".
  assert.ok(result.errors.some((message) => message.includes('received type: object')));
});
