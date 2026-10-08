import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ControlService } from './service.js';
import { validateConfig, validateReadings } from './validation.js';
const gatewayId = '643C60A7DBCC';
const config = { deviceId: 'DEMO-A', deviceName: 'Machine A', registerMap: [
  { key: 'temperature', address: 0, dataType: 'INT16', scale: .1, expectedMin: -40, expectedMax: 150 },
] };
function rig(t, options = {}) {
  let now = Date.now(); const sent = []; const saved = [];
  const client = new EventEmitter(); client.connected = true;
  client.publish = (topic, payload, settings, cb) => { sent.push({topic, payload: payload ? JSON.parse(payload) : null, settings}); cb(); };
  client.end = () => {};
  const service = new ControlService(client, { now: () => now, saveConfig: async (...args) => saved.push(args), ...options });
  t.after(() => service.close());
  const receive = (kind, payload, packet) => service.receive(`legacy-link/gateways/${gatewayId}/${kind}`,
    Buffer.from(JSON.stringify({ schemaVersion: 1, gatewayId, bootId: 'boot-1', ...payload })), packet);
  const state = (extra = {}) => receive('state', { timestamp: now, configRequestId: '', persisted: false, restored: false, ...extra });
  const result = (id, extra = {}) => receive('probe/result', { requestId: id, deviceId: 'DEMO-A', result: 'completed',
    readings: [{ key: 'temperature', address: 0, success: true, errorCode: 0, sampledAt: Date.now(), rawWords: [1200], rawValue: 1200, value: 120 }], ...extra });
  return { service, client, sent, saved, receive, state, result, advance: ms => { now += ms; } };
}
test('probe -> exact apply -> flash ACK -> new boot evidence and device registration', async t => {
  const r = rig(t); await r.state();
  const probe = r.service.start(gatewayId, 'probe', {config});
  assert.equal(probe.phase, 'sent'); assert.equal(r.sent[0].settings.retain, false);
  await r.receive('config/ack', {requestId: probe.id, result: 'received'});
  await r.result(probe.id);
  const done = r.service.getOperation(probe.id);
  assert.equal(done.phase, 'completed'); assert.equal(done.readings[0].withinRange, true);
  const apply = r.service.start(gatewayId, 'apply', {config, probeRequestId: probe.id});
  await r.receive('config/ack', {requestId: apply.id, deviceId: 'DEMO-A', result: 'applied', persisted: true});
  assert.equal(r.saved.length, 1);
  const cleared = r.sent.filter(message => message.payload === null);
  assert.deepEqual(cleared.map(message => message.topic), [
    `legacy-link/gateways/${gatewayId}/config`, 'legacy-link/devices/DEMO-A/config']);
  assert(cleared.every(message => message.settings.retain));
  assert.equal(r.service.getOperation(apply.id).restoredAfterRestart, false);
  await r.state({configRequestId: apply.id, persisted: true, restored: true});
  assert.equal(r.service.getOperation(apply.id).restoredAfterRestart, false);
  await r.state({configRequestId: apply.id, persisted: true, restored: true, bootId: 'boot-2'});
  assert.equal(r.service.getOperation(apply.id).restoredAfterRestart, true);
});
test('blocks untested, changed, expired and failed register maps', async t => {
  const r = rig(t); await r.state();
  assert.throws(() => r.service.start(gatewayId, 'apply', {config}), /Read this exact/);
  const p = r.service.start(gatewayId, 'probe', {config});
  assert.throws(() => r.service.start(gatewayId, 'probe', {config}), /busy/);
  await r.result(p.id);
  const changed = structuredClone(config); changed.registerMap[0].address = 49;
  assert.throws(() => r.service.start(gatewayId, 'apply', {config: changed, probeRequestId: p.id}), /Read this exact/);
  r.advance(61000); await r.state();
  assert.throws(() => r.service.start(gatewayId, 'apply', {config, probeRequestId: p.id}), /Read this exact/);
  const p2 = r.service.start(gatewayId, 'probe', {config});
  await r.result(p2.id, {readings:[{key:'temperature',address:0,success:false,errorCode:2,sampledAt:Date.now()}]});
  assert.throws(() => r.service.start(gatewayId, 'apply', {config, probeRequestId: p2.id}), /failed register/);
});
test('range warnings need explicit acceptance and old/retained/wrong boot replies cannot complete a probe', async t => {
  const r = rig(t); await r.state();
  const strict = structuredClone(config); strict.registerMap[0].expectedMax = 100;
  const p = r.service.start(gatewayId, 'probe', {config: strict});
  await r.receive('config/ack', {requestId:p.id, result:'rejected'}, {retain:true});
  await r.result(p.id, {bootId:'old-boot'}); assert.equal(r.service.getOperation(p.id).phase, 'sent');
  await r.result(p.id);
  assert.throws(() => r.service.start(gatewayId, 'apply', {config: strict, probeRequestId:p.id}), /out-of-range/);
  const apply = r.service.start(gatewayId, 'apply', {config: strict, probeRequestId:p.id, acceptWarnings:true});
  await r.receive('config/ack', {requestId:apply.id, deviceId:'DEMO-A', result:'applied', persisted:false});
  assert.equal(r.service.getOperation(apply.id).persisted, false);
  assert.match(r.service.getOperation(apply.id).error, /flash storage failed/);
});
test('timeout means unknown application outcome; stale gateway state stays offline', async t => {
  const r = rig(t); await r.state(); const p = r.service.start(gatewayId,'probe',{config});
  await r.result(p.id); const apply = r.service.start(gatewayId,'apply',{config,probeRequestId:p.id});
  r.advance(46000); assert.equal(r.service.getOperation(apply.id).phase,'timed_out');
  assert.match(r.service.getOperation(apply.id).error,/unknown/);
  assert.equal(r.service.listGateways()[0].online,false);
  assert.throws(() => r.service.start(gatewayId,'probe',{config}),/not reporting/);
});
test('validates bounds, unsupported metrics, duplicated keys and malformed hardware results', () => {
  const valid = validateConfig(config); assert.equal(valid.registerMap[0].address,0);
  for (const patch of [{address:-1},{address:65535,dataType:'UINT32'},{dataType:'FLOAT32'},{scale:NaN},{key:'unknown'}]) {
    assert.throws(() => validateConfig({...config,registerMap:[{...config.registerMap[0],...patch}]}));
  }
  assert.throws(() => validateConfig({...config,registerMap:[config.registerMap[0],config.registerMap[0]]}));
  assert.throws(() => validateReadings([{key:'temperature',address:0,success:true,errorCode:0,sampledAt:Date.now(),rawValue:0,value:0,rawWords:[-1]}],valid));
});
