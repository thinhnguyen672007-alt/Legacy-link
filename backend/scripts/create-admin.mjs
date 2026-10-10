// Run once with ADMIN_USERNAME and ADMIN_PASSWORD supplied through the environment.
import { pool } from "../src/db/pool.js";
import { createAccounts } from "../src/auth/accounts.js";
try {
  await createAccounts(pool).bootstrap(
    process.env.ADMIN_USERNAME,
    process.env.ADMIN_PASSWORD,
  );
  console.log(
    "Administrator created. Sign in and distribute employee accounts from Users.",
  );
} finally {
  await pool.end();
}
