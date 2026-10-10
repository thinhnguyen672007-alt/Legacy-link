# Env, credential và kết nối frontend

Các lệnh chạy trong `infrastructure/`.

## 2. Cấu hình và đăng ký thiết bị

Copy `.env.example` thành `.env` nếu chưa có, rồi điền trước khi demo.

| Biến | Cách dùng |
| --- | --- |
| `MQTT_DEV_USER`, `MQTT_DEV_PASS` | Chung cho broker và Node; firmware phải dùng cùng credential |
| `MQTT_CLIENT_ID` | Cùng một giá trị ở consumer/API để API đọc đúng heartbeat |
| `POSTGRES_USER`, `POSTGRES_PASS`, `POSTGRES_DB` | Dùng chữ/số và `_ . ~ -`; Compose ghép thành DATABASE_URL |
| `HTTP_PORT`, `HTTP_BIND_ADDRESS` | Mặc định `3000`, `127.0.0.1`; mở `0.0.0.0` khi cần LAN |
| `API_WRITE_TOKEN` | Setup tự tạo hex ngẫu nhiên khi để trống; giữ riêng trong `.env` |
| `BENCH_GATEWAY_ID` | Gateway ID thật 12 ký tự HEX hoa; không lấy ID ví dụ làm ID thật |

Postgres chỉ đọc tài khoản khởi tạo khi volume còn trống. Đổi `.env` không đổi
mật khẩu trong DB đang có; phải thực hiện thay đổi tài khoản trong PostgreSQL có kiểm soát.
Không xóa volume để “sửa mật khẩu”. Mẫu credential chỉ dùng phát triển; chốt credential
riêng trước demo và đồng bộ firmware. Script đọc `.env` như Bash; đặt giá trị có ký tự
đặc biệt trong dấu nháy đơn. Giới hạn ký tự PostgreSQL phía trên vẫn áp dụng.

Đăng ký BENCH-01 với simulator sau khi điền ID thật:

```bash
./scripts/setup.sh --seed-bench
```

Seed không ghi đè thiết bị đã đăng ký; nếu ID hiện có khác phần cứng, phối hợp backend
qua quy trình commissioning. Dữ liệu lịch sử không tự tạo bản đăng ký thiết bị.

## 4. API và token cho frontend

API trực tiếp chỉ ở mạng Docker; cổng host đi qua Nginx. GET/HEAD/OPTIONS không cần token.
POST/PUT/PATCH/DELETE cần header `Authorization: Bearer <API_WRITE_TOKEN>`.
Frontend cần cho người vận hành nhập token, không nhúng token vào repo/bundle công khai.
Preflight CORS cho phép header Authorization. Đây là shared token demo, chưa có phân quyền
người dùng. Khi truy cập ngoài môi trường LAN tin cậy cần HTTPS; không gửi token qua mạng công cộng HTTP.

Ví dụ dùng token mà không in ra màn hình (thay đường dẫn và body theo API docs):

```bash
source .env
curl -H "Authorization: Bearer $API_WRITE_TOKEN" -H 'Content-Type: application/json' \
  -X POST http://127.0.0.1:3000/alarms/RECORD_ID/ack
```

Đổi token trong `.env` rồi `docker compose up -d api-gateway`. Node không cần biết token.
