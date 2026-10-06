// index.js
// Nhiem vu: entrypoint cua backend. Noi cac manh lai voi nhau va quan ly
// vong doi tien trinh (bat SIGINT/SIGTERM de tat dung cach).

import { config } from './config.js';
import { startMqttClient, getStats } from './mqtt/client.js';
import { validateTelemetry } from './validation/telemetry.js';
import { validateStatus } from './validation/status.js';
import { validateAlarm, ALARM_HINTS, SEVERITY_HINTS } from './validation/alarm.js';
import { checkCatalogMetrics } from './validation/catalog-check.js';
import { saveTelemetry } from './db/telemetry.js';
import { saveStatus } from './db/status.js';
import { saveAlarm } from './db/alarm.js';
import { closePool } from './db/pool.js';



console.log('[BACKEND] Khoi dong MQTT consumer...');
console.log(`[BACKEND] Broker: ${config.mqtt.url}`);

// Kiem tra mot lan luc khoi dong: moi chi so trong catalog phai nam trong
// ALLOWED_METRICS. Khong de loi o day lam sap backend — chi canh bao.
try {
  await checkCatalogMetrics();
} catch (err) {
  console.warn('[CATALOG] Khong kiem tra duoc catalog:', err.message);
}

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
  onTelemetry: async (deviceId, payload) => {
    const result = validateTelemetry(deviceId, payload);

    if (!result.ok) {
      console.error(`[TELEMETRY] Bo qua ${deviceId}:`, result.errors.join('; '));
      return;
    }

    const telemetry = result.value;

    try {
      const { inserted } = await saveTelemetry(telemetry);

      if (inserted) {
        console.log(`[TELEMETRY] ${telemetry.deviceId}:`, JSON.stringify(telemetry.metrics));
      } else {
        console.log(`[TELEMETRY] ${telemetry.deviceId}: ban ghi trung lap, da bo qua`);
      }
    } catch (err) {
      // Database loi thi ghi log roi di tiep. Khong de mot loi ha tang lam
      // sap ca tien trinh dang phuc vu cac thiet bi khac.
      console.error(`[TELEMETRY] Loi ghi database:`, err.message);
    }

    logTiming(telemetry);
  },
  onStatus: async (deviceId, payload) => {
    const result = validateStatus(deviceId, payload);

    if (!result.ok) {
      console.error(`[STATUS] Bo qua ${deviceId}:`, result.errors.join('; '));
      return;
    }

    const status = result.value;

    try {
      await saveStatus(status);

      console.log(`[STATUS] ${status.deviceId}: ${status.status ? 'online' : 'offline'}`);
    } catch (err) {
      console.error(`[STATUS] Loi ghi database:`, err.message);
    }

    logTiming(status);
  },
  onAlarm: async (deviceId, payload) => {
    const result = validateAlarm(deviceId, payload);

    if (!result.ok) {
      console.error(`[ALARM] Bo qua ${deviceId}:`, result.errors.join('; '));
      return;
    }

    const alarm = result.value;

    try {
      const { inserted } = await saveAlarm(alarm);

      if (inserted) {
        console.log(
          `[ALARM] ${alarm.deviceId}: ${alarm.code} [${alarm.severity}] -> ${ALARM_HINTS[alarm.code]}; ${SEVERITY_HINTS[alarm.severity]}`,
        );
      } else {
        console.log(`[ALARM] ${alarm.deviceId}: ban ghi trung lap, da bo qua`);
      }
    } catch (err) {
      console.error(`[ALARM] Loi ghi database:`, err.message);
    }
    logTiming(alarm);
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

    client.end(false, {}, async () => {
      console.log('[BACKEND] Da dong ket noi MQTT.');
      await closePool();
      console.log('[BACKEND] Da dong connection pool.');
      process.exit(0);
    });
  });
}
