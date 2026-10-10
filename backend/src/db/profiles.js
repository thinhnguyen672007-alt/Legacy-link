// Profile có revision bất biến: import lại không ghi đè bản đã được người khác sử dụng.
import { pool } from './pool.js';
import { validateConfig, ControlError } from '../control/validation.js';
export function validateProfile(body) {
  if (
    !body ||
    body.schemaVersion !== 1 ||
    typeof body.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(body.id) ||
    typeof body.name !== 'string' ||
    !body.name.trim() ||
    body.name.length > 100
  )
    throw new ControlError('Profile cần schemaVersion=1, id và name hợp lệ');
  return {
    schemaVersion: 1,
    id: body.id,
    name: body.name.trim(),
    config: validateConfig(body.config),
  };
}
export async function importProfile(body) {
  const profile = validateProfile(body),
    client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['profile:' + profile.id]);
    const revision = Number(
      (
        await client.query('SELECT COALESCE(max(revision),0)+1 n FROM device_profile WHERE id=$1', [
          profile.id,
        ])
      ).rows[0].n
    );
    await client.query('INSERT INTO device_profile(id,revision,name,config) VALUES($1,$2,$3,$4)', [
      profile.id,
      revision,
      profile.name,
      profile.config,
    ]);
    await client.query('COMMIT');
    return { ...profile, revision };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
export async function listProfiles(limit = 100) {
  return (
    await pool.query(
      'SELECT DISTINCT ON(id) id,revision,name,created_at AS "createdAt" FROM device_profile ORDER BY id,revision DESC LIMIT $1',
      [limit]
    )
  ).rows;
}
export async function exportProfile(id, revision = null) {
  const row = (
    await pool.query(
      'SELECT id,revision,name,config FROM device_profile WHERE id=$1 AND ($2::integer IS NULL OR revision=$2) ORDER BY revision DESC LIMIT 1',
      [id, revision]
    )
  ).rows[0];
  if (!row) throw new ControlError('Profile not found', 404);
  return { schemaVersion: 1, ...row };
}
// Preview chuẩn hóa và nêu giới hạn; không publish, không đăng ký máy.
export function previewConfig(body) {
  const config = validateConfig(body?.config);
  const warnings = config.registerMap
    .filter((r) => r.scale === 0)
    .map((r) => `${r.key}: scale=0 làm mọi giá trị thành 0`);
  return {
    config,
    bytes: Buffer.byteLength(JSON.stringify(config)),
    warnings,
    requiresProbe: true,
  };
}
