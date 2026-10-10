// Tạo kết nối MQTT cho luồng cấu hình ESP32 từ frontend. Đây là kết nối riêng với consumer nhận số đo.
import mqtt from 'mqtt';
import { config } from '../config.js';
import { saveAppliedConfig } from '../db/provisioning.js';
import { operationStore } from '../db/operations.js';
import { ControlService } from './service.js';

export function startControlService() {
  const client = mqtt.connect(config.mqtt.url, {
    ...config.mqtt.tls,
    resubscribe: false, // Chính ứng dụng subscribe lại mỗi connect; tránh callback rỗng từ cache thư viện.
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: `${config.mqtt.clientId}-control-${process.pid}`,
    reconnectPeriod: 3000,
    connectTimeout: 5000,
    queueQoSZero: false,
  });
  client.on('error', (err) => console.error('[CONTROL] MQTT:', err.message));
  return new ControlService(client, { saveConfig: saveAppliedConfig, store: operationStore });
}
