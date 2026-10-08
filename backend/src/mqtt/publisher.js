// mqtt/publisher.js
// Nhiem vu: mot ket noi MQTT TOI THIEU — chi de GUI, khong subscribe gi.
//
// VI SAO CAN RIENG, khong dung lai startMqttClient:
//
// Tien trinh HTTP (src/http/server.js) khong co ket noi MQTT nao. No can GUI
// config xuong thiet bi, nhung KHONG can nghe gi ca — viec nghe la cua tien
// trinh MQTT (src/index.js).
//
// Neu dung lai startMqttClient thi tien trinh HTTP se subscribe ca bon topic
// nua, va ta co hai tien trinh cung nhan message — roi ca hai cung ghi vao
// database. Khong sai ve du lieu (da co chong trung), nhung thua va kho hieu.

import mqtt from 'mqtt';
import { config } from '../config.js';

export function startPublisher() {
  const client = mqtt.connect(config.mqtt.url, {
    // Them hau to '-pub' de khong trung clientId voi tien trinh MQTT chinh.
    clientId: `${config.mqtt.clientId}-pub`,
    username: config.mqtt.username,
    password: config.mqtt.password,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });

  client.on('connect', () => console.log('[MQTT-PUB] Da ket noi (chi de gui)'));
  client.on('reconnect', () => console.log('[MQTT-PUB] Dang thu ket noi lai...'));
  client.on('error', (err) => console.error('[MQTT-PUB] Loi:', err.message));

  return client;
}

// Gui mot message dang JSON va doi broker xac nhan o TANG MQTT.
//
// QoS 1 chu khong 0: config la menh lenh, khong duoc phep mat. QoS 1 nghia la
// broker phai tra PUBACK; khong nhan duoc thi ben gui gui lai.
//
// HAM NAY TRA VE KHI BROKER DA NHAN — KHONG PHAI KHI ESP32 DA AP DUNG.
// Do la hai chuyen hoan toan khac nhau. Muon biet ESP32 da ap dung chua thi
// phai cho ACK tren topic config/ack. Xem src/db/config-request.js.
export function publishJson(client, topic, payload) {
  return new Promise((resolve, reject) => {
    client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
