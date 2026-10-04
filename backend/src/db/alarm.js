// db/alarm.js
// Nhiem vu: ghi mot su kien alarm DA QUA VALIDATION vao bang alarms.
//
// Chi MOT cau lenh. Khong dung toi bang machine_state, vi bang do khong co cot
// nao danh cho alarm.
//
// Chong trung lap bang khoa BA thanh phan (device_id, ts, code): mot may co the
// phat hai alarm khac loai o cung mot thoi diem, va ca hai deu la su kien that.

import { pool } from './pool.js';

export async function saveAlarm({ deviceId, timestamp, code, severity, value }) {
  const result = await pool.query(
    `INSERT INTO alarms (device_id, ts, code, severity, value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (device_id, ts, code) DO NOTHING
     RETURNING id`,
    // value la truong tuy chon. Viet ro "?? null" de nguoi doc biet day la
    // chu y, khong phai vo tinh.
    [deviceId, timestamp, code, severity, value ?? null],
  );

  return { inserted: result.rowCount > 0 };
}
