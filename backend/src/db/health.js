// Tín hiệu định kỳ của consumer giúp HTTP biết chương trình nhận dữ liệu MQTT có đang sẵn sàng không.
import { pool } from './pool.js';
import { schemaStatus } from './schema-version.js';
// Consumer ghi tín hiệu định kỳ; ready chỉ đúng khi đã kết nối và subscribe MQTT xong.
export async function recordConsumerHealth(clientId, ready, stats = {}) {
  await pool.query(
    `INSERT INTO consumer_health(client_id, ready, heartbeat_at, stats) VALUES ($1,$2,now(),$3)
    ON CONFLICT(client_id) DO UPDATE SET ready=EXCLUDED.ready, heartbeat_at=EXCLUDED.heartbeat_at,stats=EXCLUDED.stats`,
    [clientId, ready, stats]
  );
}
// Tín hiệu quá 15 giây được coi là đã cũ: tiến trình có thể tắt hoặc bị treo.
export async function databaseReadiness(clientId) {
  const schema = await schemaStatus(pool);
  if (!schema.ready)
    return { database: true, consumer: false, schema: false, schemaDetails: schema };
  const result = await pool.query(
    `SELECT ready AND heartbeat_at > now()-interval '15 seconds' AS ready,
    heartbeat_at FROM consumer_health WHERE client_id=$1`,
    [clientId]
  );
  return {
    database: true,
    schema: true,
    consumer: result.rows[0]?.ready === true,
    consumerHeartbeatAt: result.rows[0]?.heartbeat_at ?? null,
  };
}

// Snapshot hữu hạn để dashboard vận hành xem consumer và queue gần nhất.
export async function consumerMetrics() {
  const result = await pool.query(
    'SELECT client_id AS "clientId",ready,heartbeat_at AS "heartbeatAt",stats FROM consumer_health ORDER BY heartbeat_at DESC LIMIT 100'
  );
  return { consumers: result.rows };
}
