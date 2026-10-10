// Dùng Nginx thật và HTTP handler/auth thật; dữ liệu máy được giả lập, không mở DB demo.
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHttpHandler } from '../src/http/handler.js';
import { createSecurity } from '../src/http/security.js';
const name = `legacy-proxy-test-${randomUUID().slice(0, 8)}`;
const folder = mkdtempSync(join(tmpdir(), 'legacy-proxy-'));
const readToken = randomUUID(),
  writeToken = randomUUID();
const api = http.createServer(
  createHttpHandler({
    security: createSecurity({ readToken, writeToken, origins: ['http://localhost:5173'] }),
    listMachines: async () => [],
    copilot: async (body, identity) => {
      assert.equal(body.action, 'underheat');
      assert.equal(identity, `Bearer ${readToken}`);
      return { mode: 'rules', results: [] };
    },
    acknowledgeAlarm: async () => ({ acknowledged: true }),
  })
);
function docker(...args) {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 120000 });
  if (result.status !== 0) throw new Error(result.stderr || 'Docker command failed');
  return result.stdout.trim();
}
try {
  await new Promise((resolve) => api.listen(0, '127.0.0.1', resolve));
  const reserve = http.createServer();
  await new Promise((resolve) => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const template = readFileSync(new URL('../deploy/nginx.conf', import.meta.url), 'utf8')
    .replace('listen 80;', `listen 127.0.0.1:${port};`)
    .replace('http://api:3000', `http://127.0.0.1:${api.address().port}`);
  writeFileSync(join(folder, 'default.conf'), template);
  // Host network chỉ phục vụ bài test Linux; cấu hình triển khai thật dùng Docker network.
  docker('create', '--name', name, '--network', 'host', 'nginx:1.27-alpine');
  docker('cp', join(folder, 'default.conf'), `${name}:/etc/nginx/conf.d/default.conf`);
  docker('start', name);
  const url = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url + '/health/live')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Nginx phải khởi động thành công');
  assert.equal((await fetch(url + '/machines')).status, 401);
  const response = await fetch(url + '/machines', {
    headers: { Authorization: `Bearer ${readToken}`, Origin: 'http://localhost:5173' },
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  assert.equal(
    (
      await fetch(url + '/alarms/1/ack', {
        method: 'POST',
        headers: { Authorization: `Bearer ${readToken}` },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await fetch(url + '/alarms/1/ack', {
        method: 'POST',
        headers: { Authorization: `Bearer ${writeToken}` },
      })
    ).status,
    200
  );
  const ai = await fetch(url + '/ai/query', {
    method: 'POST', headers: { Authorization: `Bearer ${readToken}`, Origin: 'http://localhost:5173', 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'underheat' }),
  });
  assert.equal(ai.status, 200);
  assert.equal((await ai.json()).mode, 'rules');
  assert.equal(ai.headers.get('Access-Control-Allow-Origin'), 'http://localhost:5173');
  console.log('PASS Nginx preserves read-token authorization and JSON body for AI read-only POST');
  console.log(
    'PASS Nginx forwards Authorization and CORS; read/write roles remain enforced through proxy'
  );
} finally {
  try {
    docker('rm', '-f', name);
  } catch {}
  api.closeAllConnections();
  await new Promise((resolve) => api.close(resolve));
  rmSync(folder, { recursive: true, force: true });
}
