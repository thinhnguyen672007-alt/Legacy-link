// validation/alarm.js
// Nhiem vu: kiem tra mot payload alarm co hop le khong.
//
// Alarm la loai message quan trong nhat trong ba loai. Telemetry sai thi bieu
// do sai. Status sai thi dashboard hien sai trang thai. Nhung alarm sai thi
// co nguoi bi danh thuc luc 3 gio sang — hoac te hon, mot alarm that bi bo qua
// vi chim trong mot loat alarm gia.
//
// validateAlarm la ham THUAN: khong log, khong goi database, khong biet gi ve
// MQTT. Vao: du lieu. Ra: phan quyet. Nho vay test duoc ma khong can ha tang.

import { isPlainObject, checkDeviceId, checkTimestamp, checkSchemaVersion } from "./shared.js";

// Ma alarm duoc phep. Firmware khong the tu nghi ra ma moi, vi backend phai
// biet cach hien thi va xu ly tung ma.
const ALLOWED_CODES = new Set(['OVERHEAT', 'OVERCURRENT', 'OVERSPEED', 'VIBRATION']);

// Muc do nghiem trong. Quyet dinh AI duoc goi va GAP den muc nao.
const ALLOWED_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

// Thong diep cho nguoi doc. Day KHONG phai loi validation — no la du lieu de
// hien thi. Vi vay no nam ngoai validator, va tang xu ly (index.js) moi dung.
export const ALARM_HINTS = {
  OVERHEAT: 'The temperature of machine needs to cool down',
  OVERCURRENT: 'The current of machine needs to be limited',
  OVERSPEED: 'The speed of machine needs to slow down',
  VIBRATION: 'The vibration of machine needs to be handled',
};

export const SEVERITY_HINTS = {
  low: 'Track it',
  medium: 'Check it today',
  high: 'Call the engineer on duty',
  critical: 'Stop the machine',
};

export function validateAlarm(topicDeviceId, payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const errors = [];

  checkDeviceId(topicDeviceId, payload.deviceId, errors);
  checkTimestamp(payload.timestamp, errors);
  checkSchemaVersion(payload.schemaVersion, errors);

  if (typeof payload.code !== 'string') {
    errors.push('code must be a string');
  } else if (!ALLOWED_CODES.has(payload.code)) {
    errors.push(`code must be one of: ${[...ALLOWED_CODES].join(', ')}`);
  }

  if (typeof payload.severity !== 'string') {
    errors.push('severity must be a string');
  } else if (!ALLOWED_SEVERITIES.has(payload.severity)) {
    errors.push(`severity must be one of: ${[...ALLOWED_SEVERITIES].join(', ')}`);
  }

  // value la TUY CHON: gia tri do da kich hoat alarm (nhiet do, dong dien...).
  //
  // "Khong co gia tri" co the den bang HAI cach, va ca hai phai duoc chap nhan
  // nhu nhau:
  //   - thieu han truong trong JSON      -> undefined
  //   - gui null                          -> null
  //
  // Cach thu hai rat de xay ra: nhieu bo tao JSON xuat ra `"value": null` khi
  // khong co gia tri. Neu chi kiem tra `!== undefined` thi moi alarm khong kem
  // gia tri se bi tu choi — va nguoi phat hien se la nguoi viet firmware, qua
  // mot thong bao loi chi hien o phia backend.
  //
  // KHONG noi suy gia tri vao thong bao loi — xem giai thich trong telemetry.js.
  const hasValue = payload.value !== undefined && payload.value !== null;

  if (hasValue && !Number.isFinite(payload.value)) {
    errors.push(`value must be a finite number when present, received type: ${typeof payload.value}`);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      deviceId: payload.deviceId,
      timestamp: payload.timestamp,
      schemaVersion: payload.schemaVersion,
      code: payload.code,
      severity: payload.severity,
      value: payload.value,
    },
  };
}
