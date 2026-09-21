import { isPlainObject, checkDeviceId, checkTimestamp, checkSchemaVersion } from "./shared.js"

export function validateAlarm(topicDeviceId, payload) {
    const errors = [];

    if (!isPlainObject(payload)) {
        return {
            ok: false,
            errors: ["payload must be a object"]
        }
    }

    // 1. deviceId phải là string và phải trùng với topicDeviceId
    checkDeviceId(topicDeviceId, payload.deviceId, errors);

    // 2. timestamp phải là một số nguyên 
    checkTimestamp(payload.timestamp, errors);

    // 3. schemaVersion phải là một số nguyên 
    checkSchemaVersion(payload.schemaVersion, errors);
    
    // 4. code và severity 
    // Code : Overheat, Overcurrent, Overspeed, Vibration
    // Severity : low, medium, high, critical

    const allowedCode = ['OVERHEAT', 'OVERCURRENT', 'OVERSPEED', 'VIBRATION'];
    const allowedSeverity = ['low', 'medium', 'high', 'critical'];

    if(typeof payload.code !== 'string' || payload.code.trim() === '') {
        errors.push('code must be a string');
    } else if (!allowedCode.includes(payload.code)) {
        errors.push(`code must be one of ${allowedCode.join(', ')}`);
    }
    if(typeof payload.severity !== 'string' || payload.severity.trim() === '') {
        errors.push('severity must be a string');
    } else if (!allowedSeverity.includes(payload.severity)) {
        errors.push(`severity must be one of ${allowedSeverity.join(', ')}`);
    }  


    if(payload.code === 'OVERHEAT') {
        console.log('The temperature of machine need to cool down')
    } else if (payload.code === 'OVERCURRENT') {
        console.log('The current of machine need to limit')
    } else if (payload.code === 'OVERSPEED') {
        console.log('The speed of machine need to slow down')
    } else if (payload.code === 'VIBRATION') {
        console.log('The vibration of machine need to handle')
    }
    
    if (payload.severity === 'low') {
        console.log('The machine need to track')
    } else if (payload.severity === 'medium') {
        console.log('The machine need to check')
    } else if (payload.severity === 'high') {
        console.log('The machine need to call the engineering')
    } else if (payload.severity === 'critical') {
        console.log('The machine need to stop')
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
