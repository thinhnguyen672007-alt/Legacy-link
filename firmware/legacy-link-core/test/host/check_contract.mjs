import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

const [validationDir, captureFile] = process.argv.slice(2);
const validators = {};
for (const kind of ['telemetry', 'status', 'alarm']) {
  const module = await import(pathToFileURL(path.join(validationDir, `${kind}.js`)));
  validators[kind] = module[`validate${kind[0].toUpperCase()}${kind.slice(1)}`];
}
const messages = (await readFile(captureFile, 'utf8')).trim().split('\n').map(JSON.parse);
const counts = { telemetry: 0, status: 0, alarm: 0 };
const { validateReadings } = await import(pathToFileURL(path.join(validationDir, '../control/validation.js')));
const diagnosticsPath = path.join(validationDir, 'diagnostics.js');
const parseDiagnostics = existsSync(diagnosticsPath) ? (await import(pathToFileURL(diagnosticsPath))).parseDiagnostics : null;
let readReports = 0;
const expectedMap = { registerMap: [
  { key: 'temperature', address: 0 }, { key: 'current', address: 1 }, { key: 'rpm', address: 2 },
] };
const alarms = new Set();
const statuses = [];
for (const message of messages) {
  if (message.topic.endsWith('/diagnostics') || message.topic.endsWith('/probe/result')) {
    const report = JSON.parse(message.payload);
    if (parseDiagnostics && message.topic.endsWith('/diagnostics')) {
      const diagnostics = parseDiagnostics('BENCH-01', report);
      assert.equal(diagnostics.delivery.storage, 'RAM');
      assert.equal(diagnostics.delivery.telemetry.pending, 1);
      assert.equal(diagnostics.delivery.alarm.capacity, 8);
      assert.throws(() => parseDiagnostics('wrong-device', report));
    }
    const rows = validateReadings(report.readings, expectedMap);
    assert.equal(rows.length, 3);
    assert.equal(message.retained, false);
    if (message.topic.endsWith('/probe/result')) {
      assert.equal(report.requestId, 'contract-probe');
      assert.equal(report.result, 'completed');
    }
    assert.throws(() => validateReadings(report.readings.slice(1), expectedMap));
    assert.throws(() => validateReadings(report.readings.map((row, i) => i ? row : { ...row, address: 49 }), expectedMap));
    if (readReports === 2) {
      assert.equal(rows[0].success, false);
      assert.equal(rows[0].errorCode, 0xE2);
      assert.equal(Object.hasOwn(rows[0], 'value'), false);
    }
    readReports++;
    continue;
  }
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
assert.equal(readReports, 3);
console.log('PASS: 22 firmware messages accepted by backend validators; mismatched IDs and schema versions and incomplete/mismatched read reports rejected.');
