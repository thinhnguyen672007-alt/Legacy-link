# Kết quả kiểm thử hạ tầng — 2026-10-08

## Phiên bản và phạm vi

- Main được đồng bộ: `3bbd1ed` (backend PR54, firmware PR55).
- Infra: nhánh `feature/infra-base`, watchdog cuối tại `74e0921`.
- Các thay đổi triển khai nằm trong `infrastructure/`; không sửa source backend/firmware.
- Môi trường: Docker trên máy phát triển Linux. Chưa dùng ESP32 thật trong các bài dưới đây.

## Kết quả

| Bài kiểm tra | Kết quả và bằng chứng |
| --- | --- |
| Dựng sạch | Bản sao file repo, env riêng, database trống, network/container/cổng riêng: `setup.sh` tạo 10 bảng và 5 dịch vụ healthy |
| Chạy setup lần hai | Qua; token/env được giữ; không cần xóa volume |
| Backend | 57/57 Node unit tests qua trong image Node22 |
| Firmware host | 13 nhóm test qua, gồm queue/ACK, alarm, reconnect, NTP logic và USB health |
| Contract firmware/backend | 19 tin firmware được validators backend chấp nhận; từ chối ID/schema không khớp |
| MQTT credential | Publish/subscribe nhận đúng payload; kết nối anonymous bị từ chối |
| API | Đọc được 4 telemetry thử; request ghi không token nhận 401, token đúng nhận 200; CORS cho Authorization |
| Ngắt consumer | Gửi bù 6/6 mẫu, gửi lặp 6 mẫu không sinh bản ghi trùng |
| Ngắt PostgreSQL | Không có committed ACK trong outage; sau phục hồi nhận đủ mẫu và giữ lịch sử |
| Ngắt Mosquitto | Retained marker còn sau restart; Node tự phục hồi qua watchdog; nhận đủ ACK |
| Ngắt mạng consumer | Qua với watchdog cuối: toàn kịch bản khoảng 35,4 giây, so với 97 giây ở cấu hình watchdog trước |
| Backup trước migration | Phục hồi vào DB tạm: 8 bảng, 129 telemetry, 0 alarm |
| Backup bàn giao | `backups/p0-verified-20261008.dump` phục hồi vào DB tạm: 10 bảng, 129 telemetry, 0 alarm |
| Backup không ghi đè | Lần ghi thứ hai vào cùng tên bị từ chối; checksum file cũ giữ nguyên |
| Chạy đồng thời | Setup từ chối khi đã có operation lock; chạy xong nhả lock |
| Trạng thái cuối | 5 dịch vụ healthy, API ready 200, 129 telemetry cũ, 0 fixture thử, không còn lock |

Thời gian 35,4 giây là từ tạo fixture đến xong toàn bài (bao gồm kiểm tra API và gửi trùng),
không phải cam kết độ trễ phục hồi và không phải số đo onboarding phần cứng.
Broker test được thực hiện trước lần rút ngắn watchdog; network test được chạy lại với watchdog cuối.

Bằng chứng cục bộ được Git bỏ qua để tránh công khai dữ liệu/fixture:

- `reports/recovery-20261008T141331Z-322792/{backend-consumer,postgres}/result.json`
- `reports/recovery-20261008T141621Z-338844/mosquitto/result.json`
- `reports/recovery-20261008T142532Z-385482/network/result.json`

Mỗi bài tạo 4 telemetry + 2 alarm riêng, kiểm tra nội dung/ID/receipt, đối chiếu các hàng
lịch sử trước/sau và xóa đúng fixture của bài đó. Stack acceptance riêng đã được dọn;
stack demo và volume dữ liệu demo được giữ nguyên.

## Phần chưa thể chốt

1. **BENCH-01 chưa đăng ký:** bảng `device` hiện rỗng. Cần gateway ID thật rồi chạy
   `setup.sh --seed-bench`, hoặc commissioning qua API. Không seed ID lấy từ ví dụ.
2. **ESP32 thật:** cần cold boot/NTP, credential thực, hàng đợi khi mất mạng và đối chiếu
   số mẫu sau phục hồi. Host test không chứng minh Wi-Fi/RS485/phần cứng hoạt động.
3. **Backend reconnect:** subscribe callback rỗng sau reconnect làm readiness false dù
   vẫn nhận dữ liệu; có giai đoạn mạng phục hồi báo ready trước khi ACK hoạt động.
   Watchdog infra hỗ trợ phục hồi, lỗi gốc vẫn cần backend xử lý. Xem runbook.
4. **Giới hạn demo:** firmware queue RAM 32 telemetry/8 alarm; power loss hoặc queue đầy
   vẫn có thể mất mẫu. Frontend chưa được đóng gói trong stack; frontend cần gửi token
   khi gọi endpoint ghi. Video demo thực tế chưa được quay.
