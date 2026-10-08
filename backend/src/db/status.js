import { requireDevice } from './ingestion.js';
// db/status.js
// Nhiem vu: cap nhat trang thai song/chet cua thiet bi.
//
// DIEM QUAN TRONG NHAT: phan biet message SONG voi message RETAINED.
//
//   Message SONG      = co ai do VUA gui no. No chung minh thiet bi dang hoat dong.
//
//   Message RETAINED  = broker phat lai message da giu tu truoc, luc ta moi
//                       subscribe. No chi cho biet TRANG THAI CU, khong chung
//                       minh thiet bi con song.
//
// Neu coi retained la su kien song, backend se danh dau mot thiet bi da chet tu
// nhieu ngay la "dang online" — va no lam vay MOI LAN backend khoi dong lai.
//
// Da tai hien thuc te: ban retained status voi timestamp cu hon HAI TUAN,
// backend van dat online = true va last_seen_at = now().
//
// Cach phan biet: truong `retain` trong goi tin MQTT. Broker dat no thanh true
// khi giao mot message DA GIU LAI, va false khi giao message vua duoc publish.
//
// Chi MOT cau lenh moi nhanh, nen KHONG can transaction. Transaction chi can khi
// co tu hai lenh tro len phai cung thanh cong hoac cung that bai.

import { pool } from './pool.js';

export async function saveStatus({ deviceId, status, retained }) {
  await requireDevice(pool, deviceId);
  if (retained) {
    // Message retained: chi cap nhat GIA TRI.
    // Khong dung toi last_seen_at — vi "vua nghe duoc" la chuyen cua su kien song.
    await pool.query(
      `INSERT INTO machine_state (device_id, online)
       VALUES ($1, $2)
       ON CONFLICT (device_id) DO UPDATE
         SET online = EXCLUDED.online`,
      [deviceId, status],
    );
    return;
  }

  // Message song: cap nhat ca gia tri lan moc "vua nghe duoc".
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
