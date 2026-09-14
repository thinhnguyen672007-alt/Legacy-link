// index.js
// Nhiem vu: entrypoint cua backend. Noi cac manh lai voi nhau va quan ly
// vong doi tien trinh (bat SIGINT/SIGTERM de tat dung cach).

import { config } from './config.js';
import { startMqttClient } from './mqtt/client.js';

console.log('[BACKEND] Khoi dong MQTT consumer...');
console.log(`[BACKEND] Broker: ${config.mqtt.url}`);

const client = startMqttClient({
  onTelemetry: (deviceId, payload) => {
    console.log(`[TELEMETRY] ${deviceId}:`, JSON.stringify(payload));
  },
  onStatus: (deviceId, payload) => {
    console.log(`[STATUS] ${deviceId}:`, JSON.stringify(payload));
  },
});

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
