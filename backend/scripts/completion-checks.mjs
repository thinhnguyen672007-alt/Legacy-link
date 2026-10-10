// Regression có DB thật cho phần hoàn thiện: khóa chung, restart, profile và retention.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { ControlService } from '../src/control/service.js';
import { operationStore } from '../src/db/operations.js';
import { createConfigRequest } from '../src/db/config-request.js';
import { saveAppliedConfig } from '../src/db/provisioning.js';
import { runRetention } from '../src/db/retention.js';
import { schemaStatus } from '../src/db/schema-version.js';
export async function completionChecks({ pool, t, cfg, saveTelemetry, passed }) {
  const services = [];
  function service() {
    const mqtt = new EventEmitter();
    mqtt.connected = true;
    mqtt.end = () => {};
    mqtt.publish = (_topic, _body, _opts, cb) => cb();
    const value = new ControlService(mqtt, {
      saveConfig: saveAppliedConfig,
      store: operationStore,
    });
    services.push(value);
    return value;
  }
  const state = (s) =>
    s.receive(
      `legacy-link/gateways/${t.gatewayId}/state`,
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          gatewayId: t.gatewayId,
          bootId: 'completion-boot',
          timestamp: Date.now(),
          deviceId: t.deviceId,
          configRequestId: '',
          persisted: true,
          restored: false,
        })
      )
    );
  const reply = (s, kind, body) =>
    s.receive(
      `legacy-link/gateways/${t.gatewayId}/${kind}`,
      Buffer.from(
        JSON.stringify({
          schemaVersion: 1,
          gatewayId: t.gatewayId,
          bootId: 'completion-boot',
          ...body,
        })
      )
    );
  try {
    const a = service(),
      b = service();
    await state(a);
    await state(b);
    const race = await Promise.allSettled([
      a.start(t.gatewayId, 'probe', { config: cfg }),
      b.start(t.gatewayId, 'probe', { config: cfg }),
    ]);
    assert.equal(race.filter((x) => x.status === 'fulfilled').length, 1);
    const winner = race.find((x) => x.status === 'fulfilled').value;
    await assert.rejects(
      () =>
        createConfigRequest({
          requestId: 'legacy-conflict',
          deviceId: t.deviceId,
          gatewayId: t.gatewayId,
          payload: cfg,
        }),
      (e) => e.status === 409
    );
    // Process mới nhận kết quả từ op đã lưu: RAM cũ không cần tồn tại.
    const recovered = service();
    await state(recovered);
    await reply(recovered, 'probe/result', {
      requestId: winner.id,
      deviceId: t.deviceId,
      result: 'completed',
      readings: [
        {
          key: 'temperature',
          address: 1,
          success: true,
          errorCode: 0,
          sampledAt: Date.now(),
          rawValue: 250,
          value: 25,
          rawWords: [250],
        },
      ],
    });
    assert.equal((await recovered.getOperation(winner.id)).phase, 'completed');
    const apply = await recovered.start(t.gatewayId, 'apply', {
      config: cfg,
      probeRequestId: winner.id,
    });
    const afterRestart = service();
    await state(afterRestart);
    await reply(afterRestart, 'config/ack', {
      requestId: apply.id,
      deviceId: t.deviceId,
      result: 'applied',
      persisted: true,
    });
    assert.equal((await afterRestart.getOperation(apply.id)).phase, 'applied');
    assert.equal((await operationStore.load(apply.id)).phase, 'applied');
    // Callback publish từ process cũ đến trễ không được làm applied trở lại sent.
    await operationStore.save({ ...apply, phase: 'sent' });
    assert.equal((await operationStore.load(apply.id)).phase, 'applied');
    assert.equal((await a.getOperation(winner.id)).phase, 'completed');
    // Giả lập chết đúng giữa ACK đã lưu và ghi catalog: không cần publish lại ESP32.
    const interrupted = {
      ...apply,
      id: 'interrupted-catalog',
      phase: 'saving_catalog',
      persisted: true,
      startedAt: Date.now() + 1,
    };
    await operationStore.begin(interrupted, Date.now() + 50000);
    assert.equal((await service().getOperation(interrupted.id)).phase, 'applied');
    // Ngược lại, snapshot cũ không được ghi đè catalog sau thao tác mới.
    const stale = { ...interrupted, id: 'stale-catalog', startedAt: apply.startedAt - 1000 };
    await operationStore.begin(stale, Date.now() + 50000);
    assert.equal((await service().getOperation(stale.id)).phase, 'catalog_error');
    passed(
      'C16 shared gateway lease blocks parallel APIs and legacy dispatch; DB operations recover after API restart'
    );
    const reserved = {
      ...apply,
      id: 'reserved-device',
      gatewayId: 'AAAAAAAAAAAA',
      phase: 'sending',
      config: { ...apply.config, deviceId: 'NEW-RESERVED' },
      startedAt: Date.now(),
    };
    await operationStore.begin(reserved, Date.now() + 50000);
    await assert.rejects(
      () =>
        operationStore.begin(
          { ...reserved, id: 'conflicting-device', gatewayId: 'BBBBBBBBBBBB' },
          Date.now() + 50000
        ),
      (e) => e.status === 409
    );
    await operationStore.save({ ...reserved, phase: 'rejected' });
    await assert.rejects(
      () =>
        operationStore.begin(
          { ...reserved, id: 'steal-existing', config: apply.config },
          Date.now() + 50000
        ),
      (e) => e.status === 409
    );
    await assert.rejects(
      () => saveAppliedConfig(cfg, 'Wrong gateway', 'AAAAAAAAAAAA', 'steal-direct'),
      (e) => e.status === 409
    );
    assert.equal(
      (await pool.query('SELECT gateway_id FROM device WHERE device_id=$1', [t.deviceId])).rows[0]
        .gateway_id,
      t.gatewayId
    );
    passed('C16 device ID reservation blocks two gateways and preserves registered ownership');
    const sample = { ...t, messageId: 'retention:sample' };
    await saveTelemetry(sample);
    await pool.query(
      "UPDATE telemetry SET received_at=now()-interval '31 days' WHERE message_id=$1",
      [`${t.gatewayId}:${sample.messageId}`]
    );
    const dry = await runRetention();
    assert.equal(dry.tables.telemetry, 1);
    assert.equal(
      (
        await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1', [
          `${t.gatewayId}:${sample.messageId}`,
        ])
      ).rows[0].n,
      1
    );
    assert.equal((await runRetention({ dryRun: false })).tables.telemetry, 1);
    assert.equal((await saveTelemetry(sample)).inserted, false);
    assert.equal(
      (
        await pool.query('SELECT count(*)::int n FROM telemetry WHERE message_id=$1', [
          `${t.gatewayId}:${sample.messageId}`,
        ])
      ).rows[0].n,
      0
    );
    passed(
      'C16 retention dry-run does not delete; apply removes old data while receipt blocks duplicate resurrection'
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('ALTER TABLE device_profile RENAME COLUMN config TO hidden_config');
      const schema = await schemaStatus(client);
      assert.equal(schema.ready, false);
      assert.ok(schema.missing.includes('device_profile.config'));
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    assert.equal((await schemaStatus(pool)).ready, true);
    passed('C16 schema readiness rejects missing real columns even with version marker');
  } finally {
    await Promise.all(services.map((s) => s.close()));
  }
}
