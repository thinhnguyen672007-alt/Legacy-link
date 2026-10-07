// db/pool.js
// Nhiem vu: tao connection pool toi PostgreSQL.
//
// Dung Pool chu khong dung Client don le. Pool giu san mot nhom ket noi va tai
// su dung chung: khong phai bat tay TCP roi xac thuc lai cho tung truy van, va
// chiu duoc nhieu truy van dong thoi.
//
// PostgreSQL co gioi han so ket noi (mac dinh 100). Backend khong nen mo qua
// nhieu; 10 la du cho quy mo nay. Neu mo qua, PostgreSQL se tu choi ket noi moi
// va ca he thong dung.

import pg from 'pg';
import { config } from '../config.js';

export const pool = new pg.Pool({
  connectionString: config.database.url,
  max: 10,

  // Neu khong ket noi duoc trong 5 giay thi bao loi luon, khong doi mai.
  // Thieu no, mot truy van co the treo vo han khi PostgreSQL khong tra loi.
  connectionTimeoutMillis: 5000,

  // Mot cau truy van chay qua 10 giay thi bi huy. Bao ve backend khoi mot
  // truy van bi ket (vi du: bang qua lon, thieu index).
  query_timeout: 10000,

  // Dong bot ket noi nhan roi sau 30 giay, giu so ket noi mo thap hon.
  idleTimeoutMillis: 30000,
});

// BAT BUOC phai co doan nay.
//
// Khi mot ket noi dang NGAN ROI (khong dung) bi dut — mat mang, container bi
// kill, PostgreSQL bi tat dot ngot — thu vien pg phat su kien 'error' TREN POOL.
//
// Su kien nay KHONG di qua catch cua bat ky truy van nao. No la su kien cua
// EventEmitter. Neu khong co ai nghe, Node nem loi ra ngoai va TIEN TRINH THOAT.
//
// Da tai hien thuc te: dung `docker kill` PostgreSQL (tat dot ngot, khac voi
// `docker stop` tat tu ton) thi backend exit 1 voi:
//
//   Unhandled 'error' event
//   Error: Connection terminated unexpectedly
//   Emitted 'error' event on BoundPool instance
//
// `docker stop` khong gay loi nay vi no dong ket noi sach se. Chi khi ket noi
// bi cat giua chung moi lo ra — dung tinh huong mat dien, rut mang trong nha may.
pool.on('error', (err) => {
  // Chi log err.message, KHONG log ca doi tuong err.
  //
  // Object loi cua pg chua ca Client, Socket va ConnectionParameters — do ra
  // hang tram dong, kem user/host/port. Log gon thi doc duoc, log het thi khong.
  console.error('[DB] Loi ket noi nhan roi:', err.message);
});

// Goi luc tat tien trinh. Neu khong dong, tien trinh se khong thoat han.
export async function closePool() {
  await pool.end();
}
