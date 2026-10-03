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
});

// Goi luc tat tien trinh. Neu khong dong, tien trinh se khong thoat han.
export async function closePool() {
  await pool.end();
}
