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

// Bang tra: phan cuoi cua topic -> ham xu ly tuong ung.
//
// Dat o pham vi module vi no khong doi giua cac message. Khai bao trong ham
// nghia la tao lai object nay moi lan co message.
const KIND_TO_HANDLER = {
  telemetry: 'onTelemetry',
  status: 'onStatus',
  alarm: 'onAlarm',
};

export function startMqttClient({ onTelemetry, onStatus, onAlarm }) {
  const handlers = { onTelemetry, onStatus, onAlarm };

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
    const topics = [config.topics.telemetry, config.topics.status, config.topics.alarm];

    client.subscribe(topics, { qos: config.mqtt.qos }, (err, granted) => {
      if (err) {
        console.error('[MQTT] Subscribe that bai:', err.message);
        return;
      }
      console.log('[MQTT] Da subscribe:', granted.map((g) => g.topic).join(', '));
    });
  });

  client.on('message', (topic, rawPayload, packet) => {
    // Topic dang: legacy-link/devices/{deviceId}/{kind}
    // -> part 0: 'legacy-link', 1: 'devices', 2: deviceId, 3: kind
    const parts = topic.split('/');
    const deviceId = parts[2];
    const kind = parts[3];

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

    const handlerName = KIND_TO_HANDLER[kind];
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
    //
    // Cach viet `Promise.resolve().then(...)` de bat ca hai loai loi:
    //   - ham nem loi dong bo (throw truoc khi tra ve Promise)
    //   - Promise bi tu choi sau do
    Promise.resolve()
      .then(() => handler(deviceId, payload, packet))
      .catch((err) => {
        console.error(`[MQTT] Handler "${kind}" loi:`, err.message);
      });
  });

  client.on('reconnect', () => console.log('[MQTT] Dang thu ket noi lai...'));
  client.on('offline', () => console.warn('[MQTT] Mat ket noi toi broker'));
  client.on('close', () => console.warn('[MQTT] Ket noi da dong'));
  client.on('error', (err) => console.error('[MQTT] Loi:', err.message));

  return client;
}
