# Kiến trúc triển khai thống nhất

```text
ESP32 (Modbus + queue RAM)
  │ MQTT QoS0, ID ổn định, giữ mẫu tới ACK
  ▼
Mosquitto ──► consumer ──► PostgreSQL
  ▲              │           ▲
  └── ACK sau COMMIT          │ đọc dữ liệu / lưu operation
                             │
Frontend ── HTTP ── Nginx ── API ── MQTT probe/apply ──► ESP32
```

- Broker chuyển tin, không thay PostgreSQL xác nhận lưu nghiệp vụ.
- Consumer kiểm tra payload/catalog/gateway, lưu transaction và receipt chống trùng rồi ACK.
- API phục vụ dữ liệu/commissioning, kiểm tra read/write token và CORS. Proxy giữ Authorization.
- Watchdog nằm ngoài mỗi tiến trình Node, kiểm tra readiness và dành đủ thời gian drain khi dừng.
- Diagnostics firmware mang rawWords/read error và delivery queue; API không giả vờ biết queue khi báo cáo đã cũ.

| Đường kết nối | Cấu hình |
|---|---|
| ESP32 → MQTT | IP LAN host:1883, credential trong local_settings.h |
| Node → MQTT/DB | mosquitto:1883 và postgres:5432 trong Docker |
| Trình duyệt → API | HTTP_BIND_ADDRESS:HTTP_PORT, mặc định 127.0.0.1:3000 qua Nginx |
| Host → DB | 127.0.0.1:POSTGRES_PORT; không mở DB ra LAN |

PostgreSQL là service hiện có, không phải thành phần tương lai. Không có dịch vụ TimescaleDB hay MQTT WebSocket 9001 trong Compose này. Frontend gọi HTTP API, không cần credential MQTT.

Named volume postgres-data giữ dữ liệu khi recreate container. Profile maintenance tùy chọn thêm backup-data và lịch retention. Hai volume cùng host chưa thay thế bản backup ngoài máy.

Bản stack này dành cho LAN tin cậy, HTTP/MQTT chưa mã hóa. Tài khoản MQTT chung phù hợp demo nhỏ; triển khai ngoài LAN cần TLS/ACL và quản lý credential theo thiết bị. Mẫu backend/deploy phục vụ kiểm thử TLS/ACL riêng, không tự biến ESP32 thành client TLS.

Lỗi giao tiếp được kiểm thử bằng infrastructure/scripts/test-stack.mjs trên project riêng; script không sửa hay flash phần cứng. Khi có frontend, vẫn phải kiểm tra trình duyệt và đường Wi-Fi/RS-485 thực tế.
