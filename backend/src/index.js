// index.js
// Nhiem vu: entrypoint cua backend. Noi cac manh lai voi nhau va quan ly
// vong doi tien trinh (bat SIGINT/SIGTERM de tat dung cach).

import { config } from './config.js';
import { startMqttClient, getStats } from './mqtt/client.js';
import { validateTelemetry } from './validation/telemetry.js';
import { validateStatus } from './validation/status.js';
import { validateAlarm, ALARM_HINTS, SEVERITY_HINTS } from './validation/alarm.js';
import { validateConfigAck } from './validation/config-ack.js';
import { checkCatalogMetrics } from './validation/catalog-check.js';
import { saveTelemetry } from './db/telemetry.js';
import { saveStatus } from './db/status.js';
import { saveDiagnostics } from './db/diagnostics.js';
import { saveAlarm } from './db/alarm.js';
import { closePool } from './db/pool.js';
import { expireStaleRequests } from './db/config-request.js';
import { handleConfigAck } from './service/apply-config.js';



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
  onDiagnostics: (deviceId, payload) => saveDiagnostics(deviceId, payload),
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
  onStatus: async (deviceId, payload, packet) => {
    const result = validateStatus(deviceId, payload);

    if (!result.ok) {
      console.error(`[STATUS] Bo qua ${deviceId}:`, result.errors.join('; '));
      return;
    }

    const status = result.value;

    // packet.retain = true nghia la broker dang PHAT LAI mot message da giu tu
    // truoc, khong phai co ai vua gui no. Xem giai thich trong db/status.js.
    const retained = packet?.retain === true;

    try {
      await saveStatus({ ...status, retained });

      const nhan = status.status ? 'online' : 'offline';
      const ghiChu = retained ? '  (retained — KHONG tinh la heartbeat)' : '';
      console.log(`[STATUS] ${status.deviceId}: ${nhan}${ghiChu}`);
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
  },
  onConfigAck: async (gatewayId, payload) => {
    const result = validateConfigAck(gatewayId, payload);

    if (!result.ok) {
      console.error(`[CONFIG-ACK] Bo qua ${gatewayId}:`, result.errors.join('; '));
      return;
    }

    const ack = result.value;

    try {
      const { matched } = await handleConfigAck({
        requestId: ack.requestId,
        result: ack.result,
        reason: ack.reason,
        persisted: ack.persisted,
      });

      if (!matched) {
        // Khong khop yeu cau nao dang cho. Ba kha nang:
        //   - ACK den hai lan (yeu cau da xu ly roi)
        //   - requestId khong ton tai
        //   - yeu cau da bi danh dau 'timeout' TRUOC khi ACK ve kip
        //
        // Truong hop thu ba la binh thuong, khong phai loi: ACK di cham hon
        // 10 giay. ESP32 van da ap dung cau hinh.
        console.warn(
          `[CONFIG-ACK] ${ack.gatewayId}: khong khop yeu cau nao dang cho (requestId=${ack.requestId ?? 'khong co'})`,
        );
        return;
      }

      // persisted phan biet hai chuyen rat khac nhau:
      //   true  = firmware da ghi xuong flash -> song qua lan tat dien tiep theo
      //   false = chi nam trong RAM -> tat dien la mat, cau hinh cu quay lai
      const luu =
        ack.persisted === null ? 'khong ro' : ack.persisted ? 'da luu flash' : 'CHI TRONG RAM';

      console.log(
        `[CONFIG-ACK] ${ack.gatewayId}: ${ack.result} / ${ack.reason ?? 'khong ro ly do'} / ${luu}` +
          ` / requestId=${ack.requestId}`,
      );
    } catch (err) {
      console.error('[CONFIG-ACK] Loi ghi database:', err.message);
    }
  }
});

// ---------------------------------------------------------------------------
// Bo dem don dep cac yeu cau cau hinh da qua han.
//
// VI SAO CAN: sau khi gui cau hinh, ta cho ACK. Neu ACK khong bao gio den —
// mat mang, ESP32 chet, hoac ACK bi mat duong — thi yeu cau nam 'pending'
// MAI MAI.
//
// Va vi luat "moi gateway chi mot yeu cau dang cho", gateway do se KHONG BAO GIO
// gui duoc cau hinh moi nua. Mot yeu cau treo lam khoa vinh vien thiet bi do.
// ---------------------------------------------------------------------------
const CONFIG_ACK_TIMEOUT_SECONDS = 10;

setInterval(async () => {
  try {
    const expired = await expireStaleRequests(CONFIG_ACK_TIMEOUT_SECONDS);

    for (const row of expired) {
      // Noi ro 'timeout' KHONG co nghia 'that bai'.
      //
      // Het 10 giay ma khong nghe gi thi ta CHUA BIET ket qua — ACK co the bi
      // mat trong khi ESP32 da ap dung xong. Hien thi "that bai" la noi sai.
      console.warn(
        `[CONFIG] Yeu cau ${row.request_id} qua ${CONFIG_ACK_TIMEOUT_SECONDS}s khong co ACK` +
          ` (gateway ${row.gateway_id}, thiet bi ${row.device_id}).` +
          ` CHUA BIET ket qua — khong phai that bai.`,
      );
    }
  } catch (err) {
    console.error('[CONFIG] Loi kiem tra yeu cau qua han:', err.message);
  }
}, 5000);


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
