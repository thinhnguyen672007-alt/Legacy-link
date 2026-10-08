import { ControlError } from '../control/validation.js';

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

async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new ControlError('Content-Type must be application/json', 415);
  if (Number(req.headers['content-length']) > 12288) throw new ControlError('Request body too large', 413);
  let bytes = 0; const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 12288) throw new ControlError('Request body too large', 413);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString()); }
  catch { throw new ControlError('Malformed JSON'); }
}

export function createHttpHandler({ controls, listMachines, getCatalog, applyConfig, getConfigRequest }) {
return async (req, res) => {
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

    if (req.method === 'GET' && url.pathname === '/gateways') {
      sendJson(res, 200, controls.listGateways()); return;
    }
    const operation = /^\/operations\/([a-zA-Z0-9-]+)$/.exec(url.pathname);
    if (req.method === 'GET' && operation) {
      sendJson(res, 200, controls.getOperation(operation[1])); return;
    }
    const command = /^\/gateways\/([A-F0-9]{12})\/(probe|apply)$/.exec(url.pathname);
    if (req.method === 'POST' && command) {
      sendJson(res, 202, controls.start(command[1], command[2], await readBody(req))); return;
    }
    const deviceConfig = /^\/devices\/([^/]+)\/config$/.exec(url.pathname);
    if (deviceConfig) {
      if (req.method !== 'POST') { sendJson(res, 405, { error: 'Endpoint nay chi ho tro POST' }); return; }
      const deviceId = decodeURIComponent(deviceConfig[1]);
      const result = await applyConfig(deviceId);
      if (result.ok) {
        sendJson(res, 202, { requestId: result.requestId, deviceId: result.deviceId,
          gatewayId: result.gatewayId, status: 'pending',
          message: 'Da gui. Hoi lai GET /config-requests/{requestId} de xem ket qua.' });
      } else if (result.code === 'unknown_device') {
        sendJson(res, 404, { error: `Khong biet thiet bi "${deviceId}"` });
      } else if (result.code === 'already_pending') {
        sendJson(res, 409, { error: 'Thiet bi nay dang co mot yeu cau chua xu ly xong',
          pendingRequestId: result.pending.request_id, sentAt: result.pending.sent_at });
      } else {
        sendJson(res, 503, { error: 'Khong gui duoc len broker', requestId: result.requestId });
      }
      return;
    }
    if (req.method !== 'GET') { sendJson(res, 405, { error: 'Method not allowed' }); return; }
    const configRequest = /^\/config-requests\/([^/]+)$/.exec(url.pathname);
    if (configRequest) {
      const result = await getConfigRequest(decodeURIComponent(configRequest[1]));
      sendJson(res, result === null ? 404 : 200, result ?? { error: 'Khong biet yeu cau nay' });
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
    if (err instanceof ControlError) { sendJson(res, err.status, { error: err.message }); return; }
    console.error('[HTTP] Loi xu ly request:', err.message);

    if (res.headersSent) {
      // Da gui header roi thi khong the gui lai ma 500. Chi ket thuc lai.
      res.end();
    } else {
      sendJson(res, 500, { error: 'Loi he thong' });
    }
  }
};
}
