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
import { listServiceRuns } from '../db/service-run.js';
import { applyConfig } from '../service/apply-config.js';
import { startPublisher } from '../mqtt/publisher.js';

// Ket noi MQTT chi-de-gui cua tien trinh HTTP.
// Tien trinh MQTT (index.js) cung ket noi, nhung no de NGHE. Hai ket noi khac
// clientId nen khong gianh nhau (config.js da them PID vao clientId).
const publisher = startPublisher();

// Cho phep trinh duyet goi API nay tu mot cong khac.
//
// VI SAO CAN:
// Frontend chay o mot cong (vi du 5500), backend o cong khac (3000). Voi trinh
// duyet, do la hai "origin" khac nhau, nen mac dinh no CHAN moi request.
//
// Trieu chung rat de gay hieu nham: goi bang curl thi chay binh thuong, nhung
// goi tu trang web thi bao loi "CORS policy". Nhin tu backend khong thay gi bat
// thuong, vi request cua trinh duyet khong bao gio duoc gui di.
//
// Dau "*" nghia la cho phep moi origin. Voi demo thi du. San pham that thi nen
// liet ke dung ten mien cua frontend.
function applyCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Day cau hinh xuong mot thiet bi, va dich ma ket qua thanh ma HTTP.
//
// Viec doi ma ket qua thanh ma HTTP nam o DAY, khong nam trong service. Tang
// service tra ve `code` mang nghia nghiep vu ('already_pending'), con HTTP moi
// quyet dinh no la 409 hay 400. Nho vay ham service cung dung duoc tu script
// dong lenh — noi khong co khai niem "ma HTTP".
async function handleApplyConfig(deviceId, res) {
  const result = await applyConfig({ deviceId, publishClient: publisher });

  if (result.ok) {
    // 202 Accepted, khong phai 200 OK.
    //
    // 200 nghia la "xong roi". Nhung o day ta moi GUI di, chua biet ESP32 co ap
    // dung hay khong. 202 nghia dung dieu do: "da nhan yeu cau, chua xong".
    sendJson(res, 202, {
      requestId: result.requestId,
      deviceId: result.deviceId,
      gatewayId: result.gatewayId,
      status: 'pending',
      message: 'Da gui. Hoi lai GET /config-requests/{requestId} de xem ket qua.',
    });
    return;
  }

  if (result.code === 'unknown_device') {
    sendJson(res, 404, { error: `Khong biet thiet bi "${deviceId}"` });
    return;
  }

  if (result.code === 'already_pending') {
    // 409 Conflict: yeu cau dung, nhung xung dot voi trang thai hien tai.
    // Tra kem requestId dang cho de frontend biet phai doi cai nao.
    sendJson(res, 409, {
      error: 'Thiet bi nay dang co mot yeu cau chua xu ly xong',
      pendingRequestId: result.pending.request_id,
      sentAt: result.pending.sent_at,
    });
    return;
  }

  // publish_failed: khong gui duoc len broker.
  // 503 = "tam thoi khong phuc vu duoc", nguoi goi thu lai sau.
  sendJson(res, 503, {
    error: 'Khong gui duoc len broker',
    requestId: result.requestId,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Dat CORS cho MOI response, truoc khi dinh tuyen. Lam o day thi khong phai
  // nho them vao tung nhanh.
  applyCors(res);

  try {
    // Trinh duyet gui mot request OPTIONS "tham do" truoc khi gui request that
    // (goi la preflight), khi request do dung POST hoac co header dac biet.
    //
    // Phai tra loi no. Neu khong, trinh duyet se KHONG gui request that, va
    // backend khong bao gio thay gi ca.
    //
    // 204 = "xong, khong co noi dung de tra ve".
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (url.pathname === '/health') {
      res.end('OK');
      return;
    }

    if (url.pathname === '/hello') {
      const name = url.searchParams.get('name');
      res.end(`Hello ${name ?? 'guy'}`);
      return;
    }

    if (url.pathname === '/catalog') {
      const deviceId = url.searchParams.get('deviceId');

      // Thieu tham so la loi cua nguoi goi. Day la chuyen cua tang HTTP —
      // tang db/ khong can biet gi ve ma loi HTTP.
      if (!deviceId) {
        sendJson(res, 400, { error: 'Thieu tham so deviceId' });
        return;
      }

      const catalog = await getCatalog(deviceId);

      // null = khong co thiet bi nay trong database.
      if (catalog === null) {
        sendJson(res, 404, { error: `Khong biet thiet bi "${deviceId}"` });
        return;
      }

      sendJson(res, 200, catalog);
      return;
    }

    if (url.pathname === '/machines') {
      sendJson(res, 200, await listMachines());
      return;
    }

    // Lich su cac lan backend chay — de biet KHOANG NAO du lieu bi thieu.
    //
    // VI SAO CAN endpoint nay:
    // Khi backend khong chay, telemetry mat vinh vien. Dashboard ve duong lien
    // mach va nguoi van hanh tin vao mot bieu do thieu du lieu — do la thong
    // tin SAI, te hon la khong co thong tin.
    //
    // Endpoint nay cho frontend biet phai ve vach "khong co du lieu" o dau.
    if (url.pathname === '/uptime') {
      const runs = await listServiceRuns(20);
      const current = runs.find((run) => !run.stoppedCleanly) ?? null;

      sendJson(res, 200, {
        currentRunStartedAt: current?.startedAt ?? null,
        uptimeSeconds: current
          ? Math.round((Date.now() - new Date(current.startedAt).getTime()) / 1000)
          : null,
        runs,
        note:
          'Khi backend khong chay, telemetry gui toi bi mat vinh vien: firmware publish o ' +
          'QoS 0 (broker khong xep hang cho nguoi nghe vang mat) va backend subscribe voi ' +
          'clean:true nen khong co session cu de nhan lai. ' +
          'Lan chay co stoppedCleanly=false la lan backend tat dot ngot: du lieu trong ' +
          'khoang do chac chan da mat, NHUNG khong biet chinh xac bat dau tu luc nao — ' +
          'nen ve vach trong tu startedAt cua lan do den startedAt cua lan ke tiep. ' +
          'gapBeforeSeconds = null chinh la y nghia "khong biet", khong phai loi.',
      });
      return;
    }

    // ---------------------------------------------------------------------
    // Duong dan CO THAM SO — khac han cac endpoint o tren.
    //
    //   /machines?deviceId=abc      <- tham so nam trong QUERY STRING
    //   /devices/abc/config         <- tham so nam trong DUONG DAN
    //
    // Truoc day ta doc tham so bang url.searchParams. Cach do KHONG dung duoc
    // o day, vi `abc` khong nam sau dau `?`.
    //
    // Cach doc: tach duong dan theo '/'.
    //   '/devices/esp32-01/config'.split('/') -> ['', 'devices', 'esp32-01', 'config']
    //                                               0    1         2         3
    //
    // Kiem tra ca DO DAI mang, khong chi kiem tra tung phan. Neu chi kiem tra
    // parts[1]==='devices', thi '/devices/abc/config/xyz' cung lot qua.
    // ---------------------------------------------------------------------
    const parts = url.pathname.split('/');

    if (parts.length === 4 && parts[1] === 'devices' && parts[3] === 'config') {
      // Kiem tra DONG TU. Khong co no thi `GET /devices/abc/config` cung chay
      // ham day cau hinh — mot request chi-de-xem lai lam thay doi he thong.
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'Endpoint nay chi ho tro POST' });
        return;
      }

      await handleApplyConfig(decodeURIComponent(parts[2]), res);
      return;
    }

    if (parts.length === 3 && parts[1] === 'config-requests') {
      const request = await getConfigRequest(decodeURIComponent(parts[2]));

      if (request === null) {
        sendJson(res, 404, { error: 'Khong biet yeu cau nay' });
        return;
      }

      sendJson(res, 200, request);
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  } catch (err) {
    // Bat moi loi khong luong truoc duoc, de mot request loi khong lam sap ca
    // tien trinh dang phuc vu cac request khac.
    console.error('[HTTP] Loi xu ly request:', err.message);

    if (res.headersSent) {
      // Da gui header roi thi khong the gui lai ma 500. Chi ket thuc lai.
      res.end();
    } else {
      sendJson(res, 500, { error: 'Loi he thong' });
    }
  }
});

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
