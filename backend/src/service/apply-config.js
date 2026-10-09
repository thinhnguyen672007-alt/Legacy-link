// service/apply-config.js
// Nhiem vu: ap dung cau hinh cho mot thiet bi — nghiep vu, khong phai ky thuat.
//
// DAY LA TANG SERVICE. No ghep ba manh lai:
//   1. Doc catalog tu database        (tang db/)
//   2. Ghi yeu cau theo doi vao DB    (tang db/)
//   3. Gui len MQTT                   (tang mqtt/)
//
// No KHONG chua SQL, va KHONG biet gi ve HTTP. Nho vay cung ham nay dung duoc
// tu HTTP endpoint, tu mot script dong lenh, hay tu test — ma khong phai sua gi.

import { randomUUID } from 'node:crypto';

import { getConfigTarget } from '../db/catalog.js';
import {
  applyConfigAck,
  createConfigRequest,
  failConfigRequest,
  findPendingByGateway,
} from '../db/config-request.js';
import { deviceConfigTopic } from '../config.js';
import { publishJson } from '../mqtt/publisher.js';

// Ket qua tra ve dung dang { ok, code } giong cac validator — de ben goi phan
// biet duoc ma loi nao ma xu ly (tra 404, 409, 503...), khong phai doan tu chuoi.
export async function applyConfig({ deviceId, publishClient }) {
  if (!publishClient.connected) return { ok: false, code: 'publish_failed' };

  // BUOC 1: thiet bi co ton tai khong, va gateway cua no la gi?
  const target = await getConfigTarget(deviceId);

  if (target === null) {
    return { ok: false, code: 'unknown_device' };
  }

  // BUOC 2: gateway nay co yeu cau nao dang cho khong?
  //
  // Gui hai cau hinh cung luc cho mot thiet bi se lam no roi — no khong biet
  // cai nao moi. Nen chi mot yeu cau tai mot thoi diem.
  //
  // Kiem tra o day de co thong bao ro rang. Rang buoc trong database (partial
  // unique index) la lop chan cuoi cung, phong khi co hai request chay song song.
  const pending = await findPendingByGateway(target.gatewayId);

  if (pending !== null) {
    return { ok: false, code: 'already_pending', pending };
  }

  // BUOC 3: tao yeu cau va luu TRUOC khi gui.
  //
  // Thu tu nay quan trong: luu truoc, gui sau. Neu gui truoc roi moi luu, va
  // tien trinh chet giua hai buoc, ta da gui mot yeu cau ma khong ai theo doi —
  // ACK ve sau se khong khop duoc voi cai gi.
  const requestId = randomUUID();

  await createConfigRequest({
    requestId,
    deviceId,
    gatewayId: target.gatewayId,
    payload: target.config,
  });

  // BUOC 4: gui.
  try {
    await publishJson(publishClient, deviceConfigTopic(deviceId), {
      ...target.config,
      requestId,
    });
  } catch (err) {
    // Gửi lệnh lỗi hoặc quá hạn: chưa biết ESP32 đã nhận hay chưa, không kết luận thất bại chắc chắn.
    await failConfigRequest({ requestId, reason: `publish_failed: ${err.message}` });
    return { ok: false, code: 'publish_failed', requestId };
  }

  // Tra ve ngay, KHONG cho ACK.
  //
  // Endpoint nay tra 202 (Accepted) chu khong phai 200: yeu cau da duoc nhan,
  // nhung CHUA xong. Ket qua that den sau, qua ACK. Ben goi phai hoi lai bang
  // GET /config-requests/:requestId.
  return { ok: true, requestId, gatewayId: target.gatewayId, deviceId };
}

// Xu ly ACK den tu thiet bi.
//
// Tra ve matched=false khi:
//   - requestId khong ton tai
//   - yeu cau da duoc xu ly roi (ACK den hai lan)
//   - yeu cau da qua han va bi danh dau 'timeout'
export async function handleConfigAck({ requestId, gatewayId, result, reason, persisted }) {
  if (requestId === null) {
    return { matched: false, reason: 'ack_khong_co_requestId' };
  }

  return applyConfigAck({ requestId, gatewayId, result, reason, persisted });
}
