// config.js
// Nhiem vu: nap file .env, kiem tra cac bien moi truong bat buoc, va export
// mot object `config` duy nhat cho toan bo backend dung chung.

// Nap .env TRUOC khi doc process.env.
// Phai nam trong file nay (khong phai index.js) vi ESM thuc thi moi lenh
// import TRUOC khi chay code trong file goi no.
import { readFileSync } from 'node:fs';

try {
  process.loadEnvFile();
} catch {
  // Khong co .env thi bo qua, dung bien moi truong da set san.
}

const REQUIRED = ['MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD', 'MQTT_QOS', 'DATABASE_URL'];

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[CONFIG] Thieu bien moi truong bat buoc: ${key}`);
    process.exit(1);
  }
}

// QoS chi nhan 0, 1, 2. Sai thi dung ngay, khong am tham doan mot gia tri khac.
const mqttUrl = new URL(process.env.MQTT_URL);
if (mqttUrl.username || mqttUrl.password) throw new Error('Đặt credential trong MQTT_USERNAME/PASSWORD, không đặt trong URL');
if (!['mqtt:', 'mqtts:'].includes(mqttUrl.protocol)) throw new Error('MQTT_URL phải dùng mqtt hoặc mqtts');
if (!/^[012]$/.test(process.env.MQTT_QOS)) throw new Error('MQTT_QOS chỉ nhận 0, 1, 2');
if (process.env.NODE_ENV === 'production' && mqttUrl.protocol !== 'mqtts:' && process.env.MQTT_ALLOW_PLAINTEXT !== 'true') throw new Error('Production yêu cầu mqtts; chỉ opt-in MQTT_ALLOW_PLAINTEXT cho mạng riêng đã kiểm soát');
const qos = Number(process.env.MQTT_QOS);

if (![0, 1, 2].includes(qos)) {
  console.error(
    `[CONFIG] MQTT_QOS khong hop le: "${process.env.MQTT_QOS}" (chi nhan 0, 1, 2)`,
  );
  process.exit(1);
}

// Giữ nguyên ID của consumer khi khởi động lại để broker nhận ra phiên cũ.
// Hai consumer chạy đồng thời cần ID khác nhau; kết nối chỉ gửi dùng hậu tố riêng.
function positiveInteger(name, fallback, maximum) {
  const raw = process.env[name] ?? String(fallback);
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > maximum) throw new Error(`${name} không hợp lệ`);
  return Number(raw);
}
const clientIdBase = process.env.MQTT_CLIENT_ID ?? 'legacy-link-backend';

export const config = Object.freeze({
  mqtt: {
    url: process.env.MQTT_URL,
    tls: process.env.MQTT_TLS_CA_FILE ? { ca: readFileSync(process.env.MQTT_TLS_CA_FILE), rejectUnauthorized: true } : {},
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: clientIdBase,
    qos,
  },

  // Topic de SUBSCRIBE — dung wildcard `+`, vi ta khong biet truoc co bao nhieu
  // thiet bi va chung ten gi.
  topics: {
    telemetry: 'legacy-link/devices/+/telemetry',
    status: 'legacy-link/devices/+/status',
    alarm: 'legacy-link/devices/+/alarm',
    configAck: 'legacy-link/gateways/+/config/ack',
    diagnostics: 'legacy-link/devices/+/diagnostics',
  },

  ingestion: {
    concurrency: positiveInteger('INGESTION_CONCURRENCY', 4, 32),
    capacity: positiveInteger('INGESTION_CAPACITY', 256, 10000),
    maxBytes: positiveInteger('MQTT_MAX_PAYLOAD_BYTES', 16384, 1048576),
    shutdownMs: positiveInteger('SHUTDOWN_TIMEOUT_MS', 15000, 120000),
  },
  database: {
    url: process.env.DATABASE_URL,
  },
});

// Topic de PUBLISH — KHONG dung wildcard, ma dung tu id cu the.
//
// VI SAO KHAC NHAU:
//   Subscribe: "cho toi nghe moi thiet bi"  -> wildcard
//   Publish:   "gui cho DUNG thiet bi nay"  -> phai co id that
//
// Wildcard `+` chi co nghia khi dang ky nghe. Publish len mot topic chua dau `+`
// la gui vao mot dia chi khong ai dang ky — broker nhan, roi khong chuyen cho ai.

export function gatewayConfigTopic(gatewayId) {
  return `legacy-link/gateways/${gatewayId}/config`;
}

export function deviceConfigTopic(deviceId) {
  return `legacy-link/devices/${deviceId}/config`;
}
