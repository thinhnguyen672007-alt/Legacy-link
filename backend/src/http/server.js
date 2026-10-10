// Khởi động HTTP API. File này nối các hàm vào handler; không tự viết thêm một bộ endpoint khác.
import http from 'node:http';
import { createRateLimit } from './rate-limit.js';
import { listProfiles, importProfile, exportProfile, previewConfig } from '../db/profiles.js';
import { operationStore } from '../db/operations.js';
import { config } from '../config.js';
import { startControlService } from '../control/client.js';
import { createHttpHandler } from './handler.js';
import { httpSettings } from './settings.js';
import { closePool } from '../db/pool.js';
import { getCatalog } from '../db/catalog.js';
import { listMachines, getMachine } from '../db/machines.js';
import { telemetryHistory, listAlarms, acknowledgeAlarm } from '../db/dashboard.js';
import { databaseReadiness, consumerMetrics as systemMetrics } from '../db/health.js';
import { getConfigRequest } from '../db/config-request.js';
import { listServiceRuns } from '../db/service-run.js';
import { applyConfig } from '../service/apply-config.js';
import { startPublisher } from '../mqtt/publisher.js';

import { createSecurity, securitySettings } from './security.js';
const settings = httpSettings();
const security = createSecurity(securitySettings());
const rateLimit = createRateLimit();
const controls = startControlService();
const publisher = startPublisher();
// Kiểm tra toàn hệ thống: database, consumer nhận MQTT, kết nối gửi và kết nối cấu hình.
// Chờ database tối đa 2 giây để endpoint health không treo lâu khi hạ tầng gặp lỗi.
async function readiness() {
  let timer;
  let database = { database: false, consumer: false, consumerHeartbeatAt: null };
  try {
    database = await Promise.race([
      databaseReadiness(config.mqtt.clientId),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Readiness deadline')), 2000);
      }),
    ]);
  } catch {
    /* Database lỗi hoặc thiếu bảng: báo chưa sẵn sàng thay vì làm HTTP sập. */
  } finally {
    clearTimeout(timer);
  }
  const checks = {
    ...database,
    mqttPublisher: publisher.connected,
    mqttControl: controls.client.connected && controls.subscribed && controls.storageHealthy,
  };
  return {
    ready: checks.database && checks.consumer && checks.mqttPublisher && checks.mqttControl,
    checks,
  };
}
// Chỉ dùng một handler chung: API đang chạy cũng chính là API được kiểm thử.
const server = http.createServer(
  createHttpHandler({
    security,
    rateLimit,
    systemMetrics,
    listProfiles,
    importProfile,
    exportProfile,
    previewConfig,
    listOperations: operationStore.list,
    controls,
    listMachines,
    getMachine,
    getCatalog,
    telemetryHistory,
    listAlarms,
    acknowledgeAlarm,
    getConfigRequest,
    listServiceRuns,
    readiness,
    applyConfig: (deviceId) => applyConfig({ deviceId, publishClient: publisher }),
  })
);
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.on('clientError', (_, socket) =>
  socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
);
let stopping = false;
// Khi dừng: ngừng nhận HTTP mới, chờ việc đang chạy, đóng MQTT/DB trong deadline cấu hình.
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  const force = setTimeout(() => process.exit(1), config.ingestion.shutdownMs);
  force.unref();
  server.close(async () => {
    try {
      await controls.close();
      await publisher.endAsync(false);
      await closePool();
      clearTimeout(force);
      process.exit(code);
    } catch {
      process.exit(1);
    }
  });
  server.closeIdleConnections();
}
server.on('error', (error) => {
  console.error('[HTTP] Listen failed:', error.code ?? error.message);
  void shutdown(1);
});
server.listen(settings.port, settings.host, () =>
  console.log(`[HTTP] Listening port=${server.address().port}`)
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void shutdown());
