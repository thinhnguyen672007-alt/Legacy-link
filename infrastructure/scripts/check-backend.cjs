// Probe là một bài kiểm tra nhỏ chạy trong image Node của consumer.
// Nó kiểm tra hai tầng: DB có đúng cột backend cần, và consumer có heartbeat mới.
// Chỉ thấy PostgreSQL mở cổng hoặc có đủ số bảng vẫn chưa chứng minh backend dùng được.
const { Pool } = require('pg');
// Giới hạn thời gian kết nối/truy vấn để health check không treo khi DB gặp lỗi.
const pool = new Pool({connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2000, query_timeout: 2000});
pool.on('error', () => {});
// Chặn cả trường hợp toàn bài kiểm tra quá lâu; Docker cũng có timeout bên ngoài.
const deadline = setTimeout(() => { console.error('NOT READY: probe deadline'); process.exit(1); }, 6500);
(async () => {
  try {
    // LIMIT 0 không lấy dữ liệu khách hàng nhưng PostgreSQL vẫn kiểm tra bảng/cột.
    // Cách này phát hiện schema cũ thiếu message_id, event_id (C7-C10) hoặc các
    // bảng/cột C16 (schema version 4) như control_operation, device_profile.
    for (const sql of [
      'SELECT message_id FROM telemetry LIMIT 0',
      'SELECT event_id, metric_key FROM alarms LIMIT 0',
      'SELECT applied_config, config_request_id, gateway_id FROM device LIMIT 0',
      'SELECT diagnostics, diagnostics_at, last_telemetry_ts FROM machine_state LIMIT 0',
      'SELECT message_id, payload_hash, committed_at FROM ingestion_receipt LIMIT 0',
      'SELECT request_id, gateway_id, status FROM config_request LIMIT 0',
      'SELECT started_at, stopped_at FROM service_run LIMIT 0',
      'SELECT metric_key, word_order FROM register_map LIMIT 0',
      'SELECT metric_key, word_order FROM register_override LIMIT 0',
      'SELECT stats FROM consumer_health LIMIT 0',
      'SELECT version FROM schema_migrations LIMIT 0',
      'SELECT operation_id, expires_at FROM gateway_command_lease LIMIT 0',
      'SELECT data FROM control_operation LIMIT 0',
      'SELECT config, retired_at FROM device_config_history LIMIT 0',
      'SELECT revision, config FROM device_profile LIMIT 0'
    ]) await pool.query(sql);
    // Phiên bản schema phải đạt bản backend cần (schema version 4, C16). Chỉ thấy
    // bảng/cột tồn tại chưa đủ: DB có thể còn ở bản cũ hơn và migration chưa chạy.
    const schema = await pool.query('SELECT max(version) AS version FROM schema_migrations');
    if (Number(schema.rows[0]?.version ?? 0) < 4)
      throw new Error('schema_migrations version < 4; chay setup.sh hoac npm run db:migrate');
    // Heartbeat do chính consumer ghi, gắn với MQTT_CLIENT_ID chung cho consumer/API.
    // ready=true nhưng heartbeat quá 15 giây cũng là lỗi: có thể worker đã chết hoặc mất DB.
    // Cờ ready phụ thuộc xử lý subscribe của backend; probe không giả vờ sửa cờ đó.
    const result = await pool.query("SELECT ready AND heartbeat_at > now()-interval '15 seconds' AS ready FROM consumer_health WHERE client_id=$1", [process.env.MQTT_CLIENT_ID]);
    if (result.rows[0]?.ready !== true) throw new Error('consumer MQTT subscription heartbeat missing/stale');
    console.log('READY: schema, database and consumer subscription heartbeat');
  // Exit code 1 làm Docker đánh dấu lỗi; đóng pool để tiến trình kiểm tra không giữ socket.
  } catch (error) {
    console.error('NOT READY:', error.code || error.message);
    process.exitCode = 1;
  } finally { await pool.end(); clearTimeout(deadline); }
})();
