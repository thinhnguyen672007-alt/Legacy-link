// Chạy bằng npm run db:migrate. Không tự migrate lúc API khởi động.
import { readFileSync } from 'node:fs';
import { pool } from '../src/db/pool.js';
import { schemaStatus } from '../src/db/schema-version.js';
const client = await pool.connect();
try {
  await client.query("SELECT pg_advisory_lock(hashtext('legacy-link-migrations'))");
  const exists = (await client.query("SELECT to_regclass('public.device') AS table_name")).rows[0]
    .table_name;
  if (!exists)
    await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  else
    for (const file of ['migrate-c7-c8-c9.sql', 'migrate-c10.sql', 'migrate-c16.sql', 'migrate-accounts.sql'])
      await client.query(readFileSync(new URL('../db/' + file, import.meta.url), 'utf8'));
  const status = await schemaStatus(client);
  if (!status.ready) throw new Error('Schema chưa hoàn chỉnh: ' + JSON.stringify(status));
  console.log('Migration thành công, version=' + status.version);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.query("SELECT pg_advisory_unlock(hashtext('legacy-link-migrations'))");
  client.release();
  await pool.end();
}
