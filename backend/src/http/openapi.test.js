import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Bắt lỗi ghép nhánh: JSON hợp lệ chưa đủ, endpoint không được lồng vào endpoint khác.
test('OpenAPI giữ đủ hợp đồng AI, tài khoản, UNDERHEAT và tham chiếu hợp lệ', () => {
  const doc = JSON.parse(readFileSync(new URL('../../openapi.json', import.meta.url), 'utf8'));
  for (const path of ['/ai/chat', '/ai/query', '/auth/login', '/auth/me', '/auth/password', '/admin/users']) {
    assert.ok(doc.paths[path], `Thiếu endpoint ${path}`);
  }
  const login = doc.paths['/auth/login'].post.requestBody.content['application/json'].schema;
  assert.deepEqual(login.required, ['username', 'password']);
  const chat = doc.paths['/ai/chat'].post.requestBody.content['application/json'].schema;
  assert.ok(chat.properties.action.enum.includes('underheat'));
  assert.ok(JSON.stringify(doc.components.schemas.Alarm).includes('UNDERHEAT'));
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && value.startsWith('#/')) {
        const target = value.slice(2).split('/').reduce((obj, part) => obj?.[part.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
        assert.ok(target, `Tham chiếu không tồn tại: ${value}`);
      }
      walk(value);
    }
  };
  walk(doc);
  for (const item of Object.values(doc.paths)) {
    for (const operation of Object.values(item)) {
      assert.ok(!Object.keys(operation).some((key) => key.startsWith('/')), 'Endpoint bị ghép sai tầng');
    }
  }
});
