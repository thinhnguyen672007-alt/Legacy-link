// validation/status.js
// nhiệm vụ: kiểm tra một payload status có hợp lệ không.

import { isPlainObject, checkDeviceId, checkTimestamp, checkSchemaVersion } from "./shared.js"


export function validateStatus(topicDeviceId, payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return {
      ok: false,
      errors: ["payload must be a object"]
    }
  }

// 1. Phỉa có deviceID trong payload và phải trùng với topicDeviceID

  checkDeviceId(topicDeviceId, payload.deviceId, errors);

  // 2. timestamp phải là một số nguyên 
  checkTimestamp(payload.timestamp, errors);

  // 3. schemaVersion: là số nguyên và phải là bằng 1 
  checkSchemaVersion(payload.schemaVersion, errors);

  if (!Number.isInteger(payload.timestamp)) {
    errors.push("timestamp must be an integer")
  } else if (payload.timestamp < MIN_VALID_TIMESTAMP_MS) {
    errors.push(`timestamp out of range (too old): ${payload.timestamp}`)
  } else if (payload.timestamp > Date.now() + MAX_FUTURE_SKEW_MS) {
    errors.push(`timestamp out of range (too new): ${payload.timestamp}`)
  }

  // 3. schemaVersion: là số nguyên và phải là bằng 1 
  if (!Number.isInteger(payload.schemaVersion)) {
    errors.push('schemaVersion must be a interger');  // kiểm tra schemaVersion có phải là số nguyên không 
  } else if (payload.schemaVersion !== 1) {
    errors.push(`schemaVersion is invalid, received: ${payload.schemaVersion}`)
  }

  // 4. bật/ tắt phải là bool kể cả object : "true" thì cũng loại 
  if (typeof payload.status !== 'boolean') {
    errors.push("status must be a boolean")
  } 

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
    };
  }

  return {
    ok: true,
    value: {
      deviceId: payload.deviceId,
      timestamp: payload.timestamp,
      status: payload.status,
      schemaVersion : payload.schemaVersion,
    },
  };
}