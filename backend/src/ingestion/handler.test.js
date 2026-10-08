import test from 'node:test';
import assert from 'node:assert/strict';
import { createIngestionHandler } from './handler.js';
import { IngestionError } from './errors.js';
import { validateTelemetry } from '../validation/telemetry.js';
import { validateAlarm } from '../validation/alarm.js';

const event = { schemaVersion: 1, deviceId: 'BENCH-01', gatewayId: 'CCDBA7603C64',
  messageId: 'boot:42', timestamp: Date.now(), metrics: { temperature: 30 } };
const logger = { info() {}, warn() {}, error() {} };
function handler(save, publish) {
  return createIngestionHandler({ kind: 'telemetry', validate: validateTelemetry, save, publish, logger });
}
test('ACK waits for save to resolve (transaction commit boundary)', async () => {
  let commit, started;
  const saving = new Promise(resolve => { started = resolve; });
  const acks = [];
  const run = handler(async () => { started(); await new Promise(resolve => { commit = resolve; }); return { inserted: true }; },
    async (...args) => acks.push(args))('BENCH-01', event);
  await saving;
  assert.equal(acks.length, 0);
  commit(); await run;
  assert.equal(acks[0][0], 'legacy-link/gateways/CCDBA7603C64/ingestion/ack');
  assert.equal(acks[0][1].status, 'committed');
  assert.equal(acks[0][1].messageId, 'boot:42');
});
test('already committed duplicate receives ACK again after a lost ACK', async () => {
  let ack;
  await handler(async () => ({ inserted: false }), async (_, value) => { ack = value; })('BENCH-01', event);
  assert.equal(ack.status, 'committed');
});
test('database failure never sends success ACK', async () => {
  const replies = [];
  await handler(async () => { throw new Error('database unavailable'); }, async x => replies.push(x))('BENCH-01', event);
  assert.equal(replies.length, 0);
});
for (const code of ['unknown_device', 'gateway_mismatch', 'identity_conflict']) {
  test(`${code} is explicitly rejected, never committed`, async () => {
    let ack;
    await handler(async () => { throw new IngestionError(code); }, async (_, value) => { ack = value; })('BENCH-01', event);
    assert.equal(ack.status, 'rejected'); assert.equal(ack.reason, code);
  });
}
test('malformed identity cannot write or publish to an arbitrary MQTT topic', async () => {
  let calls = 0;
  await handler(async () => { calls++; }, async () => { calls++; })('BENCH-01', { ...event, gatewayId: 'x/+/bad' });
  assert.equal(calls, 0);
});
test('legacy telemetry is still saved but does not receive a fabricated ACK', async () => {
  const legacy = { ...event }; delete legacy.gatewayId; delete legacy.messageId;
  let saves = 0, acks = 0;
  await handler(async () => { saves++; return { inserted: true }; }, async () => { acks++; })('BENCH-01', legacy);
  assert.equal(saves, 1); assert.equal(acks, 0);
});
test('validator preserves reliable telemetry identity and rejects incomplete identity', () => {
  assert.equal(validateTelemetry('BENCH-01', event).value.messageId, event.messageId);
  assert.equal(validateTelemetry('BENCH-01', { ...event, messageId: undefined }).ok, false);
  assert.equal(validateTelemetry('BENCH-01', { ...event, messageId: 'x'.repeat(129) }).ok, false);
});
test('identified alarms require both eventId and metricKey', () => {
  const alarm = { schemaVersion: 1, deviceId: 'BENCH-01', gatewayId: event.gatewayId,
    eventId: 'boot:43', metricKey: 'temperature', timestamp: event.timestamp,
    code: 'OVERHEAT', severity: 'high', value: 95 };
  assert.equal(validateAlarm('BENCH-01', alarm).value.eventId, 'boot:43');
  assert.equal(validateAlarm('BENCH-01', { ...alarm, metricKey: undefined }).ok, false);
  assert.equal(validateAlarm('BENCH-01', { ...alarm, eventId: undefined }).ok, false);
});
