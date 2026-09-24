// validation/status.js
// Nhiem vu: kiem tra mot payload status co hop le khong.
//
// Status la tin hieu song con cua thiet bi. Firmware gui retained message nay
// kem Last Will and Testament, nen khi thiet bi mat dien, broker tu phat mot
// payload "offline" thay no.

import { isPlainObject, checkDeviceId, checkTimestamp, checkSchemaVersion } from "./shared.js";

export function validateStatus(topicDeviceId, payload) {
  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const errors = [];

  checkDeviceId(topicDeviceId, payload.deviceId, errors);
  checkTimestamp(payload.timestamp, errors);
  checkSchemaVersion(payload.schemaVersion, errors);

  // Online/offline phai la boolean THAT. Chuoi "true" cung bi tu choi,
  // vi do la loi firmware rat de xay ra.
  if (typeof payload.status !== 'boolean') {
    errors.push('status must be a boolean');
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
      status: payload.status,
    },
  };
}
