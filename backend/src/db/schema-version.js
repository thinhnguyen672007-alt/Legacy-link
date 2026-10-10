// Kiểm tra cả phiên bản lẫn cột thật, không chỉ tin một số version trong DB.
export const SCHEMA_VERSION = 5;
const required = {
  app_user: ['id','username','password_hash','role','disabled','must_change_password'],
  app_session: ['token_hash','user_id','expires_at'],
  account_audit: ['actor_id','action','target','outcome'],
  device: ['device_id', 'gateway_id', 'applied_config', 'config_request_id'],
  register_map: ['metric_key', 'word_order'],
  register_override: ['word_order'],
  telemetry: ['id', 'ts', 'message_id', 'metrics', 'received_at'],
  alarms: ['id', 'event_id', 'metric_key', 'acknowledged_at'],
  machine_state: ['last_telemetry_ts', 'diagnostics', 'diagnostics_at'],
  ingestion_receipt: ['payload_hash', 'committed_at'],
  config_request: ['request_id', 'gateway_id', 'status'],
  service_run: ['started_at', 'stopped_at'],
  consumer_health: ['client_id', 'ready', 'heartbeat_at', 'stats'],
  schema_migrations: ['version'],
  gateway_command_lease: ['operation_id', 'expires_at'],
  control_operation: ['data'],
  device_config_history: ['config', 'retired_at'],
  device_profile: ['revision', 'config'],
};
export async function schemaStatus(client) {
  const { rows } = await client.query(
    "SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY($1::text[])",
    [Object.keys(required)]
  );
  const present = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
  const missing = Object.entries(required).flatMap(([table, cols]) =>
    cols.filter((c) => !present.has(`${table}.${c}`)).map((c) => `${table}.${c}`)
  );
  let version = 0;
  if (present.has('schema_migrations.version'))
    version = Number(
      (await client.query('SELECT max(version) AS version FROM schema_migrations')).rows[0]
        .version ?? 0
    );
  return {
    ready: version === SCHEMA_VERSION && !missing.length,
    version,
    expected: SCHEMA_VERSION,
    missing,
  };
}
