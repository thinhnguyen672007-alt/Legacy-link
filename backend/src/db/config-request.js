// db/config-request.js
// Nhiem vu: theo doi tung yeu cau gui cau hinh xuong thiet bi.
//
// Vong doi cua mot yeu cau:
//
//   pending  -> da gui, dang cho ACK
//   applied  -> ESP32 bao da ap dung
//   unchanged-> ESP32 bao cau hinh giong het cai dang chay, khong can doi
//   rejected -> ESP32 tu choi
//   timeout  -> qua han ma khong nghe gi
//
// LUU Y VE 'timeout': no KHONG co nghia la that bai.
//
// Het 10 giay ma khong nhan duoc ACK thi ta CHUA BIET ket qua. ACK co the bi mat
// duong, trong khi ESP32 da ap dung xong. Day la khac biet quan trong — hien thi
// "that bai" trong truong hop nay la noi sai su that.

import { pool } from './pool.js';

// Tao mot yeu cau moi o trang thai 'pending'.
//
// Neu gateway nay DA CO mot yeu cau 'pending', partial unique index trong
// schema.sql se nem loi. Ben goi nen kiem tra truoc bang findPendingByGateway
// de co thong bao ro rang.
export async function createConfigRequest({ requestId, deviceId, gatewayId, payload }) {
  await pool.query(
    `INSERT INTO config_request (request_id, device_id, gateway_id, payload)
     VALUES ($1, $2, $3, $4)`,
    [requestId, deviceId, gatewayId, JSON.stringify(payload)],
  );
}

// Yeu cau dang cho cua mot gateway, hoac null neu khong co.
export async function findPendingByGateway(gatewayId) {
  const result = await pool.query(
    `SELECT request_id, device_id, sent_at
     FROM config_request
     WHERE gateway_id = $1 AND status = 'pending'
     ORDER BY sent_at DESC
     LIMIT 1`,
    [gatewayId],
  );

  return result.rowCount === 0 ? null : result.rows[0];
}

// Cap nhat khi nhan duoc ACK.
//
// `WHERE status = 'pending'` la mot chot quan trong: no khien ACK den hai lan
// chi co tac dung mot lan. ACK thu hai se khop 0 dong, va ben goi biet do la
// ban trung — khong phai loi, chi la da xu ly roi.
//
// Tra ve matched=false cung xay ra khi requestId khong ton tai (vi du ACK cua
// mot yeu cau da qua han va bi danh dau 'timeout').
export async function applyConfigAck({ requestId, result, reason, persisted }) {
  const updated = await pool.query(
    `UPDATE config_request
     SET status = $2, result = $2, reason = $3, persisted = $4, ack_at = now()
     WHERE request_id = $1 AND status = 'pending'
     RETURNING request_id, gateway_id, device_id`,
    [requestId, result, reason, persisted],
  );

  return { matched: updated.rowCount > 0, row: updated.rows[0] ?? null };
}

// Danh dau mot yeu cau that bai ngay tu dau — vi du khong publish duoc.
//
// Khac voi 'timeout': day la biet chac chan chua gui di duoc.
export async function failConfigRequest({ requestId, reason }) {
  await pool.query(
    `UPDATE config_request
     SET status = 'rejected', reason = $2, ack_at = now()
     WHERE request_id = $1 AND status = 'pending'`,
    [requestId, reason],
  );
}

// Danh dau cac yeu cau da qua han cho thanh 'timeout'.
//
// `make_interval(secs => $1)` dung thay vi noi chuoi '10 seconds' — de khong
// phai lo ve kieu du lieu khi truyen tham so.
export async function expireStaleRequests(timeoutSeconds) {
  const result = await pool.query(
    `UPDATE config_request
     SET status = 'timeout'
     WHERE status = 'pending'
       AND sent_at < now() - make_interval(secs => $1)
     RETURNING request_id, gateway_id, device_id`,
    [timeoutSeconds],
  );

  return result.rows;
}

// Doc trang thai mot yeu cau, hoac null neu khong co.
export async function getConfigRequest(requestId) {
  const result = await pool.query(
    `SELECT request_id, device_id, gateway_id, status, result, reason, persisted,
            sent_at, ack_at
     FROM config_request
     WHERE request_id = $1`,
    [requestId],
  );

  if (result.rowCount === 0) {
    return null;
  }

  const row = result.rows[0];

  // Doi tu snake_case sang camelCase — cung nguyen tac voi cac file db/ khac:
  // database giu quy uoc cua no, ben nhan giu quy uoc cua no.
  return {
    requestId: row.request_id,
    deviceId: row.device_id,
    gatewayId: row.gateway_id,
    status: row.status,
    result: row.result,
    reason: row.reason,
    persisted: row.persisted,
    sentAt: row.sent_at,
    ackAt: row.ack_at,
  };
}
