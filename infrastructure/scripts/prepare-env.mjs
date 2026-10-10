// Tạo bí mật đúng một lần; giữ nguyên giá trị đã có. Không thực thi .env như shell.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
const path = fileURLToPath(new URL('../.env', import.meta.url));
const fresh = !existsSync(path);
let text = readFileSync(!fresh ? path : new URL('../.env.example', import.meta.url), 'utf8');
const env = parseEnv(text);
if (fresh) for (const key of ['POSTGRES_PASS', 'MQTT_DEV_PASS']) {
  env[key] = randomBytes(24).toString('hex');
  text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${env[key]}`);
}
for (const key of ['API_READ_TOKEN', 'API_WRITE_TOKEN']) {
  if (env[key]) continue;
  env[key] = randomBytes(32).toString('hex');
  const line = `${key}=${env[key]}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  text = pattern.test(text) ? text.replace(pattern, line) : text + '\n' + line + '\n';
}
if (!env.ADMIN_USERNAME) {
  env.ADMIN_USERNAME = 'admin';
  text = /^ADMIN_USERNAME=.*$/m.test(text)
    ? text.replace(/^ADMIN_USERNAME=.*$/m, 'ADMIN_USERNAME=admin')
    : text + '\nADMIN_USERNAME=admin\n';
}
if (!env.ADMIN_PASSWORD) {
  env.ADMIN_PASSWORD = randomBytes(24).toString('hex');
  const line = `ADMIN_PASSWORD=${env.ADMIN_PASSWORD}`;
  text = /^ADMIN_PASSWORD=.*$/m.test(text)
    ? text.replace(/^ADMIN_PASSWORD=.*$/m, line)
    : text + '\n' + line + '\n';
}
if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{2,47}$/.test(env.ADMIN_USERNAME || '')) throw new Error('ADMIN_USERNAME không hợp lệ');
if (env.ADMIN_PASSWORD.length < 12 || Buffer.byteLength(env.ADMIN_PASSWORD) > 256) throw new Error('ADMIN_PASSWORD cần 12–256 bytes');
for (const key of ['POSTGRES_USER', 'POSTGRES_PASS', 'POSTGRES_DB'])
  if (!/^[a-zA-Z0-9_.~-]+$/.test(env[key] || '')) throw new Error(`${key} không hợp lệ cho DATABASE_URL`);
const frontendPort = Number(env.FRONTEND_PORT || 8080);
if (!Number.isInteger(frontendPort) || frontendPort < 1 || frontendPort > 65535) throw new Error('FRONTEND_PORT không hợp lệ');
if (env.DEMO_LAN_IP && isIP(env.DEMO_LAN_IP) !== 4) throw new Error('DEMO_LAN_IP phải là IPv4 của máy Linux');
const origins = new Set((env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean));
for (const host of ['localhost', '127.0.0.1', env.DEMO_LAN_IP].filter(Boolean))
  origins.add(`http://${host}:${frontendPort}`);
env.CORS_ORIGINS = [...origins].join(',');
text = /^CORS_ORIGINS=.*$/m.test(text)
  ? text.replace(/^CORS_ORIGINS=.*$/m, `CORS_ORIGINS=${env.CORS_ORIGINS}`)
  : text + '\nCORS_ORIGINS=' + env.CORS_ORIGINS + '\n';
for (const key of ['API_READ_TOKEN', 'API_WRITE_TOKEN']) {
  if (!/^[a-fA-F0-9]{32,128}$/.test(env[key])) throw new Error(`${key}: can 32–128 ky tu hex`);
}
if (env.API_READ_TOKEN === env.API_WRITE_TOKEN) throw new Error('Hai token phai khac nhau');
for (const origin of (env.CORS_ORIGINS || '').split(',').map(x=>x.trim()).filter(Boolean)) {
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin) throw new Error('CORS_ORIGINS phai la origin cu the');
}
const timeout = Number(env.SHUTDOWN_TIMEOUT_MS || 15000);
if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new Error('Invalid shutdown timeout');
writeFileSync(path, text, { mode: 0o600 });
chmodSync(path, 0o600);
console.log('Da chuan bi .env; token duoc giu kin va khong thay khi chay lai.');
