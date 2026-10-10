import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDelivery, deliveryHealth } from './diagnostics.js';
const box = () => ({capacity:32,pending:0,highWater:0,committed:2,failedEnqueues:0});
const payload = () => ({storage:'RAM',bootId:'boot-1',clockReady:true,freeHeapBytes:40000,telemetry:box(),alarm:box()});
test('delivery chặn counter sai và không lưu field bí mật/lạ', () => {
  const data=payload(); data.password='must-not-save';
  assert.equal(parseDelivery(data).password,undefined);
  for (const value of [-1, 33, Infinity, '1', null]) {
    const bad=payload(); bad.telemetry.pending=value;
    assert.throws(()=>parseDelivery(bad));
  }
  const bad=payload(); bad.alarm.highWater=1; bad.alarm.pending=2;
  assert.throws(()=>parseDelivery(bad));
});
test('health phân biệt backlog, từ chối, từng đầy queue và thông tin cũ', () => {
  const d={timestamp:10000,delivery:parseDelivery(payload())};
  assert.equal(deliveryHealth(d,1000,11000),'healthy');
  d.delivery.telemetry.pending=1; assert.equal(deliveryHealth(d,1000,11000),'backlog');
  d.delivery.alarm.failedEnqueues=1; assert.equal(deliveryHealth(d,1000,11000),'loss_observed');
  d.delivery.telemetry.rejection='unknown_device'; assert.equal(deliveryHealth(d,1000,11000),'rejected');
  assert.equal(deliveryHealth(d,1000,20000),'stale');
  assert.equal(deliveryHealth({},1000),'unknown');
});
