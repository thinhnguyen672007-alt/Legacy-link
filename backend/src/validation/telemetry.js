// validation/telemetry.js
// Nhiem vu: kiem tra mot payload telemetry co hop le khong.
//
// Day la ham THUAN (pure function): khong log, khong goi database, khong biet
// gi ve MQTT. Vao: du lieu. Ra: phan quyet. Nho vay co the test rieng ma
// khong can broker, khong can mang, khong can Docker.
//
// Ly do ton tai: thiet bi la mot ranh gioi KHONG TIN CAY. Firmware co the loi,
// cam bien co the hong, nguoi khac co the publish sai. Du lieu ban phai chet
// o day, khong duoc di tiep vao database.

// Ngưỡng hợp lý. Dat thanh hang so co ten de doc hieu y nghia, thay vi
// rai so 1577836800000 khap noi.

import { isPlainObject, checkDeviceId, checkTimestamp, checkSchemaVersion, MIN_VALID_TIMESTAMP_MS, MAX_FUTURE_SKEW_MS } from "./shared.js"

const MAX_METRIC_COUNT = 32

// Danh sach chi so duoc phep cho may cua nhom.
// Whitelist cung: an toan, nhung them cam bien moi thi phai sua code va deploy lai.
// Dung Set thay vi Array: tra cuu O(1) thay vi O(n). Voi 3 phan tu thi khong
// khac biet, nhung chon dung cau truc la thoi quen dang luyen.
const ALLOWED_METRICS = new Set(['temperature', 'current', 'rpm']);

export function validateTelemetry(topicDeviceId, payload) {
  const errors = []; // khai báo biến errors để hứng tất cả các lỗi thay vì throw 1 lỗi và phải sửa đi sửa lại nhiều lần 

  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['payload phai la mot object'] };
  }

  // 1. deviceId: chuoi khong rong, va phai KHOP voi deviceId tren topic.
  //    Lech nhau nghia la firmware gui sai hoac co nguoi gia mao.
  checkDeviceId(topicDeviceId, payload.deviceId, errors);

  // 2. timestamp: so nguyen, epoch milliseconds, nam trong khoang hop ly.
  //    Day chinh la "dong ho thiet bi" — ta khong the xac minh tuyet doi,
  //    nhung phat hien duoc cai bat kha thi (qua cu / o tuong lai).
  checkTimestamp(payload.timestamp, errors);

  // 3. schemaVersion: là số nguyên và phải là bằng 1 
  checkSchemaVersion(payload.schemaVersion, errors);

  // 4. metrics: object khong rong, moi gia tri phai la so huu han.

  if (!isPlainObject(payload.metrics)) {
    errors.push('metrics must be a object')
  } else {
    const metricNames = Object.keys(payload.metrics);

    if (metricNames.length === 0) {
      errors.push('metrics must have at least one metric')
    } else if (metricNames.length > MAX_METRIC_COUNT) {
      errors.push(`metrics must not exceed ${MAX_METRIC_COUNT}`);
    }

    for (const name of metricNames) {
      if (!ALLOWED_METRICS.has(name)) {
        errors.push(`metrics.${name} is not in the allowed metric list`);
        continue;
      }

      if (!Number.isFinite(payload.metrics[name])) {
        errors.push(`metrics.${name} must be a finite number, received: ${payload.metrics[name]}`);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Tra ve BAN DA CHUAN HOA, khong tra ve payload goc.
  // Nho vay ben nhan biet chinh xac minh se duoc nhan nhung truong nao,
  // va khong the vo tinh dung toi nhung truong la khac trong payload.
  return {
    ok: true,
    value: {
      deviceId: payload.deviceId,
      timestamp: payload.timestamp,
      metrics: { ...payload.metrics },
      schemaVersion: payload.schemaVersion,
    },
  };
}
