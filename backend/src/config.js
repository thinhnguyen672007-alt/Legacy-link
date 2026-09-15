// config.js
// Nhiem vu: nap file .env, kiem tra cac bien moi truong bat buoc, va export
// mot object `config` duy nhat cho toan bo backend dung chung.

// Nap .env TRUOC khi doc process.env.
// Phai nam trong file nay (khong phai index.js) vi ESM thuc thi moi lenh
// import TRUOC khi chay code trong file goi no.
try {
  process.loadEnvFile();
} catch {
  // Khong co .env thi bo qua, dung bien moi truong da set san.
}

const REQUIRED = ['MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD', 'MQTT_QOS'];

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[CONFIG] Thieu bien moi truong bat buoc: ${key}`);
    process.exit(1);
  }
}

// QoS chi nhan 0, 1, 2. Sai thi dung ngay, khong am tham doan mot gia tri khac.
const qos = Number.parseInt(process.env.MQTT_QOS, 10);

if (![0, 1, 2].includes(qos)) {
  console.error(
    `[CONFIG] MQTT_QOS khong hop le: "${process.env.MQTT_QOS}" (chi nhan 0, 1, 2)`,
  );
  process.exit(1);
}

// Moi tien trinh mot clientId rieng: them PID de hai instance khong gianh nhau
// tren broker. Xem .env.example de biet danh doi khi dung clean: false.
const clientIdBase = process.env.MQTT_CLIENT_ID ?? 'legacy-link-backend';

export const config = Object.freeze({
  mqtt: {
    url: process.env.MQTT_URL,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `${clientIdBase}-${process.pid}`,
    qos,
  },
  topics: {
    telemetry: 'legacy-link/devices/+/telemetry',
    status: 'legacy-link/devices/+/status',
    alarm: 'legacy-link/devices/+/alarm',
  },
});
