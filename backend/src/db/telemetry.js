// db/telemetry.js
// Nhiem vu: ghi mot ban ghi telemetry DA QUA VALIDATION vao database.
//
// Diem quan trong nhat: ham nay IDEMPOTENT. Goi hai lan voi cung du lieu thi ket
// qua giong het goi mot lan. Nho vay khi QoS 1 gui lai cung mot message, ta
// khong sinh ra dong trung lap.
//
// Cach lam: de DATABASE tu chan bang rang buoc UNIQUE (device_id, ts), chu
// khong kiem tra trong code. Kiem tra trong code se sai khi co hai tien trinh
// cung ghi, hoac khi co race condition.

import { pool } from './pool.js';

export async function saveTelemetry({ deviceId, timestamp, metrics }) {
  const client = await pool.connect();

  try {
    // Hai lenh phai cung thanh cong hoac cung that bai. Neu ghi duoc lich su
    // ma khong cap nhat duoc trang thai thi dashboard se hien so cu.
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO telemetry (device_id, ts, metrics)
       VALUES ($1, $2, $3)
       ON CONFLICT (device_id, ts) DO NOTHING
       RETURNING id`,
      [deviceId, timestamp, JSON.stringify(metrics)],
    );

    // Trang thai hien tai CHI cap nhat khi du lieu MOI HON du lieu dang luu.
    //
    // `WHERE` o cuoi cau `DO UPDATE` bien no thanh cap nhat CO DIEU KIEN.
    // Neu dieu kien sai, PostgreSQL khong cap nhat gi ca — dong cu giu nguyen.
    //
    // VI SAO CAN:
    // Mot message cu tori muon — do mang tre, hoac thiet bi replay du lieu da
    // luu trong bo dem — se ghi de so do MOI bang so do CU. Dashboard hien
    // 20°C trong khi may dang 80°C. Thong tin sai, te hon la khong co thong tin.
    //
    // Da tai hien: gui ts=...300000 nhiet do 80, roi gui ts=...200000 nhiet do
    // 20 -> machine_state thanh 20.
    //
    // Cach doc `WHERE` trong `DO UPDATE`:
    //   machine_state  = dong DANG CO trong bang
    //   EXCLUDED       = dong MOI dinh ghi vao
    //
    // LUU Y RAT QUAN TRONG: quy tac nay CHI ap cho telemetry, KHONG ap cho
    // status. Timestamp cua LWT (Last Will) la luc KET NOI — co the cu hon lan
    // heartbeat cuoi. Ap quy tac "cu thi bo" cho status se chan mat tin hieu
    // offline, va may da chet van hien dang chay tren dashboard.
    //
    // BAY NULL — cho nay rat de sai:
    //
    //   NULL trong SQL khong phai "rong", ma la "KHONG BIET".
    //   Moi phep so sanh voi NULL deu cho ra NULL — khong phai true, khong phai
    //   false. Va WHERE coi NULL nhu FALSE.
    //
    //   Vi du:  1000 > NULL   ->   NULL   ->   WHERE thay la FALSE
    //
    // Nghia la neu de nguyen `> machine_state.last_telemetry_ts` thi mot thiet
    // bi co last_telemetry_ts = NULL se KHONG BAO GIO cap nhat duoc trang thai.
    // Ket qua: thiet bi gui status truoc (tao dong voi last_telemetry_ts NULL),
    // roi gui telemetry — dashboard mai mai khong thay so do nao.
    //
    // COALESCE(x, 0) doi NULL thanh 0. Moi timestamp that deu lon hon 0, nen
    // message dau tien luon duoc chap nhan.
    await client.query(
      `INSERT INTO machine_state (device_id, last_metrics, last_telemetry_ts, last_telemetry_at, last_seen_at, updated_at)
       VALUES ($1, $2, $3, now(), now(), now())
       ON CONFLICT (device_id) DO UPDATE
         SET last_metrics      = EXCLUDED.last_metrics,
             last_telemetry_ts = EXCLUDED.last_telemetry_ts,
             last_telemetry_at = EXCLUDED.last_telemetry_at,
             last_seen_at      = EXCLUDED.last_seen_at,
             updated_at        = EXCLUDED.updated_at
         WHERE EXCLUDED.last_telemetry_ts > COALESCE(machine_state.last_telemetry_ts, 0)`,
      [deviceId, JSON.stringify(metrics), timestamp],
    );

    await client.query('COMMIT');

    return { inserted: inserted.rowCount > 0 };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Luon tra ket noi ve pool, du thanh cong hay that bai. Quen buoc nay thi
    // pool can ket noi sau vai chuc lan loi.
    client.release();
  }
}
