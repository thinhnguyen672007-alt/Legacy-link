// Tạo bí mật đúng một lần; giữ nguyên giá trị đã có. Không thực thi .env như shell.
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
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
for (const key of ['API_READ_TOKEN', 'API_WRITE_TOKEN']) {
  if (!/^[a-fA-F0-9]{32,128}$/.test(env[key])) throw new Error(`${key}: can 32–128 ky tu hex`);
}
if (env.API_READ_TOKEN === env.API_WRITE_TOKEN) throw new Error('Hai token phai khac nhau');
writeFileSync(path, text, { mode: 0o600 });
chmodSync(path, 0o600);
console.log('Da chuan bi .env; token duoc giu kin va khong thay khi chay lai.');
