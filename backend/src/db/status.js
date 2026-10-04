// db/status.js
// Nhiem vu: cap nhat trang thai song/chet cua thiet bi.
//
// Chi MOT cau lenh, va do la co y. Status khong phai su kien can luu lich su —
// no chi la trang thai HIEN TAI. Moi message status deu de len gia tri cu.
//
// Vi chi co mot cau lenh, KHONG can transaction. Transaction chi can khi co tu
// hai lenh tro len phai cung thanh cong hoac cung that bai.
//
// Luu y ve chu ky: "status" o day la mot BOOLEAN (true/false), khong phai mot
// object. Ten truong trong payload trung voi ten bien, nhung kieu thi khac.

import { pool } from './pool.js';

export async function saveStatus({ deviceId, status }) {
  await pool.query(
    `INSERT INTO machine_state (device_id, online, last_seen_at, updated_at)
     VALUES ($1, $2, now(), now())
     ON CONFLICT (device_id) DO UPDATE
       SET online       = EXCLUDED.online,
           last_seen_at = EXCLUDED.last_seen_at,
           updated_at   = EXCLUDED.updated_at`,
    [deviceId, status],
  );
}
