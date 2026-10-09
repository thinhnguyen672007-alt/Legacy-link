// C12: giới hạn cả việc đang chạy lẫn việc đang chờ. Cùng thiết bị chạy tuần tự.
// Queue trong RAM không phải kho bền vững: từ chối nhận việc thì tuyệt đối không ACK committed.
export function createWorkQueue({ concurrency = 4, capacity = 256, onError = console.error } = {}) {
  if (!Number.isInteger(concurrency) || concurrency < 1 || !Number.isInteger(capacity) || capacity < concurrency) {
    throw new Error('Queue capacity phải >= concurrency và là số nguyên dương');
  }
  const pending = [], keys = new Set(), waiters = [];
  let active = 0, accepting = true, rejected = 0, completed = 0;
  function pump() {
    while (active < concurrency) {
      const index = pending.findIndex(job => !keys.has(job.key));
      if (index < 0) break;
      const job = pending.splice(index, 1)[0];
      active++; keys.add(job.key);
      Promise.resolve().then(job.run).catch(error => {
        try { onError(error); } catch { /* Log lỗi cũng không được làm chết queue. */ }
      }).finally(() => {
        active--; completed++; keys.delete(job.key); pump();
        if (!active && !pending.length) waiters.splice(0).forEach(resolve => resolve());
      });
    }
  }
  return {
    submit(key, run) {
      if (!accepting || active + pending.length >= capacity) { rejected++; return false; }
      pending.push({ key, run }); pump(); return true;
    },
    stop() { accepting = false; },
    drain() { return active || pending.length ? new Promise(resolve => waiters.push(resolve)) : Promise.resolve(); },
    stats() { return { active, queued: pending.length, capacity, rejected, completed, accepting }; },
  };
}
