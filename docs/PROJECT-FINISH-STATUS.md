# Trạng thái hoàn tất Legacy-link

Mốc nguồn: `main` tại `8364b1e` (PR #71). Nhánh triển khai: `feature/demo-compose`. Kế hoạch chung: [PROJECT-FINISH-PLAN.md](PROJECT-FINISH-PLAN.md).

| Chặng | Trạng thái | Bằng chứng / còn thiếu |
| --- | --- | --- |
| A — Docker | Đã triển khai và kiểm thử độc lập | Compose dựng đủ stack từ dữ liệu rỗng; Chromium đăng nhập qua frontend; restart giữ tài khoản/dữ liệu; accounts, outage, backup/restore qua |
| B — Demo thật | Chưa nghiệm thu bản mới | Cần IP hotspot, hai máy, ESP32/Modbus thật và người vận hành bench |
| C — Windows | Chưa triển khai | Chưa có desktop code, installer hoặc test Windows |
| D — Bàn giao | Đã có kế hoạch | Còn runbook bản chốt, báo cáo nghiệm thu, artifacts và diễn tập |

## Chặng A — kết quả 2026-10-10

- `infrastructure/` nay chạy broker, PostgreSQL, migration/admin init, consumer, API và frontend bằng `docker compose up -d --build --wait` sau khi tạo `.env` một lần. `prepare-env.mjs` sinh mật khẩu admin và origin theo IP LAN; chạy lại giữ secrets cũ.
- Test stack tạo project/volume/cổng/mật khẩu riêng tại `/tmp/legacy-stack-u1rwZg`, không dùng `.env` lab. Lệnh `node infrastructure/scripts/test-stack.mjs` **PASS**: cold start, web proxy/login/đổi mật khẩu, restart giữ ID/mật khẩu mới/lịch sử, setup nâng cấp cũ, outage/replay, backup/restore và retention dry-run. Kết quả: `/tmp/legacy-stack-u1rwZg/result.json`. Test container/volume đã dọn.
- Chromium headless thật đăng nhập Admin trên frontend test và thấy menu Admin; POST `/api/auth/login` đã đi qua proxy. Ảnh: `/tmp/legacy-stack-u1rwZg/browser-login.png`. Đây là browser trên cùng Linux qua `127.0.0.1`; truy cập từ máy khác qua hotspot thuộc chặng B.
- `npm test` trong `backend/`: 83/83 PASS. `npm run test:accounts`: PASS migration/bootstrap, Viewer/Technician/Admin, đổi mật khẩu, thu hồi phiên, quyền và audit. `npm test -- --run src/test/accounts.test.tsx src/test/app.test.tsx` trong `frontend/`: 8/8 PASS. `node --test infrastructure/test/prepare-env.test.mjs`: PASS. `node --test infrastructure/test/*.test.cjs`: PASS watchdog. `docker compose config --quiet`, kiểm tra cú pháp và `git diff --check`: PASS.
- Stack lab đang chạy (`infrastructure-*`, `legacy-link-*`) không bị stop/migrate. Không dùng kết quả test này để khẳng định ESP32 thật hoặc Windows app đã chạy.

## Bước tiếp theo

Chặng B: lấy IP Wi-Fi Linux trên hotspot iPhone khi hai máy/ESP32 đã sẵn sàng; dựng bản mới ở cổng/project riêng hoặc chuyển stack có backup theo runbook; thử web từ máy 1 và chuỗi Modbus → ESP32 → MQTT → DB → UI. Cần phối hợp người vận hành trước khi chạm bench/firmware.

## Quy tắc cập nhật

Sau mỗi chặng, ghi commit, lệnh kiểm tra, kết quả thật, đường dẫn bằng chứng đã che bí mật và đúng việc còn chờ. Test chưa chạy phải ghi chưa chạy. Không đánh dấu pass từ suy đoán hoặc báo cáo của commit cũ.
