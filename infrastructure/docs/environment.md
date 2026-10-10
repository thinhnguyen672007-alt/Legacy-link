# Env, token và kết nối

Chạy `node scripts/prepare-env.mjs` trong `infrastructure/`. Máy mới được tạo mật khẩu riêng và hai token khác nhau. Lần sau giữ nguyên giá trị; file 0600, không đưa vào Git. `load-env.sh` dùng parser Node, không thực thi `.env` như Bash.

| Biến | Ý nghĩa |
|---|---|
| MQTT_DEV_USER/PASS | Credential broker chung của bản demo; ESP32 và backend phải khớp |
| MQTT_CLIENT_ID | Cùng giá trị consumer/API để đọc đúng heartbeat; không chạy hai consumer trùng ID |
| POSTGRES_USER/PASS/DB | Chữ/số và `_ . ~ -`; giới hạn để ghép DATABASE_URL an toàn |
| HTTP_BIND_ADDRESS/HTTP_PORT | 127.0.0.1:3000 mặc định; 0.0.0.0 nếu cần LAN |
| API_READ_TOKEN | GET dữ liệu; không được POST |
| API_WRITE_TOKEN | GET và POST; khác read token, dài 32–128 ký tự hex |
| CORS_ORIGINS | Các origin đầy đủ phân cách dấu phẩy, ví dụ http://192.168.1.20:5173 |
| BENCH_GATEWAY_ID | 12 ký tự HEX hoa đọc từ USB ESP32 |

Đổi `.env` không đổi mật khẩu của PostgreSQL có dữ liệu. Đổi credential DB cần quy trình quản trị DB, không xóa volume. Hai bộ env `backend/.env` và `infrastructure/.env` thuộc hai cách chạy khác nhau: không tự đồng bộ.

## HTTP

- GET `/health/live`, `/health/ready` công khai.
- GET `/machines`, `/catalog`, `/profiles`… cần read hoặc write token.
- POST probe/apply/import/ack cần write token. Thiếu/sai token: 401; read token gọi POST: 403.
- OPTIONS để trình duyệt hỏi CORS không yêu cầu token, nhưng Origin phải được backend cho phép.
- Proxy giữ Authorization và chuyển header CORS của backend; không tự thêm `*`.

Đổi token/CORS rồi chạy `docker compose up -d backend-api api-gateway`. Không hardcode token vào bundle frontend/repo. Curl/script thường không có Origin nên không vướng CORS; trình duyệt có Origin.

Muốn dùng biến cho curl, chạy từ infrastructure:

```bash
source scripts/load-env.sh
curl -H "Authorization: Bearer $API_READ_TOKEN" http://127.0.0.1:3000/machines
```

Không in `.env` hoặc `docker compose config` đầy đủ trong log chia sẻ. Mẫu này dùng MQTT/HTTP plaintext trong LAN tin cậy; TLS/ACL của backend ở `backend/deploy/` là bộ cấu hình/test riêng, chưa tự bật TLS trên ESP32.
