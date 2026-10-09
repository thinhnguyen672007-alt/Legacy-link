# Chạy backend sau C11–C15

Code thay đổi ở local, không tự push, không tự thay broker/database đang chạy.
Không có migration database mới trong C11–C15. Database cũ vẫn cần migration C7–C10 như trước.

## 1. Chạy bằng Node trong máy Thịnh

```bash
cd /home/nguyenvuducthinh/Legacy-link/backend
npm ci
```

Giữ file `.env` hiện tại và thông tin PostgreSQL/MQTT đang dùng. Bổ sung:

```dotenv
API_READ_TOKEN=<token-ngau-nhien-thu-nhat>
API_WRITE_TOKEN=<token-ngau-nhien-thu-hai>
API_AUTH_DISABLED=false
CORS_ORIGINS=http://localhost:5173
INGESTION_CONCURRENCY=4
INGESTION_CAPACITY=256
MQTT_MAX_PAYLOAD_BYTES=16384
SHUTDOWN_TIMEOUT_MS=15000
```

Tạo token bằng lệnh sau, chạy hai lần, tự chép hai kết quả khác nhau vào `.env`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Không gửi token lên chat, không commit `.env`, không viết token thật vào source frontend. Token có giá trị như chìa khóa: ai có token thao tác đều có quyền thao tác. Đây là cơ chế hai vai trò cho demo, chưa phải hệ thống tài khoản cá nhân.

Mở hai terminal trong `backend`:

```bash
npm start
```

```bash
npm run start:http
```

`GET /health/live` và `/health/ready` không cần token. Các API dữ liệu cần header:

```http
Authorization: Bearer <token>
```

Token đọc được GET; token ghi được GET và POST. Thiếu/sai token trả 401; đúng token đọc nhưng POST trả 403. Production không cho tắt auth. Nếu cần kiểm tra local tạm thời: `API_AUTH_DISABLED=true`, `HTTP_HOST=127.0.0.1`, `NODE_ENV=development`; chỉ áp dụng trên chính máy chạy backend.

Frontend dùng `examples/frontend-client.js`:

```js
// Token do người vận hành nhập lúc sử dụng, giữ trong RAM của trang.
let sessionToken = '';
const api = createLegacyLinkApi('http://localhost:3000', {
  getToken: () => sessionToken,
});
// Khi người dùng nhập token vào form: sessionToken = giaTriDaNhap;
const machines = await api.machines();
```

Đặt `CORS_ORIGINS` đúng origin của frontend; `http://127.0.0.1:5173` khác `http://localhost:5173`. Nhiều origin phân cách bằng dấu phẩy. Không dùng `*`. Không dùng CORS thay authentication: chương trình ngoài trình duyệt vẫn có thể gọi HTTP, nên token luôn được kiểm tra.

## 2. Docker cho Huy

`Dockerfile` dùng chung cho consumer và HTTP; chạy bằng user `node`, không phải root. `compose.yml` tạo hai service. Nó **không tạo lại database/broker**.

1. Tạo `.env.compose` từ `.env.example`, điền credential riêng.
2. `DATABASE_URL` và `MQTT_URL` phải dùng tên dịch vụ/địa chỉ tới được từ container, không dùng `localhost` nếu DB/broker ở container khác.
3. Đặt `LEGACY_NETWORK` bằng tên Docker network có PostgreSQL/broker. Xem `docker network ls`; mặc định mẫu là `legacy-link_default`, không khẳng định network này đã tồn tại.
4. API production cần hai token. Production mặc định yêu cầu `mqtts://`; nếu chỉ có broker plaintext trong mạng Docker riêng đã kiểm soát, Huy có thể opt-in `MQTT_ALLOW_PLAINTEXT=true`. Không coi opt-in này là đã có TLS.
5. Nếu CA riêng: mount file PEM read-only vào cả consumer và api, đặt `MQTT_TLS_CA_FILE` bằng đường dẫn **trong container**. CA công cộng được Node tin thì không cần biến này.
6. Consumer đang chạy ngoài Compose phải dừng trước khi dùng cùng `MQTT_CLIENT_ID`, tránh hai tiến trình đá kết nối của nhau.

```bash
cd /home/nguyenvuducthinh/Legacy-link/backend
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose up --build -d
docker compose ps
docker compose logs --tail=80 consumer api
```

