// Dùng cùng phép kiểm tra schema/heartbeat với API; timeout bảo vệ healthcheck khi DB mất.
const deadline = setTimeout(() => process.exit(1), 6500);
(async () => {
  let pool;
  try {
    const db = await import('./src/db/pool.js'); pool = db.pool;
    const { databaseReadiness } = await import('./src/db/health.js');
    const state = await databaseReadiness(process.env.MQTT_CLIENT_ID);
    if (!state.database || !state.schema || !state.consumer) throw new Error('Schema/heartbeat chua san sang');
    console.log('READY: schema version va consumer heartbeat');
  } catch (error) { console.error('NOT READY:', error.code || error.message); process.exitCode = 1; }
  finally { if (pool) await pool.end(); clearTimeout(deadline); }
})();
