// Tín hiệu định kỳ của consumer giúp HTTP biết chương trình nhận dữ liệu MQTT có đang sẵn sàng không.
import { pool } from './pool.js';
// Consumer ghi tín hiệu định kỳ; ready chỉ đúng khi đã kết nối và subscribe MQTT xong.
export async function recordConsumerHealth(clientId, ready) {
  await pool.query(`INSERT INTO consumer_health(client_id, ready, heartbeat_at) VALUES ($1,$2,now())
    ON CONFLICT(client_id) DO UPDATE SET ready=EXCLUDED.ready, heartbeat_at=EXCLUDED.heartbeat_at`,[clientId,ready]);
}
// Tín hiệu quá 15 giây được coi là đã cũ: tiến trình có thể tắt hoặc bị treo.
export async function databaseReadiness(clientId) {
  const result=await pool.query(`SELECT ready AND heartbeat_at > now()-interval '15 seconds' AS ready,
    heartbeat_at FROM consumer_health WHERE client_id=$1`,[clientId]);
  return { database:true, consumer:result.rows[0]?.ready===true, consumerHeartbeatAt:result.rows[0]?.heartbeat_at??null };
}
