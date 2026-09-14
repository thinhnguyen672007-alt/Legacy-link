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

const REQUIRED = ['MQTT_URL', 'MQTT_USERNAME', 'MQTT_PASSWORD'];

for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[CONFIG] Thieu bien moi truong bat buoc: ${key}`);
    process.exit(1);
  }
}

export const config = Object.freeze({
  mqtt: {
    url: process.env.MQTT_URL,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: process.env.MQTT_CLIENT_ID ?? 'legacy-link-backend',
    qos: parseInt(process.env.MQTT_QOS) || 1,
  },
  topics: {
    telemetry: 'legacy-link/devices/+/telemetry',
    status: 'legacy-link/devices/+/status',
    alarm: `legacy-link/device/+/alarm`,
  },
});
