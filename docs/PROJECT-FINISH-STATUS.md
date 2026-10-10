# Trạng thái hoàn tất Legacy-link

Mốc nguồn: `main` tại `8364b1e` (PR #71). Nhánh triển khai: `feature/demo-compose`. Kế hoạch chung: [PROJECT-FINISH-PLAN.md](PROJECT-FINISH-PLAN.md).

| Chặng | Trạng thái | Bằng chứng / còn thiếu |
| --- | --- | --- |
| A — Docker | Đã triển khai và kiểm thử độc lập | Compose dựng đủ stack từ dữ liệu rỗng; Chromium đăng nhập qua frontend; restart giữ tài khoản/dữ liệu; accounts, outage, backup/restore qua |
| B — Demo thật | Đang thực hiện | Hai máy đã thông nhau qua Wi-Fi; web mới lên ở máy 2; còn thử web từ máy 1 và ESP32/Modbus thật |
| C — Windows | Chưa triển khai | Chưa có desktop code, installer hoặc test Windows |
| D — Bàn giao | Đã có kế hoạch | Còn runbook bản chốt, báo cáo nghiệm thu, artifacts và diễn tập |

## Chặng A — kết quả 2026-10-10

- `infrastructure/` nay chạy broker, PostgreSQL, migration/admin init, consumer, API và frontend bằng `docker compose up -d --build --wait` sau khi tạo `.env` một lần. `prepare-env.mjs` sinh mật khẩu admin và origin theo IP LAN; chạy lại giữ secrets cũ.
- Test stack tạo project/volume/cổng/mật khẩu riêng tại `/tmp/legacy-stack-u1rwZg`, không dùng `.env` lab. Lệnh `node infrastructure/scripts/test-stack.mjs` **PASS**: cold start, web proxy/login/đổi mật khẩu, restart giữ ID/mật khẩu mới/lịch sử, setup nâng cấp cũ, outage/replay, backup/restore và retention dry-run. Kết quả: `/tmp/legacy-stack-u1rwZg/result.json`. Test container/volume đã dọn.
- Chromium headless thật đăng nhập Admin trên frontend test và thấy menu Admin; POST `/api/auth/login` đã đi qua proxy. Ảnh: `/tmp/legacy-stack-u1rwZg/browser-login.png`. Đây là browser trên cùng Linux qua `127.0.0.1`; truy cập từ máy khác qua hotspot thuộc chặng B.
- `npm test` trong `backend/`: 83/83 PASS. `npm run test:accounts`: PASS migration/bootstrap, Viewer/Technician/Admin, đổi mật khẩu, thu hồi phiên, quyền và audit. `npm test -- --run src/test/accounts.test.tsx src/test/app.test.tsx` trong `frontend/`: 8/8 PASS. `node --test infrastructure/test/prepare-env.test.mjs`: PASS. `node --test infrastructure/test/*.test.cjs`: PASS watchdog. `docker compose config --quiet`, kiểm tra cú pháp và `git diff --check`: PASS.
- Trong chặng A, stack lab đang chạy (`infrastructure-*`, `legacy-link-*`) không bị stop/migrate; bước nâng cấp có backup được thực hiện ở chặng B. Không dùng kết quả test A để khẳng định ESP32 thật hoặc Windows app đã chạy.

## Chặng B — tiến độ 2026-10-10

- Máy 2 Linux đang dùng Wi-Fi thường, IP lúc kiểm tra là `192.168.110.12`. Người dùng mở được `http://192.168.110.12:3000/health/ready` từ máy 1, xác nhận hai máy trao đổi qua LAN.
- Cập nhật `DEMO_LAN_IP` trong `.env` đã được Git bỏ qua, sinh admin password riêng và thêm CORS origin. Chạy `bash scripts/setup.sh` trên project `infrastructure`: backup trước nâng cấp tại `infrastructure/backups/legacy-link-20261010T125040Z-484004.dump`, migration schema 5, bootstrap admin và khởi động web/consumer/API/broker. Script kết thúc PASS; MQTT roundtrip, API và frontend ready 200. DB sau nâng cấp vẫn có 1 thiết bị, 324 số đo và 1 cảnh báo.
- Từ máy 2, POST đăng nhập Admin qua `http://192.168.110.12:8080/api/auth/login` với Origin LAN trả 200. Chưa thử đăng nhập giao diện từ máy 1; chưa xác minh ESP32/Modbus trên mạng Wi-Fi này. IP có thể đổi khi kết nối lại.

## Bước tiếp theo

Chặng B: mở `http://192.168.110.12:8080` từ máy 1 và đăng nhập bằng admin credential trong `infrastructure/.env` trên máy 2. Sau đó kết nối ESP32/Modbus vào cùng Wi-Fi, cập nhật broker host nếu cần và thử phép đo mới qua MQTT → DB → UI. Cần phối hợp người vận hành trước khi chạm bench/firmware.

## Quy tắc cập nhật

Sau mỗi chặng, ghi commit, lệnh kiểm tra, kết quả thật, đường dẫn bằng chứng đã che bí mật và đúng việc còn chờ. Test chưa chạy phải ghi chưa chạy. Không đánh dấu pass từ suy đoán hoặc báo cáo của commit cũ.
