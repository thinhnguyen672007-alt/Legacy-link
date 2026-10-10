// Kiểm thử tích hợp: tự tạo PostgreSQL và MQTT riêng bằng Docker để thử toàn bộ luồng.
// Dữ liệu giả và container riêng giúp bài kiểm thử không ghi vào database đang dùng của bạn.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';
import pg from 'pg';
const root = fileURLToPath(new URL('../', import.meta.url));
const suffix = randomUUID().slice(0, 8),
  password = randomUUID();
const apiToken = randomUUID(),
  readToken = randomUUID();
const pgName = `legacy-ingestion-pg-${suffix}`,
  mqName = `legacy-ingestion-mq-${suffix}`;
const containers = [],
  children = [],
  logs = [],
  acks = [];
let pool, sourcePool, publisher;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function docker(...args) {
  const p = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
  if (p.status !== 0)
    throw new Error(`docker ${args[0]}: ${p.stderr.replaceAll(password, '[redacted]')}`);
  return p.stdout.trim();
}
async function waitFor(fn, label) {
  for (let i = 0; i < 120; i++) {
    if (await fn()) return;
    await sleep(100);
  }
  throw new Error(`Timeout: ${label}`);
}
async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}
function consumer() {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: root,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const stream of [child.stdout, child.stderr])
    stream.on('data', (b) => logs.push(b.toString().replaceAll(password, '[redacted]')));
  children.push(child);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  for (let i = 0; i < 40 && child.exitCode === null; i++) await sleep(100);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function send(event, kind = 'telemetry') {
  await publisher.publishAsync(
    `legacy-link/devices/${event.deviceId}/${kind}`,
    JSON.stringify(event),
    { qos: 0, retain: false }
  );
}
async function acked(event, kind = 'telemetry', status = 'committed') {
  const start = acks.length;
  await send(event, kind);
  await waitFor(
    () =>
      acks
        .slice(start)
        .some(
          (a) =>
            a.messageId === (event.messageId ?? event.eventId) &&
            a.kind === kind &&
            a.status === status
        ),
    `ACK ${event.messageId ?? event.eventId}`
  );
  return acks
    .slice(start)
    .find((a) => a.messageId === (event.messageId ?? event.eventId) && a.kind === kind);
}
function passed(name) {
  console.log(`PASS ${name}`);
}
try {
  const pgPort = await freePort(),
    mqPort = await freePort();
  docker(
    'run',
    '-d',
    '--name',
    pgName,
    '-e',
    `POSTGRES_PASSWORD=${password}`,
    '-e',
    'POSTGRES_USER=reviewer',
    '-e',
    'POSTGRES_DB=review',
    '-p',
    `127.0.0.1:${pgPort}:5432`,
    'postgres:16'
  );
  containers.push(pgName);
  docker(
    'run',
    '-d',
    '--name',
    mqName,
    '-e',
    `REVIEW_PASSWORD=${password}`,
    '-p',
    `127.0.0.1:${mqPort}:1883`,
    '--entrypoint',
    'sh',
    'eclipse-mosquitto:2',
    '-c',
    'mosquitto_passwd -b -c /tmp/test.passwd reviewer "$REVIEW_PASSWORD"; chmod 644 /tmp/test.passwd; printf "listener 1883 0.0.0.0\nallow_anonymous false\npassword_file /tmp/test.passwd\n" > /tmp/test.conf; exec mosquitto -c /tmp/test.conf'
  );
  containers.push(mqName);
  Object.assign(process.env, {
    GEMINI_API_KEY: '',
    API_WRITE_TOKEN: apiToken,
    API_READ_TOKEN: readToken,
    API_AUTH_DISABLED: 'false',
    INGESTION_CONCURRENCY: '1',
    INGESTION_CAPACITY: '2',
    NODE_ENV: 'test',
    CORS_ORIGINS: 'http://localhost:5173',
    MQTT_URL: `mqtt://127.0.0.1:${mqPort}`,
    MQTT_USERNAME: 'reviewer',
    MQTT_PASSWORD: password,
    MQTT_QOS: '1',
    MQTT_CLIENT_ID: `test-consumer-${suffix}`,
    DATABASE_URL: `postgres://reviewer:${password}@127.0.0.1:${pgPort}/review`,
  });
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 1000 });
  pool.on('error', () => {});
  await waitFor(async () => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }, 'database');
  const schema = readFileSync(`${root}db/schema.sql`, 'utf8');
  // Thử nâng cấp database cũ: dữ liệu lịch sử phải còn nguyên sau migration.
  // Tìm câu SQL mở đầu migration thay vì bám vào ngôn ngữ của comment.
  const upgradeStatement = schema.indexOf(
    'ALTER TABLE device ADD COLUMN IF NOT EXISTS applied_config'
  );
  const upgradeTransaction = schema.lastIndexOf('BEGIN;', upgradeStatement);
  assert.ok(
    upgradeStatement > 0 && upgradeTransaction > 0,
    'Phải tìm được phần schema cũ trước migration'
  );
  await pool.query(schema.slice(0, upgradeTransaction));
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM information_schema.columns WHERE table_schema='public' AND table_name='telemetry' AND column_name='message_id'"
      )
    ).rows[0].n,
    0
  );
  await pool.query(readFileSync(`${root}db/seed-demo.sql`, 'utf8'));
  const now = Date.now();
  await pool.query(
    "INSERT INTO telemetry(device_id,ts,metrics) VALUES ('esp32-01',$1,'{\"temperature\":25}')",
    [now - 10000]
  );
  await pool.query(
    "INSERT INTO alarms(device_id,ts,code,severity,value) VALUES ('esp32-01',$1,'OVERHEAT','high',95)",
    [now - 10000]
  );
  await pool.query(readFileSync(`${root}db/migrate-c7-c8-c9.sql`, 'utf8'));
  await pool.query(schema); // Chạy schema lần nữa để kiểm tra việc chạy lặp không làm hỏng database.
  assert.equal((await pool.query('SELECT count(*)::int n FROM telemetry')).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM alarms')).rows[0].n, 1);
  for (let attempt = 0; attempt < 2; attempt++) {
    const migration = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
      cwd: root,
      env: process.env,
      encoding: 'utf8',
      timeout: 30000,
    });
    assert.equal(migration.status, 0, migration.stderr.replaceAll(password, '[redacted]'));
  }
  await pool.query('CREATE DATABASE migration_empty');
  const emptyUrl = new URL(process.env.DATABASE_URL);
  emptyUrl.pathname = '/migration_empty';
  const fresh = spawnSync(process.execPath, ['scripts/migrate.mjs'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: emptyUrl.href },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(fresh.status, 0, fresh.stderr.replaceAll(password, '[redacted]'));
  await pool.query('DROP DATABASE migration_empty');
  passed('migration CLI creates empty database schema, upgrades history and can be re-run');
  const benchSql = readFileSync(`${root}db/seed-bench.sql`, 'utf8').replace(
    ":'gateway_id'",
    "'CCDBA7603C64'"
  );
  await pool.query(benchSql);
  await pool.query(benchSql);
  const { listMachines } = await import('../src/db/machines.js');
  const { saveTelemetry } = await import('../src/db/telemetry.js');
  const { saveAlarm } = await import('../src/db/alarm.js');
  const { saveStatus } = await import('../src/db/status.js');
  const { saveDiagnostics } = await import('../src/db/diagnostics.js');
  sourcePool = (await import('../src/db/pool.js')).pool;
  assert.equal((await listMachines()).filter((m) => m.deviceId === 'BENCH-01').length, 1);
  passed('BENCH-01 fixture appears exactly once in dashboard registry');
  await assert.rejects(() => saveStatus({ deviceId: 'GHOST', status: true }), {
    code: 'unknown_device',
  });
  await assert.rejects(
    () =>
      saveDiagnostics('GHOST', {
        schemaVersion: 1,
        deviceId: 'GHOST',
        gatewayId: 'CCDBA7603C64',
        timestamp: now,
        samplingIntervalMs: 2000,
        configRequestId: 'x',
        readings: [
          { key: 'temperature', address: 1, success: false, errorCode: 2, sampledAt: now },
        ],
      }),
    { code: 'unknown_device' }
  );
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM machine_state WHERE device_id='GHOST'")).rows[0]
      .n,
    0
  );
  passed('unknown status/diagnostics cannot create ghost state');
  const t = {
    schemaVersion: 1,
    deviceId: 'BENCH-01',
    gatewayId: 'CCDBA7603C64',
    messageId: 'boot:1',
    timestamp: now,
    metrics: { temperature: 30 },
  };
  const results = await Promise.all(Array.from({ length: 8 }, () => saveTelemetry(t)));
  assert.equal(results.filter((r) => r.inserted).length, 1);
  await assert.rejects(() => saveTelemetry({ ...t, metrics: { temperature: 999 } }), {
    code: 'identity_conflict',
  });
  await saveTelemetry({
    ...t,
    messageId: 'boot:older',
    timestamp: now - 2000,
    metrics: { temperature: 10 },
  });
  assert.equal(
    (await pool.query("SELECT last_metrics FROM machine_state WHERE device_id='BENCH-01'")).rows[0]
      .last_metrics.temperature,
    30
  );
  await saveTelemetry({ ...t, messageId: 'boot:same-time', metrics: { temperature: 31 } });
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int n FROM telemetry WHERE device_id='BENCH-01' AND ts=$1",
        [now]
      )
    ).rows[0].n,
    2
  );
  passed(
    'concurrent duplicate is stored once; conflicting ID rejected; replay preserves latest; distinct same-time samples survive'
  );
  const alarm = {
    schemaVersion: 1,
    deviceId: 'BENCH-01',
    gatewayId: t.gatewayId,
    eventId: 'boot:alarm1',
    metricKey: 'temperature',
    timestamp: now,
    code: 'OVERHEAT',
    severity: 'high',
    value: 95,
  };
  await saveAlarm(alarm);
  await saveAlarm({ ...alarm, eventId: 'boot:alarm2', severity: 'critical', value: 105 });
  await saveAlarm({ ...alarm, eventId: 'boot:alarm3', metricKey: 'current' });
  await saveAlarm(alarm);
  assert.equal(
    (await pool.query("SELECT count(*)::int n FROM alarms WHERE device_id='BENCH-01'")).rows[0].n,
    3
  );
  await assert.rejects(() => saveAlarm({ ...alarm, severity: 'critical' }), {
    code: 'identity_conflict',
  });
  const legacy = {
    deviceId: 'esp32-01',
    timestamp: now,
    code: 'OVERHEAT',
    severity: 'high',
    value: 95,
  };
  await saveAlarm(legacy);
  await saveAlarm({ ...legacy, severity: 'critical', value: 105 });
  await saveAlarm(legacy);
  assert.equal(
    (
      await pool.query("SELECT count(*)::int n FROM alarms WHERE device_id='esp32-01' AND ts=$1", [
        now,
      ])
    ).rows[0].n,
    2
  );
  passed(
    'C9 distinct alarm IDs/severities/metrics survive; exact retries deduplicate including legacy payloads'
  );
  // Cố ý gây lỗi sau khi ghi mẫu và biên nhận: rollback phải hủy cả hai, không để lưu nửa chừng.
  await pool.query(
    "ALTER TABLE machine_state ADD CONSTRAINT test_projection_failure CHECK ((last_metrics->>'temperature')::numeric <> 123456)"
  );
  const rollback = {
    ...t,
    messageId: 'boot:rollback',
    timestamp: now + 100,
    metrics: { temperature: 123456 },
  };
  await assert.rejects(() => saveTelemetry(rollback), { code: '23514' });
  assert.equal(
    (
      await pool.query('SELECT count(*)::int n FROM ingestion_receipt WHERE message_id=$1', [
        `${t.gatewayId}:${rollback.messageId}`,
      ])
    ).rows[0].n,
    0
  );
  assert.equal(
    (
      await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1', [
        `${t.gatewayId}:${rollback.messageId}`,
      ])
    ).rows[0].n,
    0
  );
  await pool.query('ALTER TABLE machine_state DROP CONSTRAINT test_projection_failure');
  await saveTelemetry(rollback);
  passed('failed transaction rolls back both receipt and sample; identical retry succeeds');
  const { saveAppliedConfig } = await import('../src/db/provisioning.js');
  const cfg = {
    deviceId: 'BENCH-01',
    deviceName: 'Commissioned simulator',
    protocol: 'MODBUS_RTU',
    baudRate: 9600,
    parity: 'NONE',
    stopBits: 1,
    slaveId: 1,
    samplingIntervalMs: 2000,
    registerMap: [
      { key: 'temperature', address: 1, functionCode: 3, dataType: 'INT16', scale: 0.1, unit: 'C' },
    ],
  };
  await saveAppliedConfig(cfg, 'Commissioned bench', t.gatewayId, 'request-commissioned');
  await pool.query(benchSql);
  const { getCatalog } = await import('../src/db/catalog.js');
  await pool.query(
    "UPDATE register_override SET word_order='LOW_FIRST' WHERE device_id='esp32-03' AND metric_key='temperature'"
  );
  const overridden = (await getCatalog('esp32-03')).registerMap.find(
    (r) => r.key === 'temperature'
  );
  assert.equal(overridden.wordOrder, 'LOW_FIRST');
  assert.equal(overridden.alarm.threshold, 90);
  assert.equal(overridden.alarm.code, 'OVERHEAT');
  assert.equal(overridden.address, 51);
  passed('SQL catalog preserves override word order and canonical nested alarm');
  await pool.query("UPDATE register_override SET alarm_low=20 WHERE device_id='esp32-03' AND metric_key='temperature'");
  assert.equal((await getCatalog('esp32-03')).registerMap.find(r => r.key === 'temperature').lowAlarm.threshold, 20);
  await saveAlarm({ ...alarm, eventId: 'boot:underheat', code: 'UNDERHEAT', value: 19 });
  await saveAlarm({ ...alarm, eventId: 'boot:underheat', code: 'UNDERHEAT', value: 19 });
  assert.equal((await pool.query("SELECT count(*)::int n FROM alarms WHERE device_id='BENCH-01' AND code='UNDERHEAT'")).rows[0].n, 1);
  passed('UNDERHEAT catalog low threshold and database alarm retry deduplication');

  assert.equal((await getCatalog('BENCH-01')).deviceName, 'Commissioned simulator');
  assert.equal(
    (await listMachines()).find((m) => m.deviceId === 'BENCH-01').configRequestId,
    'request-commissioned'
  );
  passed(
    'real commissioning persists catalog/registry; fixture re-run preserves applied configuration'
  );
  const humidityConfig = {
    ...cfg,
    registerMap: [
      ...cfg.registerMap,
      { key: 'humidity', address: 4, functionCode: 3, dataType: 'INT16', scale: 0.1, unit: '%' },
    ],
  };
  await saveAppliedConfig(humidityConfig, 'Commissioned bench', t.gatewayId, 'dynamic-metric');
  const humidity = { ...t, messageId: 'dynamic:1', metrics: { humidity: 55 } };
  await saveTelemetry(humidity);
  await assert.rejects(
    () => saveTelemetry({ ...t, messageId: 'dynamic:bad', metrics: { vibration: 10 } }),
    { code: 'metric_not_configured' }
  );
  assert.equal(
    (
      await pool.query('SELECT count(*)::int n FROM ingestion_receipt WHERE message_id=$1', [
        `${t.gatewayId}:dynamic:bad`,
      ])
    ).rows[0].n,
    0
  );
  await saveAppliedConfig(cfg, 'Commissioned bench', t.gatewayId, 'restore');
  assert.equal((await saveTelemetry(humidity)).inserted, false); // Mẫu đã lưu vẫn ACK lại sau đổi cấu hình.
  assert.equal((await saveTelemetry({ ...humidity, messageId: 'dynamic:2' })).inserted, true);
  await assert.rejects(
    () =>
      saveTelemetry({ ...humidity, messageId: 'dynamic:future', timestamp: Date.now() + 10000 }),
    { code: 'metric_not_configured' }
  );
  await pool.query('DELETE FROM telemetry WHERE message_id=ANY($1::text[])', [
    [`${t.gatewayId}:dynamic:1`, `${t.gatewayId}:dynamic:2`],
  ]);
  passed('C11 dynamic per-device catalog, no receipt on rejection, retry after config change');
  const { createConfigRequest, applyConfigAck, getConfigRequest } = await import(
    '../src/db/config-request.js'
  );
  const scopedId = randomUUID();
  await createConfigRequest({
    requestId: scopedId,
    deviceId: t.deviceId,
    gatewayId: t.gatewayId,
    payload: cfg,
  });
  const configAck = { requestId: scopedId, result: 'applied', reason: null, persisted: true };
  assert.equal((await applyConfigAck({ ...configAck, gatewayId: 'FFFFFFFFFFFF' })).matched, false);
  assert.equal((await applyConfigAck(configAck)).matched, false);
  assert.equal((await getConfigRequest(scopedId)).status, 'pending');
  assert.equal((await applyConfigAck({ ...configAck, gatewayId: t.gatewayId })).matched, true);
  assert.equal((await applyConfigAck({ ...configAck, gatewayId: t.gatewayId })).matched, false);
  passed(
    'C15 config ACK requires matching gateway; knowing requestId alone cannot confirm another gateway'
  );

  const { completionChecks } = await import('./completion-checks.mjs');
  await completionChecks({ pool, t, cfg, saveTelemetry, passed });
  await sourcePool.end();
  sourcePool = null;
  let worker = consumer();
  await waitFor(() => logs.join('').includes('Da subscribe:'), 'consumer subscription');
  publisher = mqtt.connect(process.env.MQTT_URL, {
    username: 'reviewer',
    password,
    reconnectPeriod: 0,
  });
  await new Promise((resolve, reject) => {
    publisher.once('connect', resolve);
    publisher.once('error', reject);
  });
  publisher.on('message', (_, buf) => acks.push(JSON.parse(buf.toString())));
  await publisher.subscribeAsync(`legacy-link/gateways/${t.gatewayId}/ingestion/ack`, { qos: 1 });
  const apiLog = logs.length;
  const api = spawn(process.execPath, ['src/http/server.js'], {
    cwd: root,
    env: { ...process.env, HTTP_HOST: '127.0.0.1', HTTP_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(api);
  for (const stream of [api.stdout, api.stderr])
    stream.on('data', (b) => logs.push(b.toString().replaceAll(password, '[redacted]')));
  await waitFor(
    () => logs.slice(apiLog).join('').includes('[HTTP] Listening port='),
    'HTTP listener'
  );
  const apiPort = logs
    .slice(apiLog)
    .join('')
    .match(/Listening port=(\d+)/)[1];
  const base = `http://127.0.0.1:${apiPort}`;
  assert.equal((await fetch(base + '/machines')).status, 401);
  assert.equal(
    (
      await fetch(base + '/alarms/1/ack', {
        method: 'POST',
        headers: { Authorization: `Bearer ${readToken}` },
      })
    ).status,
    403
  );
  assert.equal(
    (await fetch(base + '/machines', { headers: { Authorization: `Bearer ${readToken}` } })).status,
    200
  );
  passed('C15 real API enforces authentication and read/write roles');
  const profileBody = { schemaVersion: 1, id: 'bench-profile', name: 'Profile A', config: cfg };
  const write = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await write('/config/preview', { config: cfg })).status, 200);
  assert.equal((await write('/profiles/import', profileBody)).status, 201);
  const imported = await (await write('/profiles/import', profileBody)).json();
  assert.equal(imported.revision, 2);
  const profile = await (
    await fetch(base + '/profiles/bench-profile/export?revision=1', {
      headers: { Authorization: `Bearer ${readToken}` },
    })
  ).json();
  assert.equal(profile.revision, 1);
  assert.equal(profile.config.registerMap[0].wordOrder, 'HIGH_FIRST');
  assert.equal(
    (await write('/profiles/import', { ...profileBody, config: { ...cfg, slaveId: 999 } })).status,
    400
  );
  assert.equal(
    (await fetch(base + '/operations', { headers: { Authorization: `Bearer ${readToken}` } }))
      .status,
    200
  );
  assert.equal(
    (await fetch(base + '/system/metrics', { headers: { Authorization: `Bearer ${readToken}` } }))
      .status,
    200
  );
  passed(
    'C16 real API preview, immutable profile revisions, export validation, operation history and metrics'
  );


  const aiResult = await fetch(base + '/ai/query', { method: 'POST', headers: { Authorization: `Bearer ${readToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'summary' }) });
  assert.equal(aiResult.status, 200);
  const aiBody = await aiResult.json();
  assert.equal(aiBody.mode, 'rules');
  assert.equal(aiBody.results[0].source, 'database');
  assert.ok(aiBody.results[0].devices.some(d => d.deviceId === 'BENCH-01'));
  assert.equal((await fetch(base + '/ai/query', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'summary' }) })).status, 401);
  passed('AI quick actions read real SQL data with read token; unauthenticated requests rejected');

  const request = (path, method = 'GET') =>
    fetch(base + path, { method, headers: { Authorization: `Bearer ${apiToken}` } });
  assert.equal((await request('/health/live')).status, 200);
  await waitFor(async () => (await request('/health/ready')).status === 200, 'full readiness');
  const machines = await (await request('/machines')).json();
  assert.ok(machines.some((m) => m.deviceId === 'BENCH-01'));
  assert.equal((await request('/machines/BENCH-01')).status, 200);
  assert.equal((await request('/machines/missing')).status, 404);
  assert.equal((await request('/machines', 'POST')).status, 405);
  assert.equal((await request('/%ZZ')).status, 400);
  assert.equal((await request('/machines/BENCH-01/telemetry?limit=9999')).status, 400);
  const historyPath = `/machines/BENCH-01/telemetry?from=${now - 3000}&to=${now + 200}&limit=1`;
  const first = await (await request(historyPath)).json();
  assert.equal(first.items.length, 1);
  assert.ok(first.nextCursor);
  const second = await (await request(historyPath + '&cursor=' + first.nextCursor)).json();
  assert.notEqual(first.items[0].id, second.items[0].id);
  const alarms = await (
    await request(
      `/machines/BENCH-01/alarms?from=${now - 1}&to=${now + 1}&severity=critical&acknowledged=false`
    )
  ).json();
  assert.equal(alarms.items.length, 1);
  const ackPath = `/alarms/${alarms.items[0].id}/ack`;
  const acknowledged = await (await request(ackPath, 'POST')).json();
  assert.ok(acknowledged.acknowledgedAt);
  assert.equal(
    (await (await request(ackPath, 'POST')).json()).acknowledgedAt,
    acknowledged.acknowledgedAt
  );
  assert.equal((await request('/uptime?limit=5')).status, 200);
  assert.equal((await request('/gateways')).status, 200);
  // Gọi endpoint probe thật: gateway offline phải trả 409, chứng minh route đã được nối vào HTTP.
  assert.equal(
    (
      await fetch(base + `/gateways/${t.gatewayId}/probe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ config: cfg }),
      })
    ).status,
    409
  );
  const occupied = spawn(process.execPath, ['src/http/server.js'], {
    cwd: root,
    env: { ...process.env, HTTP_HOST: '127.0.0.1', HTTP_PORT: apiPort },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(occupied);
  let occupiedLog = '';
  occupied.stderr.on('data', (b) => {
    occupiedLog += b.toString();
  });
  occupied.stdout.resume();
  await waitFor(() => occupied.exitCode !== null, 'occupied port failure');
  assert.equal(occupied.exitCode, 1);
  assert.ok(occupiedLog.includes('EADDRINUSE'));
  passed(
    'real HTTP entrypoint: dashboard, pagination, alarms/ACK, commands, methods, malformed URL, readiness'
  );
  const live = { ...t, messageId: 'boot:live', timestamp: now + 1 };
  await acked(live);
  await acked(live); // Giả lập ESP32 không nhận ACK đầu tiên nên gửi lại cùng bản tin.
  assert.equal(
    (
      await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1', [
        `${t.gatewayId}:${live.messageId}`,
      ])
    ).rows[0].n,
    1
  );
  assert.equal(
    (await acked({ ...live, metrics: { temperature: 99 } }, 'telemetry', 'rejected')).reason,
    'identity_conflict'
  );
  assert.equal(
    (await acked({ ...live, deviceId: 'GHOST' }, 'telemetry', 'rejected')).reason,
    'unknown_device'
  );
  await acked({ ...alarm, eventId: 'boot:mqtt-alarm' }, 'alarm');
  const coldAlarm = { ...alarm, eventId: 'boot:mqtt-underheat', code: 'UNDERHEAT', value: 19 };
  await acked(coldAlarm, 'alarm');
  await acked(coldAlarm, 'alarm');
  assert.equal((await pool.query('SELECT count(*)::int n FROM alarms WHERE event_id=$1', [`${t.gatewayId}:${coldAlarm.eventId}`])).rows[0].n, 1);
  const coldPage = await (await request(`/machines/BENCH-01/alarms?from=${now - 1}&to=${now + 1}&limit=50`)).json();
  assert.ok(coldPage.items.some(a => a.code === 'UNDERHEAT' && a.value === 19));
  passed('UNDERHEAT QoS0 MQTT -> validation -> SQL -> ACK -> HTTP, lost ACK retry stores one event');

  passed(
    'real QoS0 MQTT -> SQL -> application ACK; lost ACK retry; rejected identity/unknown device; alarm ACK'
  );
  const lock = await pool.connect();
  try {
    await lock.query('BEGIN');
    await lock.query("SELECT 1 FROM device WHERE device_id='BENCH-01' FOR UPDATE");
    const flood = [1, 2, 3].map((n) => ({ ...t, messageId: `queue:${n}` }));
    const floodLog = logs.length;
    for (const sample of flood) await send(sample);
    await waitFor(() => logs.slice(floodLog).join('').includes('Hàng đợi đầy'), 'queue full');
    assert.equal(
      acks.some((a) => a.messageId === 'queue:3'),
      false
    );
    await lock.query('COMMIT');
    await waitFor(() => acks.some((a) => a.messageId === 'queue:2'), 'admitted samples committed');
    assert.equal(
      acks.some((a) => a.messageId === 'queue:3'),
      false
    );
    await acked(flood[2]);
    // Payload quá lớn bị chặn trước JSON.parse; worker vẫn nhận mẫu hợp lệ tiếp theo.
    await publisher.publishAsync(`legacy-link/devices/${t.deviceId}/telemetry`, 'x'.repeat(16385), {
      qos: 0,
    });
    await lock.query('BEGIN');
    await lock.query("SELECT 1 FROM device WHERE device_id='BENCH-01' FOR UPDATE");
    const draining = { ...t, messageId: 'queue:drain' },
      drainLog = logs.length;
    await send(draining);
    await waitFor(
      () => logs.slice(drainLog).join('').includes('[MQTT] Nhan topic='),
      'drain sample admitted'
    );
    worker.kill('SIGTERM');
    await sleep(150);
    assert.equal(worker.exitCode, null); // Chưa được thoát trong khi transaction đang đợi.
    await lock.query('COMMIT');
    await waitFor(() => worker.exitCode !== null, 'graceful shutdown');
    assert.equal(worker.exitCode, 0);
    assert.ok(acks.some((a) => a.messageId === 'queue:drain' && a.status === 'committed'));
    assert.ok(logs.slice(drainLog).join('').includes('"oversized":1'));
    passed(
      'C12 bounded MQTT queue rejects without ACK, retry recovers, oversized payload blocked, SIGTERM drains accepted work'
    );
  } finally {
    await lock.query('ROLLBACK');
    lock.release();
  }

  await stop(worker);
  assert.equal((await request('/health/ready')).status, 503);
  assert.equal((await request('/health/live')).status, 200);
  const offline = { ...t, messageId: 'boot:offline', timestamp: now + 2 };
  await send(offline);
  await sleep(300); // Giả lập hàng đợi firmware vẫn giữ mẫu khi backend đang tắt.
  const restartLog = logs.length;
  worker = consumer();
  await waitFor(
    () => logs.slice(restartLog).join('').includes('Da subscribe:'),
    'consumer restart'
  );
  await acked(offline); // Sau khi backend hoạt động lại, firmware gửi lại nguyên mẫu cũ.
  passed('backend restart + simulated firmware outbox replay recovers sample');
  docker('stop', '-t', '1', pgName);
  assert.equal((await request('/health/ready')).status, 503);
  assert.equal((await request('/health/live')).status, 200);
  const failed = { ...t, messageId: 'boot:db-offline', timestamp: now + 3 };
  const before = acks.length,
    logStart = logs.length;
  await send(failed);
  await waitFor(
    () => logs.slice(logStart).join('').includes('[INGESTION] telemetry BENCH-01:'),
    'DB failure log'
  );
  assert.equal(
    acks.slice(before).some((a) => a.messageId === failed.messageId),
    false
  );
  assert.equal(worker.exitCode, null);
  docker('start', pgName);
  await waitFor(async () => {
    try {
      await pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }, 'DB restart');
  await acked(failed);
  assert.equal(
    (
      await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1', [
        `${t.gatewayId}:${failed.messageId}`,
      ])
    ).rows[0].n,
    1
  );
  passed('DB outage sends no success ACK; retry after recovery commits once');
  docker('stop', '-t', '1', mqName);
  await waitFor(
    async () => (await request('/health/ready')).status === 503,
    'broker outage readiness'
  );
  assert.equal((await request('/health/live')).status, 200);
  passed('C10 occupied port fails cleanly; broker outage changes readiness without killing HTTP');
  docker('start', mqName);
  await waitFor(
    async () => (await request('/health/ready')).status === 200,
    'readiness after broker reconnect'
  );
  publisher.reconnect();
  await new Promise((resolve, reject) => {
    publisher.once('connect', resolve);
    publisher.once('error', reject);
  });
  await publisher.subscribeAsync(`legacy-link/gateways/${t.gatewayId}/ingestion/ack`, { qos: 1 });
  await acked({ ...t, messageId: 'reconnect:verified' });
  passed(
    'C16 same consumer/API reconnect to broker with verified subscriptions, readiness and fresh committed ACK'
  );
  // Cắt riêng đường nhận ACK sau COMMIT; đây không chỉ là gửi trùng bình thường.
  const ackTopic = `legacy-link/gateways/${t.gatewayId}/ingestion/ack`;
  await publisher.unsubscribeAsync(ackTopic);
  const lostAck = { ...t, messageId: 'lost-ack:committed', timestamp: Date.now() };
  const ackCount = acks.length;
  await send(lostAck);
  await waitFor(async () => (await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1', [`${t.gatewayId}:${lostAck.messageId}`])).rows[0].n === 1, 'COMMIT while ACK receiver disconnected');
  await sleep(250);
  assert.equal(acks.length, ackCount, 'sender must not receive the first ACK');
  await publisher.subscribeAsync(ackTopic, {qos:1});
  await acked(lostAck);
  assert.equal((await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1', [`${t.gatewayId}:${lostAck.messageId}`])).rows[0].n, 1);
  passed('application ACK lost after COMMIT: exact replay receives committed ACK and leaves one row');

  const box = {capacity:32,pending:1,highWater:3,committed:20,failedEnqueues:0,attempts:2};
  const report = {schemaVersion:1,deviceId:t.deviceId,gatewayId:t.gatewayId,timestamp:Date.now(),configRequestId:'test-profile',samplingIntervalMs:2000,
    readings:[{key:'temperature',address:0,success:false,errorCode:226,sampledAt:Date.now()}],
    delivery:{storage:'RAM',bootId:'integration-boot',clockReady:true,freeHeapBytes:45000,telemetry:box,alarm:{...box,capacity:8,pending:0}}};
  await publisher.publishAsync(`legacy-link/devices/${t.deviceId}/diagnostics`,JSON.stringify(report),{qos:0});
  await waitFor(async()=>{
    const machine=await (await request(`/machines/${t.deviceId}`)).json();
    return machine.diagnostics?.delivery?.bootId==='integration-boot';
  },'firmware delivery diagnostics stored and exposed through HTTP');
  const machine=await (await request(`/machines/${t.deviceId}`)).json();
  assert.equal(machine.deliveryHealth,'backlog');
  assert.equal(machine.diagnostics.delivery.telemetry.pending,1);
  passed('MQTT delivery diagnostics -> database -> authenticated machine API');

  if (process.env.BENCHMARK_SAMPLES) {
    await stop(worker);
    Object.assign(process.env, { INGESTION_CONCURRENCY: '4', INGESTION_CAPACITY: '256' });
    const benchLog = logs.length;
    worker = consumer();
    await waitFor(
      () => logs.slice(benchLog).join('').includes('Da subscribe:'),
      'benchmark consumer'
    );
    const { loadBenchmark } = await import('./load-benchmark.mjs');
    await loadBenchmark({ pool, publisher, t, samples: Number(process.env.BENCHMARK_SAMPLES) });
  }
} catch (error) {
  console.error(error.message.replaceAll(password, '[redacted]'));
  console.error(logs.slice(-12).join(''));
  process.exitCode = 1;
} finally {
  if (publisher) await publisher.endAsync(true);
  for (const child of children) await stop(child);
  if (sourcePool) await sourcePool.end();
  if (pool) await pool.end();
  for (const name of containers.reverse()) {
    try {
      docker('rm', '-f', '-v', name);
    } catch {}
  }
}
