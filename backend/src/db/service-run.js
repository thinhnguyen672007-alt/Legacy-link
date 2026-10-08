// db/service-run.js
// Nhiem vu: ghi lai lich su cac lan tien trinh MQTT chay, de biet duoc
// KHOANG NAO backend khong hoat dong.
//
// Lịch sử tiến trình cho biết khả năng có khoảng gián đoạn, không khẳng định mất mẫu.
// Firmware giữ mẫu trong hàng đợi và chờ ingestion ACK có thể gửi bù sau phục hồi.
// Tiến trình còn chạy vẫn có thể mất MQTT/database, nên health phải theo dõi riêng.

import { pool } from './pool.js';

// Ghi lai lan khoi dong nay, va phat hien lan chay truoc ket thuc bat thuong.
//
// Tra ve:
//   runId     — id cua lan chay NAY. Phai giu lai de luc tat con dong dung dong.
//   staleRuns — cac lan chay truoc khong dong duoc sach se (da crash / mat dien)
export async function recordServiceStart() {
  // Tim cac lan chay chua co stopped_at. Binh thuong KHONG co dong nao, vi
  // lan chay truoc da dong sach se. Neu co dong, do la crash.
  const stale = await pool.query(
    `SELECT id, started_at
     FROM service_run
     WHERE stopped_at IS NULL
     ORDER BY started_at DESC`,
  );

  const inserted = await pool.query('INSERT INTO service_run DEFAULT VALUES RETURNING id');

  return {
    runId: Number(inserted.rows[0].id),
    staleRuns: stale.rows,
  };
}

// Ghi gio dung khi tat tu ton (SIGINT/SIGTERM).
//
// PHai truyen runId, va chI dong DUNG dong cua chinh no.
//
// VI SAO KHONG dung `WHERE stopped_at IS NULL`:
// Cau do trong dung lan dau, nhung no dong TAT CA cac dong dang mo — ke ca cac
// dong cua nhung lan chay da crash truoc do.
//
// Hau qua: lan chay sau khi tat tu te se XOA MAT bang chung ve cai crash truoc.
// Canh bao luc khoi dong hien ra mot lan, roi bien mat khoi database — va API
// khong bao gio bao duoc khoang du lieu da mat do.
//
// Da kiem chung: voi `WHERE stopped_at IS NULL`, sau khi kill -9 roi chay lai,
// dong cua lan bi kill van co stopped_at (bang dung gio dung cua lan sau).
export async function recordServiceStop(runId) {
  if (runId === null) {
    return;
  }

  await pool.query(
    'UPDATE service_run SET stopped_at = now() WHERE id = $1',
    [runId],
  );
}

// Danh sach cac lan chay, moi nhat truoc.
//
// Kem theo mot con so tinh san de ben nhan de doc: khoang nghi TRUOC lan chay
// do keo dai bao lau. Tinh tu lan chay truoc do (started_at - stopped_at).
//
// Voi lan chay hien tai (chua dung), nghi_truoc = thoi gian backend khong chay
// truoc khi no khoi dong — chinh la khoang du lieu co the da mat.
export async function listServiceRuns(limit) {
  const result = await pool.query(
    `SELECT
       id,
       started_at,
       stopped_at,
       EXTRACT(EPOCH FROM (started_at - LAG(stopped_at) OVER (ORDER BY started_at))) AS gap_before_seconds
     FROM service_run
     ORDER BY started_at DESC
     LIMIT $1`,
    [limit],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    startedAt: row.started_at,
    stoppedAt: row.stopped_at,
    // true  = tat tu ton
    // false = crash hoac mat dien, khong biet luc nao
    stoppedCleanly: row.stopped_at !== null,
    // So giay backend khong chay truoc khi lan chay nay bat dau.
    // null khi khong co lan chay truoc, hoac khi lan truoc dung dot ngot
    // (luc do khong biet chinh xac no dung luc nao).
    gapBeforeSeconds:
      row.gap_before_seconds === null ? null : Math.round(Number(row.gap_before_seconds)),
  }));
}
