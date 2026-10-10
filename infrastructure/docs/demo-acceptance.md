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

**Phải thử thêm trên ESP32 thật:** USB 115200, `:health`, chụp pending/committed/headId;
ngắt backend hoặc Wi-Fi ngắn, bật lại và đối chiếu ID ở DB. Firmware có queue 32 telemetry,
8 alarm; chu kỳ 2 giây tương ứng khoảng 64 giây telemetry. Khi đầy, mẫu mới có thể bị từ chối.
Giữ mất kết nối dưới giới hạn buffer; không tuyên bố không mất dữ liệu vô hạn.
Xác nhận cold boot đồng bộ NTP trong mạng demo. LAN IP/Wi-Fi do người vận hành chốt.

Gợi ý pitch: quay video ngắt kết nối rồi số mẫu pending giảm về 0, DB chỉ lưu mỗi ID một lần.
Giữ video và DB dump làm bản dự phòng. Chỉ công bố số đo đã thực hiện trên phần cứng thật.
