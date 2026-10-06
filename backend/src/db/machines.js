// db/machines.js
// Nhiem vu: DOC thong tin thiet bi de tra cho API cua frontend.
//
// Khac voi cac file khac trong thu muc db/ — chung GHI du lieu vao database,
// con file nay CHI DOC.
//
// Doc va ghi tach rieng vi hai viec co yeu cau khac nhau:
//   - Ghi: phai dung transaction, phai chong trung lap, phai xu ly loi.
//   - Doc: chi can cau query dung va nhanh. Khong co gi de hong.

import { pool } from './pool.js';

// Danh sach may kem trang thai hien tai.
//
// LEFT JOIN chu khong INNER JOIN. Ly do: mot thiet bi vua duoc them vao bang
// device nhung CHUA bao gio gui du lieu nao thi chua co dong trong machine_state.
//
//   INNER JOIN  -> no bien mat khoi danh sach   (sai — may van ton tai!)
//   LEFT JOIN   -> no van hien, online = false  (dung)
export async function listMachines() {
  const result = await pool.query(`
    SELECT
      d.device_id,
      d.name,
      d.machine_type,
      COALESCE(s.online, false) AS online,
      s.last_seen_at,
      s.last_metrics
    FROM device d
    LEFT JOIN machine_state s ON s.device_id = d.device_id
    ORDER BY d.device_id
  `);

  return result.rows.map(toMachine);
}

// Chuyen mot dong database thanh hinh dang ma frontend se dung.
//
// Database dung snake_case (device_id, last_seen_at), frontend dung camelCase.
// Viec chuyen doi dien ra o day — ranh gioi giua hai he thong. Giong het cach
// toFirmwareRegister lam voi ESP32, chi khac la doi tuong ben kia.
function toMachine(row) {
  return {
    deviceId: row.device_id,
    name: row.name,
    machineType: row.machine_type,
    online: row.online,
    lastSeenAt: row.last_seen_at,
    metrics: row.last_metrics,
  };
}
