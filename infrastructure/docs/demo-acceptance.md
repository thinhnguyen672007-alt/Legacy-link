# Kiểm thử và trình diễn phục hồi

Các lệnh chạy trong `infrastructure/`.

## 6. Bài trình diễn phục hồi

```bash
./scripts/test-recovery.sh
```

Script thử lần lượt tắt consumer, tắt DB, tắt broker và ngắt mạng Docker của consumer.
Mỗi tình huống dùng 4 telemetry + 2 alarm của thiết bị giả. Kiểm tra:

1. Live vẫn 200, ready trở thành 503, không ACK committed khi dependency chưa sẵn sàng.
2. Gửi bù đủ 6 ID sau phục hồi; gửi lặp lại vẫn chỉ có 6 bản ghi/receipt.
3. API đọc được dữ liệu, token ghi đúng, retained MQTT và lịch sử cũ còn nguyên.

Các mẫu thử được dọn; `reports/recovery-*/.../result.json` giữ bằng chứng cục bộ.
Script cố gắng bật lại dịch vụ và dọn fixture cả khi lỗi/Ctrl+C.
Nếu máy mất nguồn hoặc script bị SIGKILL thì phải kiểm tra `status.sh` và log để phục hồi.

**Trạng thái trên ESP32 thật:** bài đo 2026-10-10 đã chạy USB `:health`, ngắt
backend/DB/broker 12 giây, queue đầy 32 slot, rejected head, probe/apply profile A/B và
power cycle — xem
[firmware bench](../../firmware/legacy-link-core/docs/physical-acceptance-2026-10-10.md) và
[backend record](../../docs/physical-acceptance-2026-10-10.md). Còn phải thử: outage chỉ do
Wi-Fi, cold-boot LWT timing, ACL/TLS theo gateway, và đối chiếu trên máy CNC/RS-485 thật.
Firmware có queue 32 telemetry, 8 alarm; khi đầy mẫu mới có thể bị từ chối, giữ mất kết nối
dưới giới hạn buffer — không tuyên bố không mất dữ liệu vô hạn. LAN IP/Wi-Fi do người vận
hành chốt.

Gợi ý pitch: quay video ngắt kết nối rồi số mẫu pending giảm về 0, DB chỉ lưu mỗi ID một lần.
Giữ video và DB dump làm bản dự phòng. Chỉ công bố số đo đã thực hiện trên phần cứng thật.
