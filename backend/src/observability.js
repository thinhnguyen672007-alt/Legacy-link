// Bộ đếm từ lúc tiến trình khởi động; không dùng ID thiết bị làm nhãn để tránh RAM tăng vô hạn.
import { performance } from 'node:perf_hooks';
const counters = {};
const latency = {
  count: 0,
  totalMs: 0,
  maxMs: 0,
  buckets: { le10: 0, le50: 0, le200: 0, le1000: 0, over1000: 0 },
};
export function count(name) {
  counters[name] = (counters[name] ?? 0) + 1;
}
export function startTiming(begin = performance.now()) {
  return () => {
    const ms = performance.now() - begin;
    latency.count++;
    latency.totalMs += ms;
    latency.maxMs = Math.max(latency.maxMs, ms);
    latency.buckets[
      ms <= 10
        ? 'le10'
        : ms <= 50
          ? 'le50'
          : ms <= 200
            ? 'le200'
            : ms <= 1000
              ? 'le1000'
              : 'over1000'
    ]++;
  };
}
export function snapshot() {
  return {
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    counters: { ...counters },
    receiveToSaveMs: {
      ...latency,
      buckets: { ...latency.buckets },
      meanMs: latency.count ? latency.totalMs / latency.count : 0,
    },
    memory: process.memoryUsage(),
  };
}
