# Trạng thái hoàn tất Legacy-link

Mốc nguồn: `main` tại `8364b1e` (PR #71). Nhánh triển khai: `feature/demo-compose`. Kế hoạch chung: [PROJECT-FINISH-PLAN.md](PROJECT-FINISH-PLAN.md).

| Chặng | Trạng thái | Bằng chứng / còn thiếu |
| --- | --- | --- |
| A — Docker | Đã triển khai và kiểm thử độc lập | Compose dựng đủ stack từ dữ liệu rỗng; Chromium đăng nhập qua frontend; restart giữ tài khoản/dữ liệu; accounts, outage, backup/restore qua |
| B — Demo thật | Đang nghiệm thu | Đăng nhập từ máy 1 và telemetry/alarm ESP32 thật đã tới máy 2; còn kiểm UI/ACK, commissioning, Copilot và recovery phối hợp |
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
- Từ máy 2, POST đăng nhập Admin qua `http://192.168.110.12:8080/api/auth/login` với Origin LAN trả 200. Người dùng xác nhận mở web, đăng nhập và đổi mật khẩu Admin từ máy 1 thành công. IP có thể đổi khi kết nối lại. Sửa `ADMIN_PASSWORD` trong `.env` không thay mật khẩu tài khoản đã tạo; sau reset tạm, người dùng đã đổi bằng luồng web.
- Tài khoản Technician `thinh` đã tạo và không bị khóa. Máy khác gửi login tới đúng server nhưng nhận 401; đã hướng dẫn Admin đặt lại mật khẩu bằng UI. Chưa có xác nhận nhân viên đăng nhập thành công.
- Agent trên máy 1 báo đã sửa MQTT host firmware từ IP máy 1 `192.168.110.128` sang máy 2 `192.168.110.12:1883`, nạp lại và xác nhận Wi-Fi/MQTT/NTP, 18 Modbus reads thành công/0 lỗi. Gateway `643C60A7DBCC`, device `BENCH-01`, sampling 2000 ms. Không đổi credentials. Agent đã dừng `acceptance-monitor.py` để giải phóng serial; simulator vẫn chạy.
- Đối chiếu trực tiếp trên máy 2 lúc `2026-10-10T13:23:43Z`: API ready 200; gateway online, `dataFresh=true`, `readHealth=healthy`, `deliveryHealth=healthy`, age 2s. DB tăng từ 324 lên 406 số đo; ba mẫu lúc 13:23:37/39/41 UTC có nhiệt độ 81.6/77.3/72.9, dòng 1.50/1.47/1.45, rpm 1785/1759/1723. Firmware diagnostics báo telemetry committed 82, pending 0; alarm committed 4, pending 0, không failedEnqueues. DB có OVERHEAT high lúc 13:22:57 và critical lúc 13:23:01 UTC. Đây là chứng cứ Modbus/ESP32 → broker → consumer → DB → API đang hoạt động; chưa thay cho xác nhận UI/ACK/commissioning/recovery.
- Source checkout chính đã được thao tác khác chuyển về `main`; stack vẫn dùng images đã build từ chặng A. Tiếp tục tài liệu/code trên worktree `/home/james/Projects/Hackathon DENSON/Legacy-link-demo` của nhánh `feature/demo-compose`, không tự đổi checkout đang dùng của người khác. `.env` live và bind mounts vẫn nằm tại repo gốc `Legacy-link-/infrastructure/`; không chạy Compose từ worktree trống cấu hình vào stack live.

## Bước tiếp theo

Chặng B: trên web máy 2 mở Cảnh báo, xác minh OVERHEAT mới của BENCH-01 và ACK một cảnh báo bằng Admin/Technician. Tiếp tục nghiệm thu commissioning/Copilot và outage ngắn có phối hợp máy 1; chưa stop broker hoặc flash lại chỉ để thử. Nhân viên đăng nhập vẫn cần người dùng xác nhận. Sau gate B mới chốt chuyển sang desktop Windows.

## Quy tắc cập nhật

Sau mỗi chặng, ghi commit, lệnh kiểm tra, kết quả thật, đường dẫn bằng chứng đã che bí mật và đúng việc còn chờ. Test chưa chạy phải ghi chưa chạy. Không đánh dấu pass từ suy đoán hoặc báo cáo của commit cũ.
