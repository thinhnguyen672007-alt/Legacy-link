// Mặc định chỉ thống kê. --apply mới thực hiện xóa lịch sử theo policy, giữ receipt chống trùng.
import { runRetention } from '../src/db/retention.js';
import { pool } from '../src/db/pool.js';
try {
  console.log(
    JSON.stringify(
      await runRetention({
        dryRun: !process.argv.includes('--apply'),
        telemetryDays: Number(process.env.TELEMETRY_RETENTION_DAYS ?? 30),
        alarmDays: Number(process.env.ALARM_RETENTION_DAYS ?? 90),
      }),
      null,
      2
    )
  );
} finally {
  await pool.end();
}
