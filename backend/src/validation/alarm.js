import { isPlainObject, MIN_VALID_TIMESTAMP_MS, MAX_FUTURE_SKEW_MS } from "./shared.js"

export function validateAlarm(topicDeviceId, payload) {
    const errors = [];

    if (!isPlainObject(payload)) {
        return {
            ok: false,
            errors: ["payload must be a object"]
        }
    }

    // 1. deviceId phải là string và phải trùng với topicDeviceId
    if(typeof payload.deviceId !== "string" || payload.deviceId.trim() === "") {
        errors.push("DeviceID msst be a string");
    } else if (payload.deviceId !== topicDeviceId) {
        errors.push(`DeviceID must be equal to topicDeviceID ${topicDeviceId}, received: ${payload.deviceId}`);
    }

    // 2. timestamp phải là một số nguyên 
    if(!Number.isInteger(payload.timestamp)) { 
        errors.push('Timestamp must be a interger');
    } else if (payload.timestamp > MIN_VALID_TIMESTAMP_MS) {
        errors.push(`Timestamp out of range (too old): ${payload.timestamp}`)
    } else if (payload.timestamp > Date.now() + MAX_FUTURE_SKEW_MS) {
        errors.push(`Timestamp out of range (too new): ${payload.timestamp}`)
    }

    // 3. schemaVersion phải là một số nguyên 
    if(!Number.isInteger(payload.schemaVersion)) {
        errors.push("schemaVersion must be a interger");
    } else if (payload.schemaVersion !== 1) {
        errors.push(`schemaVersion is invalid, received: ${payload.schemaVersion}`)
    }
    
    // 4. code và severity 
    // Code : Overheat, Overcurrent, Overspeed, Vibration
    // Severity : low, medium, high, critical
    if(payload.code === 'OVERHEAT') {
        errors.push('The temperature of machine need to cool down')
    } else if (payload.code === 'OVERCURRENT') {
        errors.push('The current of machine need to limit')
    } else if (payload.code === 'OVERSPEED') {
        errors.push('The speed of machine need to slow down')
    } else if (payload.code === 'VIBRATION') {
        errors.push('The vibration of machine need to handle')
    }
    
    if (payload.severity === 'low') {
        errors.push('The machine need to track')
    } else if (payload.severity === 'medium') {
        errors.push('The machine need to check')
    } else if (payload.severity === 'high') {
        errors.push('The machine need to call the engineering')
    } else if (payload.severity === 'critical') {
        errors.push('The machine need to stop')
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
            code: payload.code,
            severity: payload.severity,
            schemaVersion: payload.schemaVersion,
        },
    };
}
