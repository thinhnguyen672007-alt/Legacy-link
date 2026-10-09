import test from 'node:test';
import assert from 'node:assert/strict';
import { createSecurity, securitySettings } from './security.js';
import { createHttpHandler } from './handler.js';
const env = { API_READ_TOKEN: 'r'.repeat(32), API_WRITE_TOKEN: 'w'.repeat(32), CORS_ORIGINS: 'http://localhost:5173' };
test('C15 fail closed: thiếu token, token trùng hoặc tắt auth ngoài loopback đều lỗi', () => {
  assert.throws(() => securitySettings({}));
  assert.throws(() => securitySettings({ ...env, API_READ_TOKEN: env.API_WRITE_TOKEN }));
  assert.throws(() => securitySettings({ API_AUTH_DISABLED: 'true', HTTP_HOST: '0.0.0.0' }));
  assert.throws(() => securitySettings({ API_AUTH_DISABLED: 'true', HTTP_HOST: '127.0.0.1', NODE_ENV: 'production' }));
  assert.equal(securitySettings({ API_AUTH_DISABLED: 'true', HTTP_HOST: '127.0.0.1' }).disabled, true);
  assert.throws(() => securitySettings({ ...env, CORS_ORIGINS: '*' }));
});
test('C15 handler thật chặn thiếu quyền trước tác dụng phụ, CORS không thay xác thực', async () => {
  let writes = 0;
  const handler = createHttpHandler({ security: createSecurity(securitySettings(env)), listMachines: () => [],
    acknowledgeAlarm: () => { writes++; return { acknowledged: true }; } });
  async function request(method, path, headers = {}) {
    const req = { method, url: path, headers };
    const res = { statusCode: 200, headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(body) { this.body=body; this.headersSent=true; } };
    await handler(req,res); return res;
  }
  const auth = token => ({ authorization: `Bearer ${token}` });
  assert.equal((await request('GET','/machines')).statusCode,401);
  assert.equal((await request('GET','/machines',auth('wrong'))).statusCode,401);
  assert.equal((await request('GET','/machines',auth(env.API_READ_TOKEN))).statusCode,200);
  assert.equal((await request('POST','/alarms/1/ack',auth(env.API_READ_TOKEN))).statusCode,403);
  assert.equal(writes,0);
  assert.equal((await request('POST','/alarms/1/ack',auth(env.API_WRITE_TOKEN))).statusCode,200);
  assert.equal(writes,1);
  assert.equal((await request('GET','/machines',{...auth(env.API_WRITE_TOKEN),origin:'https://evil.example'})).statusCode,403);
  const preflight=await request('OPTIONS','/alarms/1/ack',{origin:'http://localhost:5173'});
  assert.equal(preflight.statusCode,204); assert.equal(writes,1);
  assert.equal(preflight.headers['Access-Control-Allow-Origin'],'http://localhost:5173');
  assert.equal((await request('GET','/health/live')).statusCode,200);
});
