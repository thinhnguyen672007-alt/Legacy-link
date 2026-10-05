import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [validationDir, captureFile] = process.argv.slice(2);
const validators = {};
for (const kind of ['telemetry', 'status', 'alarm']) {
  const module = await import(pathToFileURL(path.join(validationDir, `${kind}.js`)));
  validators[kind] = module[`validate${kind[0].toUpperCase()}${kind.slice(1)}`];
}
const messages = (await readFile(captureFile, 'utf8')).trim().split('\n').map(JSON.parse);
const counts = { telemetry: 0, status: 0, alarm: 0 };
const alarms = new Set();
const statuses = [];
for (const message of messages) {
  const match = /^legacy-link\/devices\/([^/]+)\/(telemetry|status|alarm)$/.exec(message.topic);
  assert.ok(match, `Unexpected topic: ${message.topic}`);
  const [, deviceId, kind] = match;
  const payload = JSON.parse(message.payload);
  const result = validators[kind](deviceId, payload);
  assert.equal(result.ok, true, `${kind}: ${JSON.stringify(result.errors)}`);
  assert.equal(deviceId, 'BENCH-01');
  assert.equal(message.retained, kind === 'status');
  assert.equal(validators[kind]('another-device', payload).ok, false);
  assert.equal(validators[kind](deviceId, { ...payload, schemaVersion: 99 }).ok, false);
  if (kind === 'telemetry') {
    // Host Modbus stub supplies 0xFFFF; signedness and scaling must survive JSON.
    assert.ok(Math.abs(payload.metrics.temperature - (-0.1)) < 0.0001);
    assert.ok(Math.abs(payload.metrics.current - 655.35) < 0.001);
    assert.equal(payload.metrics.rpm, 65535);
  } else if (kind === 'alarm') {
    alarms.add(`${payload.code}/${payload.severity}`);
    assert.equal(payload.value, 81.5);
  } else {
    statuses.push(payload.status);
  }
  counts[kind]++;
}
assert.deepEqual(counts, { telemetry: 1, status: 2, alarm: 16 });
assert.equal(alarms.size, 16);
assert.deepEqual(statuses, [true, false]);
console.log('PASS: 19 firmware messages accepted by backend validators; mismatched IDs and schema versions rejected.');
