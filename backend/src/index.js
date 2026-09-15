// index.js
// Nhiem vu: entrypoint cua backend. Noi cac manh lai voi nhau va quan ly
// vong doi tien trinh (bat SIGINT/SIGTERM de tat dung cach).

import { config } from './config.js';
import { startMqttClient, getStats } from './mqtt/client.js';
import { validateTelemetry } from './validation/telemetry.js';


console.log('[BACKEND] Khoi dong MQTT consumer...');
console.log(`[BACKEND] Broker: ${config.mqtt.url}`);

let countSigint = 0


function logTiming(payload){
  const receivedAt = Date.now();

    if (payload.timestamp) {
      console.log('ReceivedAt at : ' + new Date(receivedAt).toISOString())
      console.log('Timestamp at : ' + new Date(payload.timestamp).toISOString())
      console.log('Time Consuming:', (receivedAt - payload.timestamp) / 1000, 's');
    }
}

const client = startMqttClient({
  onTelemetry: (deviceId, payload) => {
    const result = validateTelemetry(deviceId, payload);

    if (!result.ok) {
      console.error(`[TELEMETRY] Bo qua ${deviceId}:`, result.errors.join('; '));
      return;
    }

    const telemetry = result.value;

    console.log(`[TELEMETRY] ${telemetry.deviceId}:`, JSON.stringify(telemetry.metrics));

    logTiming(telemetry);
  },
  onStatus: (deviceId, payload) => {
    console.log(`[STATUS] ${deviceId}:`, JSON.stringify(payload));

    
    logTiming(payload);
  },
  onAlarm: (deviceId, payload) => {
    console.log(`[ALARM] ${deviceId}:`, JSON.stringify(payload));

    logTiming(payload);
  }
});


// Dong ket noi gon gang khi Ctrl+C (SIGINT) hoac khi container bi stop (SIGTERM).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[BACKEND] Nhan ${signal}, dang dung...`);

    if (signal === 'SIGINT') {
      countSigint++
    }

    console.log('Total CountSigint: ', countSigint)
    console.log('Errors count: ', getStats().errorsCount)

    client.end(false, {}, () => {
      console.log('[BACKEND] Da dong ket noi MQTT.');
      process.exit(0);
    });
  });
}
