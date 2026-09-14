// mqtt/client.js
// Nhiem vu: tao ket noi MQTT toi broker, subscribe cac topic can thiet, va
// dinh tuyen message nhan duoc cho dung handler.

import mqtt from 'mqtt';
import { config } from '../config.js';

export function startMqttClient({ onTelemetry, onStatus }) {
  // mqtt.connect(url, options): tham so thu nhat la URL broker,
  // tham so thu hai la tuy chon. Khong gop URL vao trong options.
  const client = mqtt.connect(config.mqtt.url, {
    clientId: config.mqtt.clientId,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clean: true,
    reconnectPeriod: 5000,
    connectTimeout: 10000,
    keepalive: 30,
  });

  client.on('connect', () => {
    console.log(`[MQTT] Da ket noi: ${config.mqtt.url}`);

    // Subscribe TRONG su kien 'connect': luc nay ket noi moi that su san sang.
    const topics = [config.topics.telemetry, config.topics.status];

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
      return;
    }

    console.log(
      `[MQTT] Nhan topic=${topic} qos=${packet.qos} retain=${packet.retain}`,
    );

    if (kind === 'telemetry') {
      onTelemetry(deviceId, payload);
    } else if (kind === 'status') {
      onStatus(deviceId, payload);
    } else {
      console.warn(`[MQTT] Bo qua topic khong xu ly: ${topic}`);
    }
  });

  client.on('reconnect', () => console.log('[MQTT] Dang thu ket noi lai...'));
  client.on('offline', () => console.warn('[MQTT] Mat ket noi toi broker'));
  client.on('close', () => console.warn('[MQTT] Ket noi da dong'));
  client.on('error', (err) => console.error('[MQTT] Loi:', err.message));

  return client;
}
