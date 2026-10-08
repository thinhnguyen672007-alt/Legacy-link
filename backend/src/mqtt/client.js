// mqtt/client.js
// Nhiem vu: tao ket noi MQTT toi broker, subscribe cac topic can thiet, va
// dinh tuyen message nhan duoc cho dung handler.
//
// File nay la TANG VAN CHUYEN. No khong biet gi ve nghiep vu: khong validate,
// khong goi database. No chi lam hai viec — tach topic de biet ai gui va gui
// loai gi, roi chuyen cho dung handler.

import mqtt from 'mqtt';
import { config } from '../config.js';

// Dem so lan parse JSON that bai, de in ra luc tat.
let errorsCount = 0;

export function getStats() {
  return { errorsCount };
}

// Bang dinh tuyen: "<ho topic>/<loai message>" -> ten handler.
//
// CO HAI HO TOPIC, khac nhau o tu thu hai:
//
//   legacy-link/devices/{deviceId}/{kind}       <- firmware bao cao ve MAY
//   legacy-link/gateways/{gatewayId}/config/ack <- firmware bao cao ve CHINH NO
//
// Nen khong the chi lay parts[3] lam kind nhu truoc. Phai lay CA ho lan loai.
//
// Vi du:
//   legacy-link/devices/esp32-01/telemetry        -> ho "devices",  loai "telemetry"
//   legacy-link/gateways/ABC123/config/ack        -> ho "gateways", loai "config/ack"
const ROUTES = {
  'devices/telemetry': 'onTelemetry',
  'devices/status': 'onStatus',
  'devices/alarm': 'onAlarm',
  'gateways/config/ack': 'onConfigAck',
};

// Tach topic thanh ba phan.
//
// Tra ve null neu topic khong du 3 tang — vi du "legacy-link/abc" — de ben goi
// bo qua thay vi doc parts[3] cua mot mang ngan (se ra undefined roi di tiep
// trong im lang).
function parseTopic(topic) {
  const parts = topic.split('/');

  if (parts.length < 4) {
    return null;
  }

  return {
    family: parts[1], // 'devices' hoac 'gateways'
    id: parts[2], // deviceId hoac gatewayId
    kind: parts.slice(3).join('/'), // 'telemetry' | 'config/ack' | ...
  };
}

export function startMqttClient({ onTelemetry, onStatus, onAlarm, onConfigAck }) {
  const handlers = { onTelemetry, onStatus, onAlarm, onConfigAck };

  // mqtt.connect(url, options): tham so thu nhat la URL broker,
  // tham so thu hai la tuy chon. Khong gop URL vao trong options.
  const client = mqtt.connect(config.mqtt.url, {
    clientId: config.mqtt.clientId,
    username: config.mqtt.username,
    password: config.mqtt.password,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 30,
  });

  client.on('connect', () => {
    console.log(`[MQTT] Da ket noi: ${config.mqtt.url}`);

    // Subscribe TRONG su kien 'connect': luc nay ket noi moi that su san sang.
    const topics = Object.values(config.topics);

    client.subscribe(topics, { qos: config.mqtt.qos }, (err, granted) => {
      if (err) {
        console.error('[MQTT] Subscribe that bai:', err.message);
        return;
      }
      console.log('[MQTT] Da subscribe:', granted.map((g) => g.topic).join(', '));
    });
  });

  client.on('message', (topic, rawPayload, packet) => {
    const parsed = parseTopic(topic);

    if (parsed === null) {
      console.warn(`[MQTT] Topic khong dung dinh dang, bo qua: ${topic}`);
      return;
    }

    let payload;
    try {
      payload = JSON.parse(rawPayload.toString());
    } catch {
      console.error(`[MQTT] Payload khong phai JSON hop le, topic=${topic}`);
      errorsCount++;
      return;
    }

    console.log(
      `[MQTT] Nhan topic=${topic} qos=${packet.qos} retain=${packet.retain} byte=${rawPayload.length}`,
    );

    const handlerName = ROUTES[`${parsed.family}/${parsed.kind}`];
    const handler = handlerName ? handlers[handlerName] : undefined;

    if (!handler) {
      console.warn(`[MQTT] Bo qua topic khong xu ly: ${topic}`);
      return;
    }

    // LUOI AN TOAN — doan quan trong nhat cua file nay.
    //
    // Cac handler la ham async, nen chung tra ve mot Promise. Neu ben trong
    // co loi khong duoc bat, Promise do bi TU CHOI. Va Node mac dinh coi mot
    // Promise bi tu choi ma khong ai bat la loi nghiem trong -> THOAT tien trinh.
    //
    // Da tai hien thuc te: ban mot payload co `metrics.temperature` la object
    // dac biet lam validator nem TypeError -> backend exit 1. Chi MOT message
    // cua MOT thiet bi lam dung ca he thong.
    //
    // Luoi nay KHONG thay the viec sua loi goc trong validator. No chi dam bao:
    // du mot handler co loi, cac thiet bi khac van duoc phuc vu binh thuong.
    // Tham so thu nhat la deviceId (ho devices) hoac gatewayId (ho gateways).
    Promise.resolve()
      .then(() => handler(parsed.id, payload, packet))
      .catch((err) => {
        console.error(`[MQTT] Handler "${handlerName}" loi:`, err.message);
      });
  });

  client.on('reconnect', () => console.log('[MQTT] Dang thu ket noi lai...'));
  client.on('offline', () => console.warn('[MQTT] Mat ket noi toi broker'));
  client.on('close', () => console.log('[MQTT] Ket noi da dong'));
  client.on('error', (err) => console.error('[MQTT] Loi:', err.message));

  return client;
}