Cổng API bind `127.0.0.1:3000` trên host. Huy đặt reverse proxy HTTPS phía trước nếu cần truy cập từ máy khác/Internet; file này chưa tự cấp domain/chứng chỉ HTTPS. Không đưa token qua đường HTTP công cộng. Healthcheck dùng readiness, nhưng Docker đánh dấu unhealthy không tự sửa database hay tự restart chỉ vì healthcheck đỏ.

`stop_grace_period=25s` dài hơn deadline consumer mặc định 15s. Nếu tăng `SHUTDOWN_TIMEOUT_MS`, tăng grace period tương ứng.

## 3. Tài khoản MQTT và TLS

`deploy/mosquitto.conf` và `deploy/acl` là mẫu đã kiểm tra bằng broker thử riêng. Không tự thay cấu hình broker thật của đội.

- Backend dùng username `backend`.
- Gateway demo dùng username `gateway-643C60A7DBCC`, chỉ được gửi cho `BENCH-01` và topic của chính gateway này.
- Huy tạo mật khẩu **khác nhau** bằng `mosquitto_passwd` ở môi trường broker; firmware chỉ nhận credential của gateway, không nhận tài khoản backend.
- Thêm gateway khác phải có username và ACL riêng, sửa mapping khi commissioning đổi deviceId. Nếu vẫn dùng chung credential thì người cầm credential vẫn chia sẻ quyền.
- Trong container broker, password file ở `/mosquitto/secrets/passwords`, certificate và key ở `/mosquitto/secrets/server.crt`, `server.key`; ACL ở `/mosquitto/config/acl`. Chỉ mount file cần thiết và cấp quyền đọc cho user mosquitto. Private key/password không đưa vào Git.
- Firmware cần MQTT TLS và xác minh CA tương ứng để dùng listener 8883. Test backend không chứng minh ESP32 hiện tại đã được đổi sang TLS.
- Thu hồi/đổi credential dùng chung cũ sau khi phối hợp cập nhật thiết bị và backend; không đổi đột ngột giữa buổi demo.

ACL dựa vào username đã xác thực, không tin clientId do client tự khai. Với cấu trúc topic hiện tại, một gateway phục vụ nhiều máy cần liệt kê các device được cấp. Tham khảo chính thức: [Mosquitto configuration](https://mosquitto.org/man/mosquitto-conf-5.html).

## 4. Kiểm thử và CI

```bash
cd /home/nguyenvuducthinh/Legacy-link/backend
npm test
npm run test:integration
npm run test:security
# Hoặc chạy cả ba:
npm run test:all
```

Unit test không cần Docker. Hai suite integration cần Docker, image `postgres:16`, `eclipse-mosquitto:2`; TLS suite cần `openssl`. Suite tự tạo container, port, mật khẩu, chứng chỉ tạm và dọn sau khi chạy; không sử dụng database demo.

`scripts/test-messages.sh` cũ chuyển sang gọi integration có assertion, không còn mật khẩu viết cứng và timestamp cũ. Package ở root repo còn thuộc phạm vi cũ; `npm test` ở root vẫn không phải lệnh nghiệm thu backend. Dùng `npm test --prefix backend` từ root.

`.github/workflows/backend.yml` chạy unit, integration, security và Docker build khi push/PR thay backend. File này ở ngoài backend vì GitHub chỉ tìm workflow tại `.github/workflows`. Chưa push nên chưa có kết quả GitHub Actions; kết quả hiện có là chạy local.

## 5. Giới hạn phải nói đúng

- Queue RAM có giới hạn; đầy thì bỏ nhận mẫu, không trả ACK committed. Firmware phải retry cùng ID, backoff và jitter để tránh nhiều máy gửi lại đồng thời. Firmware cũ thiếu queue có thể mất mẫu.
- Chống quá tải ở đây là giới hạn việc xử lý + từ chối nhận thêm, chưa phải flow control end-to-end khiến ESP32 tự giảm tốc.
- Catalog hiện tại dùng để kiểm tra mẫu chưa từng lưu; muốn nhận mẫu cũ theo cấu hình cũ cần version/config history riêng.
- Token chỉ có hai vai trò toàn hệ thống; chưa phân quyền theo từng công ty/máy, chưa có đăng nhập, session, audit người thao tác hoặc thu hồi riêng từng người.
- Chưa benchmark nhiều thiết bị, chưa chạy Compose này lên hạ tầng thật, chưa chứng minh ESP32 TLS/queue hay thiết bị công nghiệp thật.
