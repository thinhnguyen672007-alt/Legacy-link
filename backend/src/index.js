// index.js
// Nhiem vu: entrypoint cua backend. Noi cac manh lai voi nhau va quan ly
// vong doi tien trinh (bat SIGINT/SIGTERM de tat dung cach).

import { config } from './config.js';
import { startMqttClient, getStats } from './mqtt/client.js';


console.log('[BACKEND] Khoi dong MQTT consumer...');
console.log(`[BACKEND] Broker: ${config.mqtt.url}`);

let countSigint = 0


console.log("CountSigint: ", countSigint);

const client = startMqttClient({
  onTelemetry: (deviceId, payload) => {
    console.log(`[TELEMETRY] ${deviceId}:`, JSON.stringify(payload));
    console.log('recievedAt at : ' + new Date().toISOString())
    console.log('timestamp at : ' + new Date(payload.timestamp).toISOString())
    console.log('Time Counsuming:', (Date.now() - payload.timestamp) / 1000, 's');
  },
  onStatus: (deviceId, payload) => {
    console.log(`[STATUS] ${deviceId}:`, JSON.stringify(payload));
  },
  onAlarm: (deviceId, payload) => {
    console.log(`[ALARM] ${deviceId}:`, JSON.stringify(payload));

    process.on(signal, () => {
      if (signal === 'SIGINT') {
        countSigint++
      }
    })
    console.log('CountSigint: ', countSigint)
  }
});

const qos = Number.parseInt(process.env.MQTT_QOS ?? '1', 10);
if (![0, 1, 2].includes(qos)) {
  console.error(`[BACKEND] QOS khong hop le: ${process.env.MQTT_QOS} -> chỉ nhận 0, 1, 2`);
  process.exit(1);
}


// Dong ket noi gon gang khi Ctrl+C (SIGINT) hoac khi container bi stop (SIGTERM).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`[BACKEND] Nhan ${signal}, dang dung...`);
    client.end(false, {}, () => {
      console.log('[BACKEND] Da dong ket noi MQTT.');
      process.exit(0);
    });
  });
}
