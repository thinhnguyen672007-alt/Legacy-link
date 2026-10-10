import { randomUUID } from 'node:crypto';
import { fingerprint } from '../ingestion/identity.js';
import { createWorkQueue } from '../ingestion/queue.js';
import { ControlError, validGatewayId, validateConfig, validateReadings } from './validation.js';

const TERMINAL = new Set([
  'completed',
  'applied',
  'rejected',
  'timed_out',
  'publish_failed',
  'catalog_error',
]);
export class ControlService {
  constructor(client, { saveConfig, now = Date.now, timeoutMs = 45000, store = null } = {}) {
    this.subscribed = false;
    this.store = store;
    this.storageHealthy = true;
    this.writes = new Map();
    this.catalogWrites = new Map();
    this.incoming = createWorkQueue({
      concurrency: 4,
      capacity: 128,
      onError: (e) => console.warn('[CONTROL]', e.message),
    });
    client.on('close', () => {
      this.subscribed = false;
    });
    this.client = client;
    this.saveConfig = saveConfig;
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.gateways = new Map();
    this.operations = new Map();
    client.on('connect', () =>
      client.subscribe(
        [
          'legacy-link/gateways/+/state',
          'legacy-link/gateways/+/config/ack',
          'legacy-link/gateways/+/probe/result',
        ],
        { qos: 1 },
        (err, granted) => {
          this.subscribed = !err && granted?.length === 3 && granted.every((g) => g.qos !== 128);
          if (err) console.error('[CONTROL] Subscribe failed:', err.message);
        }
      )
    );
    client.on('message', (topic, bytes, packet) => {
      if (bytes.length <= 8192)
        this.incoming.submit(topic.split('/')[2], () => this.receive(topic, bytes, packet));
    });
    this.timer = setInterval(() => {
      void this.expire().catch((e) => console.warn('[CONTROL]', e.message));
    }, 1000);
    this.timer.unref?.();
  }
  async close() {
    clearInterval(this.timer);
    this.incoming.stop();
    await this.incoming.drain();
    await Promise.allSettled([...this.writes.values()]);
    this.client.end();
  }
  async persist(op) {
    if (!this.store) return;
    const snapshot = structuredClone(op);
    const promise = (this.writes.get(op.id) ?? Promise.resolve())
      .catch(() => {})
      .then(() => this.store.save(snapshot));
    this.writes.set(op.id, promise);
    try {
      await promise;
      this.storageHealthy = true;
    } catch (e) {
      this.storageHealthy = false;
      throw e;
    } finally {
      if (this.writes.get(op.id) === promise) this.writes.delete(op.id);
    }
  }
  changed(op) {
    void this.persist(op).catch((e) =>
      console.warn('[CONTROL] Không lưu được trạng thái:', e.message)
    );
  }
  async expire() {
    for (const [id, op] of this.operations) {
      if (
        op.phase !== 'saving_catalog' &&
        !TERMINAL.has(op.phase) &&
        this.now() - op.startedAt > this.timeoutMs
      ) {
        op.phase = 'timed_out';
        op.error =
          op.kind === 'apply'
            ? 'No final acknowledgement. Application outcome is unknown; check gateway state before retrying.'
            : 'ESP32 did not finish the test read in time.';
        await this.persist(op);
      }
      if (this.now() - op.startedAt > 3600000) this.operations.delete(id);
    }
    for (const [id, gateway] of this.gateways)
      if (this.now() - gateway.receivedAt > 3600000) this.gateways.delete(id);
  }
  listGateways() {
    return [...this.gateways.values()].map((g) => ({
      ...g,
      online:
        this.client.connected &&
        this.now() - g.receivedAt < 35000 &&
        this.now() - g.timestamp < 35000,
    }));
  }
  async getOperation(id) {
    if (this.store) {
      await this.writes.get(id);
      const saved = await this.store.load(id);
      if (saved) this.operations.set(id, saved);
    }
    const pending = this.operations.get(id);
    if (pending?.phase === 'saving_catalog') await this.finishCatalog(pending);
    await this.expire();
    const op = this.operations.get(id) ?? (this.store ? await this.store.load(id) : null);
    if (!op)
      throw new ControlError('Operation not found or expired; inspect the gateway state', 404);
    const gateway = this.gateways.get(op.gatewayId);
    return {
      ...op,
      restoredAfterRestart:
        op.kind === 'apply' &&
        !!op.persisted &&
        !!gateway &&
        gateway.persisted &&
        gateway.configRequestId === op.id &&
        gateway.restored &&
        gateway.bootId !== op.bootId &&
        this.now() - gateway.timestamp < 35000 &&
        this.now() - gateway.receivedAt < 35000,
    };
  }
  async start(gatewayId, kind, body) {
    await this.expire();
    if (!['probe', 'apply'].includes(kind)) throw new ControlError('Invalid operation kind');
    if (!validGatewayId(gatewayId)) throw new ControlError('Invalid gateway ID');
    if (!this.client.connected)
      throw new ControlError('HTTP server is disconnected from MQTT', 503);
    const gateway = this.listGateways().find((g) => g.gatewayId === gatewayId && g.online);
    if (!gateway)
      throw new ControlError(
        'Gateway is not reporting. Connect the updated ESP32 firmware first.',
        409
      );
    if (this.store)
      for (const old of [...this.operations.values()].filter(
        (op) => op.gatewayId === gatewayId && !TERMINAL.has(op.phase)
      ))
        await this.getOperation(old.id);
    if (
      [...this.operations.values()].some(
        (op) => op.gatewayId === gatewayId && !TERMINAL.has(op.phase)
      )
    )
      throw new ControlError('This gateway is busy with another operation', 409);
    // Lịch sử đã nằm trong DB: bỏ cache terminal cũ thay vì khóa API sau 200 thao tác.
    if (this.store && this.operations.size >= 200)
      for (const [id, old] of this.operations) {
        if (TERMINAL.has(old.phase)) this.operations.delete(id);
        if (this.operations.size < 200) break;
      }
    if (this.operations.size >= 200)
      throw new ControlError('Operation capacity reached; retry later', 503);
    const config = validateConfig(body?.config);
    if (
      [...this.gateways.values()].some(
        (g) => g.gatewayId !== gatewayId && g.deviceId === config.deviceId
      )
    )
      throw new ControlError(
        'Another gateway reports this machine ID. Choose a unique machine ID.',
        409
      );
    if (kind === 'apply') {
      const probe = this.store
        ? await this.store.load(body.probeRequestId ?? '')
        : this.operations.get(body.probeRequestId);
      if (
        !probe ||
        probe.kind !== 'probe' ||
        probe.phase !== 'completed' ||
        probe.gatewayId !== gatewayId ||
        probe.bootId !== gateway.bootId ||
        this.now() - probe.finishedAt > 60000 ||
        fingerprint(probe.config) !== fingerprint(config)
      )
        throw new ControlError('Read this exact configuration again before applying it', 409);
      if (probe.readings.some((row) => !row.success))
        throw new ControlError('Resolve failed register reads before applying', 409);
      if (probe.readings.some((row) => !row.withinRange) && body.acceptWarnings !== true)
        throw new ControlError('Confirm the out-of-range readings before applying', 409);
    }
    const op = {
      id: randomUUID(),
      gatewayId,
      kind,
      config,
      bootId: gateway.bootId,
      phase: 'sending',
      received: false,
      persisted: false,
      startedAt: this.now(),
      machineType:
        typeof body.machineType === 'string' && body.machineType.trim()
          ? body.machineType.trim().slice(0, 80)
          : 'Modbus machine',
    };
    // Lưu ý định và giành khóa TRƯỚC publish; DB lỗi thì không gửi lệnh.
    if (this.store) await this.store.begin(op, this.now() + this.timeoutMs + 5000);
    this.operations.set(op.id, op);
    const command = JSON.stringify({
      ...config,
      requestId: op.id,
      expectedBootId: gateway.bootId,
      expiresAt: this.now() + this.timeoutMs,
      ...(kind === 'apply' ? { expectedConfigRequestId: gateway.configRequestId } : {}),
    });
    const failPublish = (err) => {
      if (!err) return false;
      if (!TERMINAL.has(op.phase)) {
        op.phase = 'publish_failed';
        op.error = 'MQTT publication failed; check gateway state before retrying';
        this.changed(op);
      }
      return true;
    };
    const publishCommand = (err) => {
      if (failPublish(err) || TERMINAL.has(op.phase)) return;
      this.client.publish(
        `legacy-link/gateways/${gatewayId}/${kind === 'probe' ? 'probe' : 'config'}`,
        command,
        { qos: 1, retain: false },
        (publishError) => {
          if (failPublish(publishError) || TERMINAL.has(op.phase)) return;
          if (op.phase === 'sending') {
            op.phase = 'sent';
            this.changed(op);
          }
        }
      );
    };
    if (kind === 'apply') {
      // Xóa cấu hình retained cũ trước khi ESP32 kết nối lại với danh tính mới.
      // Nếu giữ lại, broker có thể gửi cấu hình cũ và làm mất cấu hình vừa áp dụng.
      this.client.publish(
        `legacy-link/gateways/${gatewayId}/config`,
        '',
        { qos: 1, retain: true },
        (err) => {
          if (failPublish(err) || TERMINAL.has(op.phase)) return;
          this.client.publish(
            `legacy-link/devices/${config.deviceId}/config`,
            '',
            { qos: 1, retain: true },
            publishCommand
          );
        }
      );
    } else publishCommand();
    await this.writes.get(op.id);
    return this.getOperation(op.id);
  }
  async receive(topic, bytes, packet = {}) {
    if (bytes.length > 8192) return;
    const match = /^legacy-link\/gateways\/([A-F0-9]{12})\/(state|config\/ack|probe\/result)$/.exec(
      topic
    );
    if (!match) return;
    let data;
    try {
      data = JSON.parse(bytes.toString());
    } catch {
      return;
    }
    if (
      !data ||
      data.schemaVersion !== 1 ||
      data.gatewayId !== match[1] ||
      typeof data.bootId !== 'string' ||
      data.bootId.length > 32
    )
      return;
    if (match[2] === 'state') {
      if (
        !Number.isSafeInteger(data.timestamp) ||
        data.timestamp < Date.UTC(2020, 0, 1) ||
        data.timestamp > this.now() + 60000 ||
        typeof data.persisted !== 'boolean' ||
        typeof data.restored !== 'boolean' ||
        typeof data.configRequestId !== 'string'
      )
        return;
      const old = this.gateways.get(data.gatewayId);
      if (old && data.timestamp < old.timestamp) return;
      this.gateways.set(data.gatewayId, {
        gatewayId: data.gatewayId,
        bootId: data.bootId,
        deviceId: typeof data.deviceId === 'string' ? data.deviceId : null,
        configRequestId: data.configRequestId,
        persisted: data.persisted,
        restored: data.restored,
        timestamp: data.timestamp,
        receivedAt: this.now(),
      });
      return;
    }
    // Phản hồi retained hoặc không khớp request không được dùng để xác nhận một thao tác mới.
    if (packet.retain || typeof data.requestId !== 'string') return;
    await this.writes.get(data.requestId);
    const op = this.store
      ? await this.store.load(data.requestId)
      : this.operations.get(data.requestId);
    if (op) {
      this.operations.set(op.id, op);
      await this.expire();
    }
    if (
      !op ||
      op.gatewayId !== data.gatewayId ||
      op.bootId !== data.bootId ||
      [
        'completed',
        'applied',
        'catalog_error',
        'rejected',
        'saving_catalog',
        'timed_out',
        'publish_failed',
      ].includes(op.phase)
    )
      return;
    if (data.result === 'received') {
      op.received = true;
      op.phase = 'received';
      await this.persist(op);
      return;
    }
    if (data.result === 'rejected') {
      op.phase = 'rejected';
      op.error = data.reason;
      await this.persist(op);
      return;
    }
    if (
      op.kind === 'probe' &&
      match[2] === 'probe/result' &&
      data.result === 'completed' &&
      data.deviceId === op.config.deviceId
    ) {
      op.readings = validateReadings(data.readings, op.config);
      op.received = true;
      op.phase = 'completed';
      op.finishedAt = this.now();
      await this.persist(op);
    } else if (
      op.kind === 'apply' &&
      match[2] === 'config/ack' &&
      ['applied', 'unchanged'].includes(data.result) &&
      data.deviceId === op.config.deviceId &&
      typeof data.persisted === 'boolean'
    ) {
      op.received = true;
      op.persisted = data.persisted;
      op.applied = true;
      op.phase = 'saving_catalog';
      op.finishedAt = this.now();
      // Snapshot phản hồi cho phép người vận hành biết firmware đã apply kể cả DB đang lỗi.
      await this.persist(op);
      await this.finishCatalog(op);
    }
  }
  // GET operation tiếp tục phần ghi catalog nếu API dừng sau khi lưu ACK.
  // Không gửi lại lệnh ESP32: chỉ hoàn thành công việc database đã có bằng chứng.
  async finishCatalog(op) {
    if (this.catalogWrites.has(op.id)) return this.catalogWrites.get(op.id);
    const task = (async () => {
      try {
        await this.saveConfig(op.config, op.machineType, op.gatewayId, op.id);
        op.phase = 'applied';
        if (!op.persisted)
          op.error =
            'Applied in RAM, but ESP32 flash storage failed. It may be lost after restart.';
      } catch {
        op.phase = 'catalog_error';
        op.error =
          'ESP32 applied; catalog could not be saved safely. Inspect gateway and probe again.';
      }
      await this.persist(op);
    })();
    this.catalogWrites.set(op.id, task);
    try {
      await task;
    } finally {
      this.catalogWrites.delete(op.id);
    }
  }
}
