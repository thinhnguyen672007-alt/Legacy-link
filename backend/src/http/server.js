// http/server.js
// Nhiem vu: HTTP server cho backend. Endpoint that su hien co:
// GET /catalog?deviceId=... — tra ve ban do thanh ghi da ghep san cho mot may.
//
// Server nay la mot TIEN TRINH RIENG voi phan MQTT (src/index.js), nhung ca hai
// dung chung mot connection pool trong src/db/pool.js.

import http from 'node:http';

import { pool, closePool } from '../db/pool.js';

// Cau SQL ghep "ban chung cua loai may" voi "phan khac biet cua tung may".
//
// COALESCE(a, b) nghia la: neu a co gia tri thi lay a, neu a la NULL thi lay b.
// Nho vay o bang override de NULL co nghia "khong doi, lay tu ban chung".
// Toan bo quy tac ghep nam gon trong mot ham SQL, khong phai logic tu viet.
const CATALOG_QUERY = `
  SELECT
    b.metric_key,
    COALESCE(o.protocol_address, b.protocol_address) AS protocol_address,
    COALESCE(o.modicon_address,  b.modicon_address)  AS modicon_address,
    COALESCE(o.function_code,    b.function_code)    AS function_code,
    COALESCE(o.data_type,        b.data_type)        AS data_type,
    COALESCE(o.scale,            b.scale)            AS scale,
    COALESCE(o.unit,             b.unit)             AS unit,
    COALESCE(o.alarm_high,       b.alarm_high)       AS alarm_high,
    COALESCE(o.alarm_low,        b.alarm_low)        AS alarm_low
  FROM register_map b
  LEFT JOIN register_override o
    ON o.device_id = $1 AND o.metric_key = b.metric_key
  WHERE b.machine_type = $2
  ORDER BY b.protocol_address
`;

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function handleCatalog(url, res) {
  const deviceId = url.searchParams.get('deviceId');

  // Thieu tham so la loi cua nguoi goi, khong phai loi he thong.
  if (deviceId === null) {
    sendJson(res, 400, { error: 'Thieu tham so deviceId' });
    return;
  }

  // Buoc 1: thiet bi nay thuoc loai may nao?
  const deviceResult = await pool.query(
    'SELECT device_id, machine_type, name FROM device WHERE device_id = $1',
    [deviceId],
  );

  if (deviceResult.rowCount === 0) {
    sendJson(res, 404, { error: `Khong biet thiet bi "${deviceId}"` });
    return;
  }

  const device = deviceResult.rows[0];

  // Buoc 2: lay ban chung cua loai may va ghep voi phan rieng cua thiet bi.
  const registerResult = await pool.query(CATALOG_QUERY, [deviceId, device.machine_type]);

  sendJson(res, 200, {
    deviceId: device.device_id,
    deviceName: device.name,
    machineType: device.machine_type,
    registers: registerResult.rows,
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
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
      await handleCatalog(url, res);
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
