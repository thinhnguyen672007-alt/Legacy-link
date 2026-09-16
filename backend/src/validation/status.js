// validation/status.js
// nhiệm vụ: kiểm tra một payload status có hợp lệ không.

const MIN_VALID_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000; // 1 tiếng 

function isValidStatus(value) {
  return value !== "undefined" && typeof value === "string" && value.trim() !== "";
}


export function validateStatus(topicDeviceID, payload) {
  const errors = [];

  if (isValidStatus(payload)) {
    return {
      ok: false,
      errors: ["payload must be a valid status string"]
    }
  }

// 1. Phỉa có deviceID trong payload và phải trùng với topicDeviceID

  if (typeof payload.deviceId !== 'string' || payload.deviceId.trim() === '') {
    errors.push("deviceId must be a non-empty string")
  } else if (payload.deviceId !== topicDeviceID) {
    errors.push(`deviceId in payload ("${payload.deviceId}") does not match topic ("${topicDeviceID}")`);
  }

  // 2. timestamp phải là một số nguyên 
  if (!Number.isInteger(payload.timestamp)) {
    errors.push("timestamp must be an integer")
  } else if (payload.timestamp < MIN_VALID_TIMESTAMP_MS) {
    errors.push(`timestamp out of range (too old): ${payload.timestamp}`)
  } else if (payload.timestamp > Date.now() + MAX_FUTURE_SKEW_MS) {
    errors.push(`timestamp out of range (too new): ${payload.timestamp}`)
  }

  // 3. bật/ tắt phải là bool kể cả object : "true" thì cũng loại 
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
    },
  };
}