// Infrastructure probe: schema plus the actual consumer's MQTT subscription heartbeat.
// Runs inside the Node image; no backend application changes required.
const { Pool } = require('pg');
const pool = new Pool({connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000, query_timeout: 2000});
pool.on('error', () => {});
const deadline = setTimeout(() => { console.error('NOT READY: probe deadline'); process.exit(1); }, 6500);
(async () => {
  try {
    for (const sql of [
      'SELECT message_id FROM telemetry LIMIT 0',
      'SELECT event_id, metric_key FROM alarms LIMIT 0',
      'SELECT applied_config, config_request_id, gateway_id FROM device LIMIT 0',
      'SELECT diagnostics, diagnostics_at, last_telemetry_ts FROM machine_state LIMIT 0',
      'SELECT message_id, payload_hash FROM ingestion_receipt LIMIT 0',
      'SELECT request_id FROM config_request LIMIT 0',
      'SELECT id FROM service_run LIMIT 0',
      'SELECT metric_key FROM register_map LIMIT 0',
      'SELECT metric_key FROM register_override LIMIT 0'
    ]) await pool.query(sql);
    const result = await pool.query("SELECT ready AND heartbeat_at > now()-interval '15 seconds' AS ready FROM consumer_health WHERE client_id=$1", [process.env.MQTT_CLIENT_ID]);
    if (result.rows[0]?.ready !== true) throw new Error('consumer MQTT subscription heartbeat missing/stale');
    console.log('READY: schema, database and consumer subscription heartbeat');
  } catch (error) {
    console.error('NOT READY:', error.code || error.message);
    process.exitCode = 1;
  } finally { await pool.end(); clearTimeout(deadline); }
})();
