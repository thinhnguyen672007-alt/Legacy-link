# Kết quả kiểm thử hạ tầng — 2026-10-10

## Phạm vi và môi trường

- Nhánh `feature/infra-base`; chỉ sửa `infrastructure/` và tài liệu liên quan, không sửa
  source backend/firmware.
- Stack demo đang chạy trên máy phát triển Linux (Docker + Compose v2). Không dùng ESP32 thật.
- Database demo đang ở schema cũ (10 bảng, trước C16) khi bắt đầu; backend trong repo đã lên
  schema version 4 nên phần việc chính là nâng cấp và kiểm chứng lại.
- Đây là ghi chép theo thời điểm, chạy trên bản trước khi hợp nhất với `main`. Sau hợp nhất,
  `setup.sh` migrate qua `backend/scripts/migrate.mjs` và probe dùng readiness của chính
  backend; các bước "lúc kiểm tra" bên dưới mô tả đúng lần chạy đó, không phải code hiện tại.

## Kết quả

| Bài kiểm tra | Kết quả và bằng chứng |
| --- | --- |
| Nâng cấp schema | `setup.sh` (bản lúc kiểm tra) backup DB rồi nạp `schema.sql`: từ 10 bảng lên **15/15 bảng, version=4** |
| API khởi động | Trước sửa, `backend-api` crash-loop vì thiếu `API_READ_TOKEN`/`API_WRITE_TOKEN`. Sau khi nối token, cả 5 dịch vụ healthy và `/health/ready` có `schema:true` |
| Ma trận xác thực | GET không token 401; GET token đọc 200; Origin lạ 403; preflight 204; POST không token 401; POST token ghi tới được API (404 cho id không tồn tại) |
| Đọc có xác thực | `status.sh` xác nhận GET `/machines` qua gateway bằng `API_READ_TOKEN` trả 200 |
| Ngắt backend-consumer | Gửi bù 6/6 ID, gửi lặp vẫn 6 bản ghi/receipt, lịch sử về trước giữ nguyên |
| Ngắt PostgreSQL | Không có committed ACK trong outage; sau phục hồi nhận đủ mẫu |
| Ngắt Mosquitto | Reconnect nhận đủ ACK; `ready` xuống 503 rồi trở lại 200 |
| Ngắt mạng consumer | Sửa ID container cũ trước khi `docker network disconnect`; bài chạy hết thay vì dừng giữa chừng |
| Backup bàn giao | `backups/p0-verified-20261008.dump` phục hồi vào DB tạm: 129 telemetry, 0 alarm |
| Trạng thái cuối | 5 dịch vụ healthy, API ready 200, 324 telemetry cũ, 0 fixture thử, không còn lock |

Bằng chứng cục bộ (Git bỏ qua):

- `reports/recovery-20261010T051847Z-330563/` — chạy đủ bốn kịch bản, mỗi `result.json`
  ghi `passed:true`, 6 mẫu, chống trùng và xác thực ghi.
- `reports/recovery-20261010T050549Z-285839/` — riêng kịch bản mạng sau khi sửa.

## Sửa lỗi phát hiện trong lần này

1. **Backend mới không khởi động dưới stack cũ:** thiếu hai token và Nginx xóa header
   `Authorization`. Đã nối token vào `backend-api`, để Nginx chuyển tiếp header, trả lời
   preflight tại gateway.
2. **`test-recovery.sh` kịch bản mạng:** đọc ID container consumer một lần lúc đầu, nhưng
   các bài trước đã recreate nó, nên `docker network disconnect` báo "No such container".
3. **Harness nghiệm thu lệch C11:** thiết bị giả `INFRA-TEST` không có metric trong catalog
   nên backend trả `metric_not_configured`. Đã đăng ký metric fixture và dọn khi kết thúc.
4. **Watchdog cắt drain:** wrapper force-kill sau 7 giây trong khi deadline drain của backend
   là 15 giây. Đã đọc `SHUTDOWN_TIMEOUT_MS` và đặt `stop_grace_period` dài hơn deadline
   (bản sau hợp nhất: 130 giây).
5. **Kiểm tra schema lỗi thời (bản lúc kiểm tra):** probe và `setup.sh` vẫn đếm 10 bảng; đã
   nâng lên đủ 15 bảng và `schema_migrations >= 4`. Sau hợp nhất, việc kiểm tra schema do
   `backend/src/db/schema-version.js` và `scripts/migrate.mjs` đảm nhiệm.

## Phần chưa thể chốt

1. **ESP32 thật:** cold boot/NTP, credential thực, hàng đợi khi mất mạng và đối chiếu số mẫu.
2. **TLS/ACL riêng:** broker demo vẫn dùng credential chung; chưa triển khai CA/ACL theo
   gateway. Xem `backend/deploy/README.md`.
3. **Frontend:** chưa có service trong stack; cần nhập token và origin đúng `CORS_ORIGINS`.
4. **Video demo** chưa được quay.
