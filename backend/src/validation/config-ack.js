// validation/config-ack.js
// Nhiem vu: kiem tra goi tin XAC NHAN cau hinh do firmware gui ve.
//
// Day la loai message thu tu, khac han ba loai kia:
//
//   telemetry / status / alarm  =  firmware bao cao ve MAY
//   config ack                  =  firmware bao cao ve CHINH NO
//                                  (da nhan duoc cau hinh chua, co luu duoc khong)
//
// VI SAO KHONG DUNG LAI validateStatus:
// no doi deviceId, timestamp, schemaVersion day du. ACK thi khong — xem duoi.

const ALLOWED_RESULTS = new Set(['applied', 'unchanged', 'rejected']);

const ALLOWED_REASONS = new Set([
  'ok',
  'storage_error',
  'invalid_payload',
  'invalid_config',
  'device_id_mismatch',
  'out_of_memory',
  'apply_failed',
  'busy',
]);

// Kiem tra goi tin ACK.
//
// KHAC voi ba validator kia, ham nay CHIU DUOC THIEU TRUONG. Ly do nam trong
// tai lieu cua firmware:
//
//   - Gateway CHUA duoc cau hinh lan nao  -> ACK co the thieu deviceId
//   - Gateway CHUA co gio (NTP chua xong) -> ACK co the thieu timestamp
//   - Request hong ngay tu dau            -> ACK co the thieu requestId
//
// Chinh nhung ACK do moi la ACK TA CAN DOC NHAT — chung bao "toi chua san sang"
// hoac "cau hinh cua anh hong". Tu choi chung vi thieu truong la tu choi dung
// thong tin minh dang can.
//
// Nhung thu BAT BUOC: gatewayId (de biet ai dang noi) va result (de biet ket qua).
export function validateConfigAck(topicGatewayId, payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const errors = [];

  // gatewayId: bat buoc, va phai khop voi id tren topic.
  // Lech nhau nghia la co gi do sai trong duong truyen.
  if (typeof payload.gatewayId !== 'string' || payload.gatewayId.trim() === '') {
    errors.push('gatewayId must be a non-empty string');
  } else if (payload.gatewayId !== topicGatewayId) {
    errors.push(
      `gatewayId in payload ("${payload.gatewayId}") does not match topic ("${topicGatewayId}")`,
    );
  }

  // result: bat buoc. Day la cau tra loi chinh.
  if (typeof payload.result !== 'string') {
    errors.push('result must be a string');
  } else if (!ALLOWED_RESULTS.has(payload.result)) {
    errors.push(`result must be one of: ${[...ALLOWED_RESULTS].join(', ')}`);
  }

  // reason: tuy chon, nhung co thi phai nam trong danh sach.
  if (payload.reason !== undefined && payload.reason !== null) {
    if (typeof payload.reason !== 'string') {
      errors.push('reason must be a string when present');
    } else if (!ALLOWED_REASONS.has(payload.reason)) {
      errors.push(`reason must be one of: ${[...ALLOWED_REASONS].join(', ')}`);
    }
  }

  // persisted: tuy chon, nhung co thi phai la boolean THAT.
  // Y nghia: true = da ghi xuong flash (song qua tat dien)
  //          false = chi nam trong RAM (tat dien la mat)
  if (payload.persisted !== undefined && payload.persisted !== null) {
    if (typeof payload.persisted !== 'boolean') {
      errors.push('persisted must be a boolean when present');
    }
  }

  // requestId: tuy chon — ACK cua request hong co the khong co.
  if (payload.requestId !== undefined && payload.requestId !== null) {
    if (typeof payload.requestId !== 'string') {
      errors.push('requestId must be a string when present');
    }
  }

  // deviceId: tuy chon — gateway chua duoc cau hinh thi khong biet.
  if (payload.deviceId !== undefined && payload.deviceId !== null) {
    if (typeof payload.deviceId !== 'string') {
      errors.push('deviceId must be a string when present');
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      gatewayId: payload.gatewayId,
      result: payload.result,
      reason: payload.reason ?? null,
      persisted: payload.persisted ?? null,
      requestId: payload.requestId ?? null,
      deviceId: payload.deviceId ?? null,
      timestamp: payload.timestamp ?? null,
    },
  };
}
