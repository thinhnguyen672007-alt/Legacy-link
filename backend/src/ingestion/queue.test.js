import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkQueue } from './queue.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
test('C12 giới hạn công việc, không ACK/không chạy việc bị từ chối; drain chờ việc đang chạy', async () => {
  const queue = createWorkQueue({ concurrency: 2, capacity: 3 });
  const release = [], ran = [];
  const work = id => () => new Promise(resolve => { ran.push(id); release.push(resolve); });
  assert.equal(queue.submit('a', work(1)), true);
  assert.equal(queue.submit('a', work(2)), true);
  assert.equal(queue.submit('b', work(3)), true);
  assert.equal(queue.submit('c', work(4)), false);
  await tick(); assert.deepEqual(ran, [1, 3]);
  assert.equal(queue.stats().active, 2); assert.equal(queue.stats().queued, 1);
  queue.stop(); assert.equal(queue.submit('d', work(5)), false);
  let drained = false; const done = queue.drain().then(() => { drained = true; });
  await tick(); assert.equal(drained, false);
  release.shift()(); await tick(); assert.deepEqual(ran, [1, 3, 2]);
  release.splice(0).forEach(resolve => resolve()); await done;
  assert.equal(queue.stats().completed, 3); assert.equal(queue.stats().rejected, 2);
});
test('C12 handler lỗi không khóa hàng đợi; việc kế tiếp vẫn chạy', async () => {
  const errors = [], ran = [];
  const queue = createWorkQueue({ concurrency: 1, capacity: 2, onError: e => errors.push(e.message) });
  queue.submit('a', () => { throw new Error('test'); });
  queue.submit('a', () => ran.push('ok'));
  await queue.drain(); assert.deepEqual(errors, ['test']); assert.deepEqual(ran, ['ok']);
});
test('C12 cấu hình queue vô lý bị từ chối ngay', () => {
  assert.throws(() => createWorkQueue({ concurrency: 4, capacity: 2 }));
});
