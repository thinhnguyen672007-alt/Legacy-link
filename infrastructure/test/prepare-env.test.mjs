import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseEnv } from 'node:util';

test('prepares old env once and adds the selected LAN origin without rotating secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'legacy-env-'));
  try {
    const scripts = join(dir, 'scripts');
    mkdirSync(scripts);
    copyFileSync(new URL('../scripts/prepare-env.mjs', import.meta.url), join(scripts, 'prepare-env.mjs'));
    const template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    writeFileSync(join(dir, '.env'), template
      .replace(/^ADMIN_USERNAME=.*\n/m, '')
      .replace(/^ADMIN_PASSWORD=.*\n/m, '')
      .replace(/^DEMO_LAN_IP=.*\n/m, '')
      .replace(/^CORS_ORIGINS=.*$/m, 'CORS_ORIGINS=http://localhost:5173'));
    const run = () => execFileSync(process.execPath, [join(scripts, 'prepare-env.mjs')], { stdio: 'ignore' });
    run();
    const first = parseEnv(readFileSync(join(dir, '.env'), 'utf8'));
    assert.equal(first.ADMIN_USERNAME, 'admin');
    assert.ok(first.ADMIN_PASSWORD.length >= 12);
    assert.ok(first.CORS_ORIGINS.includes('http://127.0.0.1:8080'));
    writeFileSync(join(dir, '.env'), readFileSync(join(dir, '.env'), 'utf8') + '\nDEMO_LAN_IP=192.168.1.20\n');
    run();
    const second = parseEnv(readFileSync(join(dir, '.env'), 'utf8'));
    assert.equal(second.ADMIN_PASSWORD, first.ADMIN_PASSWORD);
    assert.equal(second.MQTT_DEV_PASS, first.MQTT_DEV_PASS);
    assert.ok(second.CORS_ORIGINS.includes('http://192.168.1.20:8080'));
    run();
    assert.equal(readFileSync(join(dir, '.env'), 'utf8').match(/http:\/\/192\.168\.1\.20:8080/g).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
