import { snapshot } from './observability.js';
import { recordConsumerHealth } from './db/health.js';
import { createIngestionHandler } from './ingestion/handler.js';
// index.js
// Nhiem vu: entrypoint cua backend. Noi cac manh lai voi nhau va quan ly
// vong doi tien trinh (bat SIGINT/SIGTERM de tat dung cach).

import { config } from './config.js';
import { startMqttClient, getStats } from './mqtt/client.js';
import { validateTelemetry } from './validation/telemetry.js';
import { validateStatus } from './validation/status.js';
import { validateAlarm } from './validation/alarm.js';
import { validateConfigAck } from './validation/config-ack.js';
import { checkCatalogMetrics } from './validation/catalog-check.js';
import { saveTelemetry } from './db/telemetry.js';
import { saveStatus } from './db/status.js';
import { saveDiagnostics } from './db/diagnostics.js';
import { saveAlarm } from './db/alarm.js';
import { closePool } from './db/pool.js';
import { expireStaleRequests } from './db/config-request.js';
import { recordServiceStart, recordServiceStop } from './db/service-run.js';
import { handleConfigAck } from './service/apply-config.js';

console.log('[BACKEND] Khoi dong MQTT consumer...');
console.log(`[BACKEND] Broker: ${config.mqtt.url}`);

// Kiểm tra hình dạng tên metric trong catalog lúc khởi động; quyền theo máy kiểm tra lúc lưu.
try {
  await checkCatalogMetrics();
} catch (err) {
  console.warn('[CATALOG] Khong kiem tra duoc catalog:', err.message);
}

// Lịch sử chạy chỉ cho biết nguy cơ gián đoạn, không chứng minh số mẫu bị mất.
// Firmware có hàng đợi và ID riêng có thể gửi bù sau khi backend hoạt động lại.
let currentRunId = null;

try {
  const { runId, staleRuns } = await recordServiceStart();
  currentRunId = runId;

  for (const run of staleRuns) {
    console.warn(
      `[UPTIME] Lan chay truoc (bat dau ${new Date(run.started_at).toISOString()})` +
        ` ket thuc BAT THUONG — khong ghi duoc gio dung.`
    );
    console.warn(
      `[UPTIME] Co nguy co gian doan du lieu; can doi chieu hang doi va sequence cua firmware.` +
        ` Dashboard se hien khoang trang nay (xem GET /uptime).`
    );
  }
} catch (err) {
  // Khong ghi duoc lich su chay KHONG duoc lam backend khong khoi dong duoc.
  // Thu tu uu tien: nhan du lieu > ghi chep ve viec nhan du lieu.
  console.warn('[UPTIME] Khong ghi duoc lich su khoi dong:', err.message);
}

let stopping = false;

function logTiming(payload) {
  const receivedAt = Date.now();

  if (payload.timestamp) {
    console.log('ReceivedAt at : ' + new Date(receivedAt).toISOString());
    console.log('Timestamp at : ' + new Date(payload.timestamp).toISOString());
    console.log('Time Consuming:', (receivedAt - payload.timestamp) / 1000, 's');
  }
}

function publishIngestionAck(topic, payload) {
  // Khi MQTT mất kết nối, không gom ACK vào bộ nhớ; firmware sẽ gửi lại mẫu để lấy ACK mới.
  if (!client.connected) return Promise.reject(new Error('MQTT disconnected before ACK'));
  return client.publishAsync(topic, JSON.stringify(payload), { qos: 1, retain: false });
}

const client = startMqttClient({
  onDiagnostics: (deviceId, payload) => saveDiagnostics(deviceId, payload),
  onTelemetry: createIngestionHandler({
    kind: 'telemetry',
    validate: validateTelemetry,
    save: saveTelemetry,
    publish: publishIngestionAck,
  }),
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
  onAlarm: createIngestionHandler({
    kind: 'alarm',
    validate: validateAlarm,
    save: saveAlarm,
    publish: publishIngestionAck,
  }),
  onConfigAck: async (gatewayId, payload, packet) => {
    if (packet?.retain) return; // ACK phát lại từ broker không xác nhận lệnh mới.
    const result = validateConfigAck(gatewayId, payload);

    if (!result.ok) {
      console.error(`[CONFIG-ACK] Bo qua ${gatewayId}:`, result.errors.join('; '));
      return;
    }

    const ack = result.value;

    try {
      const { matched } = await handleConfigAck({
        requestId: ack.requestId,
        gatewayId: ack.gatewayId,
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
          `[CONFIG-ACK] ${ack.gatewayId}: khong khop yeu cau nao dang cho (requestId=${ack.requestId ?? 'khong co'})`
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
          ` / requestId=${ack.requestId}`
      );
    } catch (err) {
      console.error('[CONFIG-ACK] Loi ghi database:', err.message);
    }
  },
});

// HTTP và consumer là hai chương trình riêng nên chia sẻ trạng thái qua PostgreSQL.
// Consumer cập nhật tín hiệu mỗi 5 giây; tín hiệu quá 15 giây được coi là đã cũ.
let healthBusy = false;
async function heartbeatConsumer() {
  if (healthBusy) return;
  healthBusy = true;
  try {
    await recordConsumerHealth(
      config.mqtt.clientId,
      !stopping && client.connected && getStats().subscribed,
      { ...snapshot(), mqtt: getStats() }
    );
  } catch (err) {
    console.warn('[HEALTH] Consumer heartbeat failed:', err.message);
  } finally {
    healthBusy = false;
  }
}
const healthTimer = setInterval(heartbeatConsumer, 5000);
void heartbeatConsumer();

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

let expiryBusy = false;
const expiryTimer = setInterval(async () => {
  if (expiryBusy || stopping) return;
  expiryBusy = true;
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
          ` CHUA BIET ket qua — khong phai that bai.`
      );
    }
  } catch (err) {
    console.error('[CONFIG] Loi kiem tra yeu cau qua han:', err.message);
  } finally {
    expiryBusy = false;
  }
}, 5000);

// C12: chỉ ghi stopped_at khi đã xử lý xong việc nhận trước tín hiệu dừng.
// Quá hạn thì thoát lỗi; firmware phải gửi lại mẫu còn thiếu ACK khi backend trở lại.
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    clearInterval(healthTimer);
    clearInterval(expiryTimer);
    client.stopIntake();
    const deadline = setTimeout(() => {
      console.error('[SHUTDOWN] Quá hạn drain');
      process.exit(1);
    }, config.ingestion.shutdownMs);
    try {
      await client.drain();
      while (healthBusy || expiryBusy) await new Promise((resolve) => setTimeout(resolve, 20));
      await recordConsumerHealth(config.mqtt.clientId, false);
      await recordServiceStop(currentRunId);
      await client.endAsync(false);
      await closePool();
      clearTimeout(deadline);
      console.log('[SHUTDOWN] Hoàn tất', JSON.stringify(getStats()));
      process.exit(0);
    } catch (error) {
      console.error('[SHUTDOWN]', error.message);
      process.exit(1);
    }
  });
