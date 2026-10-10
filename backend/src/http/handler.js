// Nơi nhận request từ frontend và chọn đúng hàm xử lý. Luồng: kiểm tra URL/method → gọi nghiệp vụ/database → trả JSON.
import { ControlError } from '../control/validation.js';
import { integer, deviceId, rowId, pageParams } from './params.js';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
// Body là dữ liệu JSON frontend gửi trong POST. Giới hạn 12 KiB để không nhận nội dung quá lớn.
async function readBody(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new ControlError('Content-Type must be application/json', 415);
  if (Number(req.headers['content-length']) > 12288)
    throw new ControlError('Request body too large', 413);
  let bytes = 0;
  const chunks = [];
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 12288) throw new ControlError('Request body too large', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new ControlError('Malformed JSON');
  }
}
function notFound(result) {
  if (result == null) throw new ControlError('Resource not found', 404);
  return result;
}
export function createHttpHandler(deps) {
  const {
    controls,
    listMachines,
    getMachine,
    getCatalog,
    applyConfig,
    getConfigRequest,
    telemetryHistory,
    listAlarms,
    acknowledgeAlarm,
    listServiceRuns,
    readiness,
  } = deps;
  return async (req, res) => {
    try {
      // Dùng địa chỉ gốc cố định để đọc URL; không dựa vào header Host do người gọi cung cấp.
      let url, path;
      try {
        if (typeof req.url !== 'string' || !req.url.startsWith('/') || req.url.startsWith('//'))
          throw new Error();
        url = new URL(req.url, 'http://localhost');
        path = decodeURIComponent(url.pathname);
      } catch {
        throw new ControlError('Malformed request URL');
      }
      // Server thật luôn truyền security; unit test có thể truyền policy giả.
      deps.rateLimit?.(req, res, path);
      await deps.security?.(req, res, path);
      const params = url.searchParams;
      // Mỗi endpoint có đúng phương thức cho phép: GET để xem, POST để thực hiện thao tác.
      const route = (method, run) => ({ method, run });
      let selected;
      if (deps.accounts && path === '/auth/login') selected = route('POST', async () => deps.accounts.login(await readBody(req)));
      else if (deps.accounts && path === '/auth/me') selected = route('GET', () => req.actor);
      else if (deps.accounts && path === '/auth/logout') selected = route('POST', () => deps.accounts.logout(req.sessionToken));
      else if (deps.accounts && path === '/auth/password') selected = route('POST', async () => deps.accounts.changePassword(req.actor, await readBody(req)));
      else if (deps.accounts && path === '/admin/users') selected = route('GET', () => deps.accounts.list());
      else if (deps.accounts && path === '/admin/users/create') selected = route('POST', async () => deps.accounts.create(req.actor, await readBody(req)));
      else if (deps.accounts && /^\/admin\/users\/[^/]+$/.test(path)) selected = route('POST', async () => deps.accounts.update(req.actor, path.split('/').pop(), await readBody(req)));
      else if (deps.accounts && path === '/admin/audit') selected = route('GET', () => deps.accounts.history());
      else if (path === '/health' || path === '/health/live')
        selected = route('GET', () => ({ status: 'alive' }));
      else if (path === '/health/ready')
        selected = route('GET', async () => {
          const result = await readiness();
          send(res, result.ready ? 200 : 503, result);
        });
      else if (path === '/profiles')
        selected = route('GET', () =>
          deps.listProfiles(integer(params.get('limit'), 'limit', 100, 1, 200))
        );
      else if (path === '/profiles/import')
        selected = route('POST', async () => {
          send(res, 201, await deps.importProfile(await readBody(req)));
        });
      else if (path === '/config/preview')
        selected = route('POST', async () => deps.previewConfig(await readBody(req)));
      else if (path === '/operations')
        selected = route('GET', () => {
          const gateway = params.get('gatewayId');
          if (gateway && !/^[A-F0-9]{12}$/.test(gateway))
            throw new ControlError('Invalid gatewayId');
          return deps.listOperations(gateway, integer(params.get('limit'), 'limit', 50, 1, 200));
        });
      else if (path === '/system/metrics') selected = route('GET', deps.systemMetrics);
      else if (path === '/machines') selected = route('GET', listMachines);
      else if (path === '/gateways') selected = route('GET', () => controls.listGateways());
      else if (path === '/catalog')
        selected = route('GET', async () =>
          notFound(await getCatalog(deviceId(params.get('deviceId'))))
        );
      else if (path === '/uptime')
        selected = route('GET', () =>
          listServiceRuns(integer(params.get('limit'), 'limit', 20, 1, 100))
        );
      else if (path === '/alarms') selected = route('GET', () => readAlarms());
      else if (path === '/hello')
        selected = route('GET', () => ({ message: `Hello ${params.get('name') ?? 'guy'}` }));
      else {
        let match;
        if ((match = /^\/profiles\/([A-Za-z0-9_-]{1,64})\/export$/.exec(path))) {
          selected = route('GET', () =>
            deps.exportProfile(
              match[1],
              params.has('revision')
                ? integer(params.get('revision'), 'revision', 1, 1, 2147483647)
                : null
            )
          );
        } else if ((match = /^\/machines\/([^/]+)(?:\/(telemetry|alarms))?$/.exec(path))) {
          selected = route('GET', async () => {
            const id = deviceId(match[1]);
            const machine = notFound(await getMachine(id));
            if (match[2] === 'telemetry') return telemetryHistory(id, pageParams(params));
            if (match[2] === 'alarms') return readAlarms(id);
            return machine;
          });
        } else if ((match = /^\/alarms\/([^/]+)\/ack$/.exec(path))) {
          selected = route('POST', async () => notFound(await acknowledgeAlarm(rowId(match[1]))));
        } else if ((match = /^\/operations\/([A-Za-z0-9-]+)$/.exec(path))) {
          selected = route('GET', () => controls.getOperation(match[1]));
        } else if ((match = /^\/gateways\/([A-F0-9]{12})\/(probe|apply)$/.exec(path))) {
          selected = route('POST', async () => {
            send(res, 202, await controls.start(match[1], match[2], await readBody(req)));
          });
        } else if ((match = /^\/devices\/([^/]+)\/config$/.exec(path))) {
          selected = route('POST', async () => {
            const id = deviceId(match[1]);
            const result = await applyConfig(id);
            if (result.ok)
              send(res, 202, {
                requestId: result.requestId,
                deviceId: result.deviceId,
                gatewayId: result.gatewayId,
                status: 'pending',
              });
            else if (result.code === 'unknown_device')
              throw new ControlError('Unknown device', 404);
            else if (result.code === 'already_pending')
              send(res, 409, {
                error: 'A configuration request is already pending',
                code: result.code,
                pendingRequestId: result.pending.request_id,
                sentAt: result.pending.sent_at,
              });
            else
              send(res, 503, {
                error: 'MQTT publication unavailable; check request outcome',
                code: result.code,
                requestId: result.requestId,
              });
          });
        } else if ((match = /^\/config-requests\/([^/]+)$/.exec(path))) {
          selected = route('GET', async () => notFound(await getConfigRequest(match[1])));
        }
      }
      // Chỉ gọi nghiệp vụ sau khi đã xác định endpoint và kiểm tra phương thức.
      if (!selected) throw new ControlError('Endpoint not found', 404);
      res.setHeader('Allow', `${selected.method}, OPTIONS`);
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }
      if (req.method !== selected.method) throw new ControlError('Method not allowed', 405);
      const tracked = req.actor && req.method === 'POST' && !path.startsWith('/auth/') && !path.startsWith('/admin/');
      if (tracked) await deps.accounts.record(req.actor, 'request', path, 'started');
      let result;
      try { result = await selected.run(); }
      catch (error) {
        if (tracked) await deps.accounts.record(req.actor, 'request', path, 'failed');
        throw error;
      }
      if (tracked) await deps.accounts.record(req.actor, 'request', path, result?.id ? `accepted:${result.id}` : 'accepted');
      if (!res.headersSent) send(res, 200, result);

      // Bộ lọc cảnh báo được kiểm tra trước khi đưa vào truy vấn database.
      async function readAlarms(id) {
        const severity = params.get('severity');
        if (severity !== null && !['low', 'medium', 'high', 'critical'].includes(severity))
          throw new ControlError('Invalid severity');
        const acknowledged = params.get('acknowledged');
        if (acknowledged !== null && !['true', 'false'].includes(acknowledged))
          throw new ControlError('acknowledged must be true or false');
        const filter = id ?? (params.has('deviceId') ? deviceId(params.get('deviceId')) : null);
        if (filter && !id) notFound(await getMachine(filter));
        return listAlarms({
          ...pageParams(params),
          deviceId: filter,
          severity,
          acknowledged: acknowledged === null ? null : acknowledged === 'true',
        });
      }
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (error instanceof ControlError) {
        send(res, error.status, { error: error.message, code: `http_${error.status}` });
        return;
      }
      console.error('[HTTP]', error.message);
      const unavailable =
        error.code?.startsWith?.('08') ||
        ['ECONNREFUSED', 'ECONNRESET', '57P01', '57P02', '57P03'].includes(error.code);
      send(res, unavailable ? 503 : 500, {
        error: unavailable ? 'Database unavailable' : 'Internal server error',
        code: unavailable ? 'unavailable' : 'internal_error',
      });
    }
  };
}
