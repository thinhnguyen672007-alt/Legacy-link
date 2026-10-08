// db/machines.js
// Nhiem vu: DOC thong tin thiet bi de tra cho API cua frontend.
//
// Khac voi cac file khac trong thu muc db/ — chung GHI du lieu vao database,
// con file nay CHI DOC.
//
// Doc va ghi tach rieng vi hai viec co yeu cau khac nhau:
//   - Ghi: phai dung transaction, phai chong trung lap, phai xu ly loi.
//   - Doc: chi can cau query dung va nhanh. Khong co gi de hong.

import { pool } from './pool.js';

// Bao lau khong nghe duoc gi thi coi nhu thiet bi da mat ket noi.
//
// Firmware gui heartbeat moi 30 giay. Ba nhip bi lo lien tiep thi coi nhu chet.
// Con so nay chi co y nghia khi hien thi; no khong lam thay doi du lieu trong DB.
const GATEWAY_TTL_SECONDS = 90;

// Danh sach may kem trang thai hien tai.
//
// LEFT JOIN chu khong INNER JOIN. Ly do: mot thiet bi vua duoc them vao bang
// device nhung CHUA bao gio gui du lieu nao thi chua co dong trong machine_state.
//
//   INNER JOIN  -> no bien mat khoi danh sach            (sai — may van ton tai!)
//   LEFT JOIN   -> no van hien, gatewayOnline = false    (dung)
export async function listMachines() {
  const result = await pool.query(`
    SELECT
      d.device_id,
      d.name,
      d.machine_type,
      COALESCE(s.online, false) AS online,
      s.last_seen_at,
      s.last_metrics, s.last_telemetry_at, s.last_telemetry_ts, s.diagnostics,
      d.sampling_interval_ms, d.gateway_id, d.config_request_id
    FROM device d
    LEFT JOIN machine_state s ON s.device_id = d.device_id
    ORDER BY d.device_id
  `);

  return result.rows.map(toMachine);
}

// Chuyen mot dong database thanh hinh dang ma frontend se dung.
//
// Database dung snake_case (device_id, last_seen_at), frontend dung camelCase.
// Viec chuyen doi dien ra o day — ranh gioi giua hai he thong.
function toMachine(row) {
  const now = Date.now();

  const lastSeenMs = row.last_seen_at ? new Date(row.last_seen_at).getTime() : null;
  const lastDataMs = row.last_telemetry_at
    ? new Date(row.last_telemetry_at).getTime()
    : null;

  // gatewayOnline la gia tri SUY RA, khong phai doc thang tu cot `online`.
  //
  // Hai dieu kien, vi hai co che bu nhau:
  //
  //   1. LWT chua bao tat      -> neu broker da bao mat ket noi thi tin ngay,
  //                               khong phai cho het TTL
  //   2. Nghe duoc trong TTL   -> bat truong hop LWT bi mat (backend dang tat
  //                               luc thiet bi chet, retained true cu van con)
  //
  // Thieu dieu kien 2: mot thiet bi chet im lang se hien online mai mai.
  // Thieu dieu kien 1: phai cho het 90 giay moi hien offline, du broker da biet.
  const gatewayOnline =
    row.online === true &&
    lastSeenMs !== null &&
    now - lastSeenMs < GATEWAY_TTL_SECONDS * 1000;

  return {
    deviceId: row.device_id,
    name: row.name,
    machineType: row.machine_type,
    gatewayOnline,
    online: gatewayOnline,
    lastSeenAt: row.last_seen_at,
    metrics: row.last_metrics,
    lastTelemetryAt: row.last_telemetry_at,
    lastMeasurementAt: row.last_telemetry_ts == null ? null : new Date(Number(row.last_telemetry_ts)).toISOString(),
    dataAgeSeconds: lastDataMs === null ? null : Math.round((now - lastDataMs) / 1000),
    diagnostics: row.diagnostics,
    samplingIntervalMs: row.sampling_interval_ms,
    gatewayId: row.gateway_id,
    configRequestId: row.config_request_id,
  };
}
