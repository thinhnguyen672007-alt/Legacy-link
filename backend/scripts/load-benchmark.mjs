// Đo MQTT publish -> ACK ứng dụng cho nguồn giả lập; bao gồm mạng, queue, DB và ACK.
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
export async function loadBenchmark({ pool, publisher, t, samples }) {
  const devices = 4,
    concurrency = 8,
    times = [],
    pending = new Map();
  let next = 0;
  for (let n = 0; n < devices; n++)
    await pool.query(
      `INSERT INTO device(device_id,machine_type,gateway_id,applied_config)
 SELECT $1,machine_type,gateway_id,jsonb_set(applied_config,'{deviceId}',to_jsonb($1::text)) FROM device WHERE device_id=$2`,
      [`LOAD-${n}`, t.deviceId]
    );
  function onMessage(_topic, bytes) {
    let ack;
    try {
      ack = JSON.parse(bytes);
    } catch {
      return;
    }
    pending.get(ack.messageId)?.(ack);
  }
  publisher.on('message', onMessage);
  const start = performance.now();
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (next < samples) {
          const index = next++,
            id = `load:${index}`,
            begin = performance.now();
          const event = {
            ...t,
            deviceId: `LOAD-${index % devices}`,
            messageId: id,
            timestamp: Date.now(),
          };
          const ack = new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error('Benchmark ACK deadline'));
            }, 10000);
            pending.set(id, (value) => {
              clearTimeout(timer);
              pending.delete(id);
              value.status === 'committed'
                ? resolve()
                : reject(new Error('Benchmark sample rejected'));
            });
          });
          // Bắt rejection ngay để lỗi publish không tạo unhandled Promise.
          const publish = publisher.publishAsync(
            `legacy-link/devices/${event.deviceId}/telemetry`,
            JSON.stringify(event),
            { qos: 0 }
          );
          await Promise.all([publish, ack]);
          times.push(performance.now() - begin);
        }
      })
    );
    const elapsed = performance.now() - start;
    times.sort((a, b) => a - b);
    const stored = (
      await pool.query("SELECT count(*)::int n FROM telemetry WHERE device_id LIKE 'LOAD-%'")
    ).rows[0].n;
    assert.equal(stored, samples);
    const report = {
      samples,
      simulatedDevices: devices,
      concurrency,
      stored,
      elapsedMs: Math.round(elapsed),
      samplesPerSecond: Number((samples / (elapsed / 1000)).toFixed(1)),
      publishToCommittedAckMs: {
        p50: times[Math.floor(times.length * 0.5)],
        p95: times[Math.floor(times.length * 0.95)],
        max: times.at(-1),
      },
    };
    console.log('BENCHMARK ' + JSON.stringify(report));
    return report;
  } finally {
    publisher.off('message', onMessage);
  }
}
