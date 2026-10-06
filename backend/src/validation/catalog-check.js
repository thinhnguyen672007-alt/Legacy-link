// validation/catalog-check.js
// Kiem tra luc khoi dong: moi chi so co trong catalog (bang register_map) deu
// phai co trong ALLOWED_METRICS.
//
// Hai danh sach nay phai khop nhau, nhung nam o hai noi khac nhau — mot ben la
// hang so trong code, mot ben la du lieu trong database. Khong co gi bat chung
// khop. Chung chi khop vi nguoi ta nho cap nhat ca hai. Va nguoi ta se quen.
//
// Khi lech, hau qua dien ra nhu sau:
//   1. ESP32 hoi catalog   -> nhan duoc chi so do  (vi no co trong register_map)
//   2. ESP32 doc thanh ghi -> doc duoc so
//   3. ESP32 gui len MQTT  -> gui thanh cong, broker xac nhan
//   4. Backend kiem tra    -> AM THAM CHAN
//
// ESP32 khong he biet buoc 4 that bai. No gui xong, nhan xac nhan, va tin la
// da xong. Chi nguoi doc log backend moi thay loi.
//
// Lan thu nhat la "speed", lan thu hai la "torque". Kiem tra nay bien loi im
// lang do thanh mot canh bao nhin thay duoc, ngay luc khoi dong.

import { pool } from '../db/pool.js';
import { ALLOWED_METRICS } from './telemetry.js';

export async function checkCatalogMetrics() {
  const result = await pool.query(
    'SELECT DISTINCT metric_key FROM register_map ORDER BY metric_key',
  );

  const inCatalog = result.rows.map((row) => row.metric_key);
  const missing = inCatalog.filter((key) => !ALLOWED_METRICS.has(key));

  if (missing.length === 0) {
    console.log(
      `[CATALOG] Kiem tra OK: ${inCatalog.length} chi so trong catalog deu duoc phep.`,
    );
    return { ok: true, missing };
  }

  console.warn(
    `[CATALOG] CANH BAO: ${missing.length} chi so co trong catalog nhung THIEU trong ALLOWED_METRICS:`,
  );
  console.warn(`[CATALOG]   ${missing.join(', ')}`);
  console.warn(
    '[CATALOG] Du lieu cua cac chi so nay se bi backend chan. Sua ALLOWED_METRICS trong src/validation/telemetry.js.',
  );

  return { ok: false, missing };
}
