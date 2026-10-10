# Chạy backend sau C16 — hoàn thiện API và vận hành local

Code thay đổi ở local, không tự push, không tự thay broker/database đang chạy.
**Bản C16 này có migration mới, version 4.** Backup database demo trước, dừng API/consumer cũ, rồi chạy `npm run db:migrate` trước khi khởi động lại. Lệnh tự tạo schema nếu DB rỗng, hoặc chạy các migration C7–C10 và C16 nếu DB đã tồn tại. Nó không seed máy giả. Đã thử trên DB tạm; chưa tự chạy trên DB demo của bạn.

## 1. Chạy bằng Node trong máy Thịnh

```bash
cd /path/to/Legacy-link/backend
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

Sau khi `.env` đã trỏ đúng database, chạy một lần:

```bash
npm run db:migrate
```

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
3. Đặt `LEGACY_NETWORK` bằng tên Docker network có PostgreSQL/broker. Xem `docker network ls`; mặc định mẫu là `legacy-link-net`, không khẳng định network này đã tồn tại.
4. API production cần hai token. Production mặc định yêu cầu `mqtts://`; nếu chỉ có broker plaintext trong mạng Docker riêng đã kiểm soát, Huy có thể opt-in `MQTT_ALLOW_PLAINTEXT=true`. Không coi opt-in này là đã có TLS.
5. Nếu CA riêng: mount file PEM read-only vào cả consumer và api, đặt `MQTT_TLS_CA_FILE` bằng đường dẫn **trong container**. CA công cộng được Node tin thì không cần biến này.
6. Consumer đang chạy ngoài Compose phải dừng trước khi dùng cùng `MQTT_CLIENT_ID`, tránh hai tiến trình đá kết nối của nhau.

```bash
cd /path/to/Legacy-link/backend
docker compose --env-file .env.compose config --quiet
docker compose --env-file .env.compose build
docker compose --env-file .env.compose run --rm api npm run db:migrate
docker compose --env-file .env.compose up -d
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
cd /path/to/Legacy-link/backend
npm test
npm run test:integration
npm run test:security
npm run test:proxy
# Hoặc chạy cả ba:
npm run test:all
```

Unit test không cần Docker. Các suite integration cần Docker, image `postgres:16`, `eclipse-mosquitto:2`, `nginx:1.27-alpine`; TLS suite cần `openssl`. Test proxy dùng host network, phù hợp Linux. Suite tự tạo container, port, mật khẩu, chứng chỉ tạm và dọn sau khi chạy; không sử dụng database demo.

`scripts/test-messages.sh` cũ chuyển sang gọi integration có assertion, không còn mật khẩu viết cứng và timestamp cũ. `npm test` ở root đã chuyển tiếp vào test backend; `npm run test:all` ở root chạy toàn bộ suite backend. Đã bỏ dependency mysql2 không được code root sử dụng; MQTT root vẫn giữ.

`.github/workflows/backend.yml` chạy unit, integration, security, proxy và Docker build khi push/PR thay backend. File này ở ngoài backend vì GitHub chỉ tìm workflow tại `.github/workflows`. Chưa push nên chưa có kết quả GitHub Actions; kết quả hiện có là chạy local.

## 5. Giới hạn phải nói đúng

- Queue RAM có giới hạn; đầy thì bỏ nhận mẫu, không trả ACK committed. Firmware phải retry cùng ID, backoff và jitter để tránh nhiều máy gửi lại đồng thời. Firmware cũ thiếu queue có thể mất mẫu.
- Chống quá tải ở đây là giới hạn việc xử lý + từ chối nhận thêm, chưa phải flow control end-to-end khiến ESP32 tự giảm tốc.
- Có history cấu hình 7 ngày để nhận metric cũ từ mẫu có ID/cùng gateway/timestamp trước lúc đổi cấu hình. Đây là tương thích v1; chưa có configVersion do firmware gắn vào từng mẫu để chứng minh chính xác cấu hình nguồn.
- Token chỉ có hai vai trò toàn hệ thống; chưa phân quyền theo từng công ty/máy, chưa có đăng nhập, session, audit người thao tác hoặc thu hồi riêng từng người.
- Đã benchmark nhỏ 4 máy giả lập/200 mẫu và test Nginx độc lập. Chưa chạy Compose này lên hạ tầng thật, chưa chứng minh ESP32 TLS/queue hay thiết bị công nghiệp thật.

