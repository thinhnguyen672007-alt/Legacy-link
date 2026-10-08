// http/server.js
// Nhiem vu: HTTP server. Noi nhan request, kiem tra tham so, goi tang db/ hoac
// tang service/, va gui ket qua ve. KHONG chua SQL — moi cau lenh database nam
// trong src/db/.
//
// Cac endpoint hien co:
//
//   GET  /health                        — kiem tra song
//   GET  /catalog?deviceId=...          — cau hinh cho ESP32 tu lay
//   GET  /machines                      — danh sach may cho dashboard
//   POST /devices/:deviceId/config      — DAY cau hinh xuong thiet bi
//   GET  /config-requests/:requestId    — xem ket qua cua lan day do
//
// Server nay la mot TIEN TRINH RIENG voi phan MQTT (src/index.js). Ca hai dung
// chung mot connection pool, VA chung mot database — do la cach duy nhat de
// chung chia se trang thai, vi hai tien trinh khong chia se bo nho.

import http from 'node:http';
import { startControlService } from '../control/client.js';
import { createHttpHandler } from './handler.js';
const controls = startControlService();

import { closePool } from '../db/pool.js';
import { getCatalog } from '../db/catalog.js';
import { listMachines } from '../db/machines.js';
import { getConfigRequest } from '../db/config-request.js';
import { applyConfig } from '../service/apply-config.js';
import { startPublisher } from '../mqtt/publisher.js';

// Ket noi MQTT chi-de-gui cua tien trinh HTTP.
// Tien trinh MQTT (index.js) cung ket noi, nhung no de NGHE. Hai ket noi khac
// clientId nen khong gianh nhau (config.js da them PID vao clientId).
const publisher = startPublisher();

const server = http.createServer(createHttpHandler({ controls, listMachines, getCatalog, getConfigRequest,
  applyConfig: deviceId => applyConfig({ deviceId, publishClient: publisher }) }));

server.listen(3000, () => {
  console.log('Server running at http://localhost:3000/');
});

// Dong server va pool gon gang khi tat. Neu khong dong pool, tien trinh se treo
// vi con ket noi dang mo.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n[HTTP] Nhan ${signal}, dang dung...`);
    controls.close();
    publisher.end();
    server.close(async () => {
      await closePool();
      console.log('[HTTP] Da dong server va connection pool.');
      process.exit(0);
    });
  });
}
