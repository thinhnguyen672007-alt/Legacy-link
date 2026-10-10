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
| `API_READ_TOKEN` | Token đọc (GET); setup tự tạo hex ngẫu nhiên khi để trống |
| `API_WRITE_TOKEN` | Token ghi (POST) và token Nginx dùng để chặn ghi; setup tự tạo khi để trống |
| `CORS_ORIGINS` | Origin frontend được phép, phân tách dấu phẩy; để trống là không cho origin nào |
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

API trực tiếp chỉ ở mạng Docker; cổng host đi qua Nginx. Health không cần token.
GET/HEAD cần `Authorization: Bearer <API_READ_TOKEN>`; POST cần `Bearer <API_WRITE_TOKEN>`.
Nginx giữ vai trò chặn sớm request ghi thiếu token (401) và trả lời preflight OPTIONS (204);
backend vẫn kiểm tra lại quyền, nên token phải được chuyển tiếp, không bị xóa ở gateway.
Frontend cần cho người vận hành nhập token, không nhúng token vào repo/bundle công khai.
`CORS_ORIGINS` phải chứa origin thật của frontend, nếu không backend trả 403 cho request thật.
Đây là token dùng chung theo vai trò cho demo, chưa có phân quyền người dùng.
Khi truy cập ngoài môi trường LAN tin cậy cần HTTPS; không gửi token qua mạng công cộng HTTP.

Ví dụ dùng token mà không in ra màn hình (thay đường dẫn và body theo API docs):

```bash
source .env
curl -H "Authorization: Bearer $API_WRITE_TOKEN" -H 'Content-Type: application/json' \
  -X POST http://127.0.0.1:3000/alarms/RECORD_ID/ack
```

Đổi token trong `.env` rồi `docker compose up -d api-gateway`. Node không cần biết token.