## 6. API mới và hai profile simulator

Hợp đồng đầy đủ nằm ở `../openapi.json`; client frontend ở `../examples/frontend-client.js`.

| API | Quyền | Dùng để |
|---|---|---|
| GET /profiles | đọc | Liệt kê profile mới nhất; limit mặc định 100, tối đa 200 |
| POST /profiles/import | ghi | Lưu revision mới của profile, trả 201; không đổi máy |
| GET /profiles/:id/export?revision=1 | đọc | Tải đúng revision; bỏ revision lấy mới nhất |
| POST /config/preview | ghi | Body `{config: ...}`; kiểm tra/chuẩn hóa và trả warnings |
| GET /operations?gatewayId=... | đọc | Lịch sử thao tác đã lưu; limit mặc định 50, tối đa 200 |
| GET /operations/:id | đọc | Trạng thái hiện tại; cập nhật timeout hoặc hoàn thành ghi catalog có ACK trước đó |
| GET /system/metrics | đọc | Snapshot consumer, counters, queue, memory và độ trễ lưu DB |

Ví dụ import có sẵn ở `examples/profile-temperature.json` và `examples/profile-humidity.json`. Cần cấu hình simulator đúng địa chỉ tương ứng; chúng không phải map PLC hãng đã kiểm chứng. Export trả `{schemaVersion,id,name,revision,config}`. Khi preview/probe/apply, truyền **phần config**, không truyền nguyên profile. Revision của profile và requestId của thao tác là hai khái niệm khác nhau.

Device ID đã thuộc gateway khác sẽ trả 409; không dùng Apply để tự chuyển chủ thiết bị. Hai gateway cũng không được đồng thời giữ cùng device ID mới.

Frontend vẫn đi theo `export → preview → probe → GET operation → apply → GET operation`. Lưu operation ID để mở lại sau refresh. Probe chỉ có giá trị trong 60 giây sau hoàn tất, đúng gateway/boot và đúng config; có warning ngoài range thì cần xác nhận. `persisted:false` nghĩa là flash ESP32 chưa lưu được dù RAM đã apply.

Rate limit: mỗi socket IP trong từng process có 300 request đọc và 30 request thao tác/phút. 429 có Retry-After. Qua proxy dùng bucket chung cho IP proxy; chưa phải hạn mức từng người dùng. Một màn hình nên gom polling theo nhu cầu (ví dụ danh sách máy 2 giây/lần, health và metrics 10 giây/lần), tránh polling riêng mọi thẻ mỗi giây.

## 7. Proxy, watchdog và dọn dữ liệu

`deploy/nginx.conf` giữ Authorization; không đặt một lớp Basic Auth khác ghi đè Bearer token của backend. Mẫu proxy này phục vụ API, chưa phục vụ frontend tĩnh/HTTPS. Tùy chọn khi đã chuẩn bị `.env.compose` và mạng chung:

```bash
docker compose -f compose.yml -f compose.proxy.yml --env-file .env.compose up -d
```

API qua proxy ở `http://127.0.0.1:8080`. Huy tích hợp cấu hình này vào proxy HTTPS/domain thật; đừng chạy chồng hai backend dùng cùng consumer clientId. Watchdog cần cho backend ít nhất thời gian drain: mặc định 15 giây, Compose cho 25 giây; watchdog kill sau 7 giây sẽ làm mất cơ hội drain.

```bash
npm run db:retention                 # chỉ đếm tối đa 5000 dòng/bảng có thể xóa
npm run db:retention -- --apply      # xóa theo lô, giữ receipt chống trùng
npm run benchmark                   # database/broker tạm, 200 mẫu, 4 máy giả lập
```

Retention giữ telemetry 30 ngày theo received_at; alarm 90 ngày và chỉ xóa alarm đã được người vận hành ACK; operation terminal 30 ngày; history cấu hình 7 ngày. Không xóa registry/profile/receipt. Có thể lặp lịch job mỗi giờ ở hạ tầng; backend không tự cài cron hoặc xóa DB demo. Cần theo dõi dung lượng receipt; chưa có chính sách xóa receipt an toàn nếu firmware có thể replay vô thời hạn.

`GET /health/ready` kiểm tra version và các cột thiết yếu của schema. Nếu `checks.schema=false`, đọc schemaDetails và chạy migration đúng DB; không tắt kiểm tra để làm health xanh.
