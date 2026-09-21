export const MIN_VALID_TIMESTAMP_MS = Date.UTC(2020, 0, 1);
export const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000; // 1 tiếng 

// kiểm tra có để tránh bị null và giá trị phải là một object và không phải là một mảng 
export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}


// check deviceID
export function checkDeviceId(topicDeviceId, deviceId, errors) {
  if (typeof deviceId !== 'string' || deviceId.trim() === '') {
    errors.push('deviceId must be a non-empty string');
  } else if (deviceId !== topicDeviceId) {
    errors.push(`deviceId in payload ("${deviceId}") does not match topic ("${topicDeviceId}")`);
  }
}


//check timestamp
export function checkTimestamp(timestamp, errors) {
  if (!Number.isInteger(timestamp)) {
    errors.push('timestamp must be an integer');
  } else if (timestamp < MIN_VALID_TIMESTAMP_MS) {
    errors.push(`timestamp out of range (too old): ${timestamp}`);
  } else if (timestamp > Date.now() + MAX_FUTURE_SKEW_MS) {
    errors.push(`timestamp out of range (too new): ${timestamp}`);
  }
}

//check schemaVersion
export function checkSchemaVersion(schemaVersion, errors) {
  if (!Number.isInteger(schemaVersion)) {
    errors.push('schemaVersion must be an integer');
  } else if (schemaVersion !== 1) {
    errors.push(`schemaVersion is invalid, received: ${schemaVersion}`);
  }
}
