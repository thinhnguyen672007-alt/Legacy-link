// http/server.js
// Nhiem vu: HTTP server. Noi nhan request, kiem tra tham so, goi tang db/,
// va gui ket qua ve. KHONG chua SQL — moi cau lenh database nam trong src/db/.
//
// Cac endpoint hien co:
//
//   GET  /health                  — kiem tra song
//   GET  /hello?name=...          — thu nghiem
//   GET  /catalog?deviceId=...    — cau hinh cho ESP32
//   GET  /machines                — danh sach may cho dashboard
//
// Server nay la mot TIEN TRINH RIENG voi phan MQTT (src/index.js), nhung ca hai
// dung chung mot connection pool trong src/db/pool.js.

import http from 'node:http';

import { closePool } from '../db/pool.js';
import { getCatalog } from '../db/catalog.js';
import { listMachines } from '../db/machines.js';

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
    server.close(async () => {
      await closePool();
      console.log('[HTTP] Da dong server va connection pool.');
      process.exit(0);
    });
  });
}
