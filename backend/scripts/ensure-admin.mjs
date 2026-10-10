import { pool } from '../src/db/pool.js';
import { createAccounts } from '../src/auth/accounts.js';

try {
  const existing = await pool.query('SELECT 1 FROM app_user LIMIT 1');
  if (existing.rowCount) {
    console.log('Administrator already initialized; existing accounts preserved.');
  } else {
    try {
      await createAccounts(pool).bootstrap(process.env.ADMIN_USERNAME, process.env.ADMIN_PASSWORD);
      console.log('Administrator initialized.');
    } catch (error) {
      // A concurrent initializer may have won after the first read.
      if (error.status !== 409 || !(await pool.query('SELECT 1 FROM app_user LIMIT 1')).rowCount) throw error;
      console.log('Administrator already initialized by another process.');
    }
  }
} finally {
  await pool.end();
}
