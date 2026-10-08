import { checkIdentity } from '../ingestion/identity.js';
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

import { isPlainObject, checkDeviceId, checkTimestamp, checkSchemaVersion } from "./shared.js"

const MAX_METRIC_COUNT = 32

// Danh sach chi so duoc phep.
//
// QUY TAC BAT BUOC: danh sach nay phai la SUPERSET cua moi gia tri metric_key
// trong bang register_map. Nghia la moi chi so xuat hien trong catalog deu phai
// co mat o day.
//
// Neu mot chi so co trong catalog ma thieu o day, ESP32 se doc duoc thanh ghi,
// gui du lieu len, va bi backend chan. Nhung firmware KHONG he biet — no chi
// thay minh gui thanh cong. Chi nguoi doc log backend moi thay loi.
//
// Day la lan thu hai chuyen nay xay ra (lan dau la "speed", lan nay la "torque").
// Ve lau dai nen doc danh sach nay tu database luc khoi dong thay vi viet cung.
// Tam thoi, src/validation/catalog-check.js se canh bao luc khoi dong neu
// danh sach nay lech voi bang register_map.
export const ALLOWED_METRICS = new Set(['temperature', 'current', 'rpm', 'speed', 'pressure', 'torque']);

export function validateTelemetry(topicDeviceId, payload) {
  const errors = [];

  if (!isPlainObject(payload)) {
    return { ok: false, errors: ['payload must be an object'] };
  }

  const identity = checkIdentity(payload, errors, 'telemetry');

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
    errors.push('metrics must be an object')
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
        // KHONG noi suy GIA TRI vao thong bao loi.
        //
        // O day ta da biet gia tri KHONG phai so huu han. No co the la object,
        // chuoi, null, hay mang. Chen mot object vao template string se goi
        // ham toString() cua no — va mot object duoc che tao nhu
        //   { "toString": 0, "valueOf": 0 }
        // se lam JavaScript nem TypeError: Cannot convert object to primitive value.
        //
        // Loi do nem ra TU TRONG validator, khong biet try/catch nao bat, va lam
        // tien trinh thoat. Da tai hien thuc te.
        //
        // Thay vao do chi noi KIEU du lieu. `typeof` luon tra ve mot chuoi, nen
        // khong bao gio nem loi. Va no van du thong tin de debug: biet duoc
        // thiet bi gui object thay vi so la du.
        errors.push(
          `metrics.${name} must be a finite number, received type: ${typeof payload.metrics[name]}`,
        );
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
      ...identity,
      deviceId: payload.deviceId,
      timestamp: payload.timestamp,
      metrics: { ...payload.metrics },
      schemaVersion: payload.schemaVersion,
    },
  };
}
