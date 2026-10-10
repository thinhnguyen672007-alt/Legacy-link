# Chạy Legacy Link trên máy local

Thư mục: thư mục gốc đã clone, dưới đây ký hiệu `/path/to/Legacy-link`. Thay bằng
đường dẫn thật của bạn. Trạng thái code đúng nhất nằm ở `main` sau khi `git pull`.

## Hiểu trước khi chạy

Có bốn thành phần: MQTT broker (trạm chuyển bản tin), PostgreSQL (sổ lưu dữ liệu), consumer (nhận MQTT và ghi sổ) và HTTP API (frontend gọi để xem/gửi lệnh).

```text
ESP32 → MQTT → consumer → PostgreSQL
Frontend → HTTP API → đọc PostgreSQL / gửi lệnh MQTT tới ESP32
```

Consumer và HTTP là **hai chương trình**, cần hai terminal riêng. Chỉ chạy HTTP thì vẫn có thể xem lịch sử, nhưng chưa có consumer lưu số đo mới và /health/ready sẽ báo chưa sẵn sàng.

## 1. Kiểm tra hạ tầng

```bash
cd /path/to/Legacy-link
docker ps
```

Máy hiện có hai container `legacy-link-postgres` (5432) và `legacy-link-mosquitto` (1883). Nếu đã tồn tại nhưng đang dừng, bật lại:

```bash
docker start legacy-link-postgres legacy-link-mosquitto
```

Nếu là máy mới chưa có container, dùng Compose của Huy để tạo:

```bash
docker compose -f infrastructure/docker-compose.yml --profile broker up -d
```

Chọn profile broker khi chạy backend bằng terminal. Nếu trước đó đã chạy profile full, dừng riêng consumer Docker để không có hai consumer cùng MQTT_CLIENT_ID:

```bash
docker compose -f infrastructure/docker-compose.yml --profile full stop backend-consumer
```

Nếu consumer/HTTP đang chạy trong terminal, Ctrl+C ở các terminal đó trước khi migration rồi chạy lại sau. Nếu consumer nằm trên máy khác, phối hợp dừng nó trước khi nâng cấp database dùng chung.

## 2. Cập nhật cấu trúc database — chỉ cần khi nâng cấp hoặc chạy lần đầu

Migration là file SQL bổ sung bảng/cột cần thiết cho code mới. Nó không xóa số đo/cảnh báo đã có. Bật PostgreSQL trước rồi chạy từ thư mục gốc repo:

```bash
docker exec -i legacy-link-postgres psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link < backend/db/migrate-c7-c8-c9.sql
docker exec -i legacy-link-postgres psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link < backend/db/migrate-c10.sql
docker exec -i legacy-link-postgres psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link < backend/db/migrate-c16.sql
```

Ba lệnh trên dành cho database đã có schema cũ, đúng tình trạng local lúc kiểm tra.
Cách gọn hơn là chạy một lệnh trong `backend/` (tự nhận DB rỗng hay đã có và kiểm tra
version): `npm run db:migrate`; kết quả mong đợi `Migration thành công, version=4`.
Nếu database hoàn toàn mới, chạy file schema đầy đủ thay cho ba migration:

```bash
docker exec -i legacy-link-postgres psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link < backend/db/schema.sql
```

Không dùng `docker compose down -v` để thử khắc phục lỗi: `-v` xóa volume có dữ liệu. Chạy lại migration có thể hiện NOTICE “đã tồn tại”; đó là bình thường.

## 3. Cấu hình và cài thư viện

Máy hiện đã có `backend/.env`; giữ file đó. Chỉ tạo từ mẫu nếu chưa có:

```bash
cd /path/to/Legacy-link/backend
# Chỉ chạy nếu chưa có .env:
# cp .env.example .env
npm ci
```

`.env` phải có MQTT_URL, MQTT_USERNAME, MQTT_PASSWORD, MQTT_CLIENT_ID, MQTT_QOS, DATABASE_URL. Với backend chạy trên máy này, địa chỉ broker và database là localhost; khi chạy trong Docker chúng phải là tên service (mosquitto, postgres). Tài khoản/mật khẩu phải khớp hạ tầng Huy cấu hình. Không commit `.env`.

Cần thêm hai token, mỗi token một giá trị ngẫu nhiên khác nhau:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```dotenv
API_READ_TOKEN=<token-thu-nhat>
API_WRITE_TOKEN=<token-thu-hai>
CORS_ORIGINS=http://localhost:5173
```

HTTP mặc định là 0.0.0.0:3000. Xác thực bật sẵn; `API_AUTH_DISABLED=true` chỉ dùng được khi `HTTP_HOST=127.0.0.1` và `NODE_ENV` không phải `production`.

## 4. Chạy hai terminal

Terminal 1 — nhận dữ liệu MQTT, giữ terminal mở:

```bash
cd /path/to/Legacy-link/backend
npm start
```

Đợi log kết nối MQTT và subscribe thành công. Nếu MQTT lỗi xác thực, đối chiếu username/password với Huy. Nếu database báo thiếu bảng, kiểm tra lại bước migration.

Terminal 2 — mở HTTP API, cũng giữ terminal mở:

```bash
cd /path/to/Legacy-link/backend
npm run start:http
```

Log `[HTTP] Listening port=3000` nghĩa là HTTP đã mở cổng. Lỗi EADDRINUSE nghĩa là chương trình khác đã dùng cổng 3000: Ctrl+C chương trình cũ nếu đó là API của bạn, hoặc chọn HTTP_PORT khác rồi sửa base URL frontend tương ứng.

## 5. Kiểm tra bằng trình duyệt hoặc terminal thứ ba

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
# Endpoint dữ liệu cần Bearer token
curl -H "Authorization: Bearer $API_READ_TOKEN" http://localhost:3000/machines
# Token đọc gọi POST sẽ bị từ chối 403; cần API_WRITE_TOKEN
```

Lấy token từ `.env` của backend, đừng ghi thẳng giá trị vào tài liệu hoặc lịch sử shell.

Có thể mở các URL này trong trình duyệt. /health/live trả `{ "status": "alive" }`. Sau khoảng 5–10 giây /health/ready nên có `ready:true`; consumer cập nhật tín hiệu định kỳ nên có thể chưa ready ngay lúc khởi động.

Nếu ready=false, xem `checks`: database là kết nối DB, consumer là chương trình nhận số đo, mqttPublisher/mqttControl là hai kết nối MQTT của HTTP. false chỉ ra thành phần cần kiểm tra. Chưa có ESP32 online không làm backend tự bị not-ready.

`/machines` trả [] khi chưa đăng ký máy; không có nghĩa API hỏng. Ưu tiên đăng ký qua luồng probe/apply. Để dùng fixture BENCH-01 cho demo OpenModSim, đọc gateway ID thật trên Serial rồi chạy từ thư mục gốc repo (ví dụ bên dưới dùng gateway ID 643C60A7DBCC trong bản handoff):

```bash
docker exec -i legacy-link-postgres psql -v ON_ERROR_STOP=1 -U legacy_admin -d legacy_link -v gateway_id=643C60A7DBCC < backend/db/seed-bench.sql
```

Thay ID ví dụ bằng ID ESP32 bạn đang dùng. Seed chỉ đăng ký máy và catalog, không tự áp dụng cấu hình xuống ESP32. Register 1/2/3 trong fixture phải được kiểm tra bằng probe trước khi demo.

Frontend trên cùng máy đặt API base URL là `http://localhost:3000`. Frontend/ESP32 ở máy khác dùng IP LAN của máy chạy backend và bảo đảm kết nối mạng tới đúng cổng. Bản API phân hai vai trò bằng Bearer token đọc và ghi; đây là cơ chế demo, chưa phải hệ thống tài khoản cá nhân.

## Đọc code có chú thích tiếng Việt

- `backend/src/http/handler.js`: frontend gửi request, kiểm tra đầu vào, chọn endpoint và trả JSON.
- `backend/src/http/server.js`: khởi động HTTP, kết nối các hàm và kiểm tra sức khỏe hệ thống.
- `backend/src/db/dashboard.js`: lấy dữ liệu cho biểu đồ và bảng cảnh báo.
- `backend/src/ingestion/handler.js`: nhận số đo, lưu xong mới trả ACK.
- `backend/src/db/ingestion.js`: registry + chống trùng + transaction (lưu cùng nhau hoặc hủy cùng nhau).
- `backend/src/ingestion/identity.js`: ID và dấu vân tay nội dung để phát hiện bản trùng/bản bị thay đổi.
- `backend/examples/frontend-client.js`: các hàm frontend gọi API.

Tên hàm, trường JSON và mã lỗi giữ nguyên để các thành viên nối code đúng contract. JSON/OpenAPI không cho phép comment; phần giải thích được đặt trong description và tài liệu. Các file JS/SQL mình viết đã thêm chú thích tiếng Việt ở mục đích file và các bước quan trọng.

Xem `docs/backend-api-c10.md` để biết endpoint, phân trang và probe/apply; xem `docs/backend-c7-c8-c9.md` để nối hàng đợi/ACK của firmware. C7 phục hồi dữ liệu trên ESP32 thật vẫn cần Hoàng Anh làm phần hàng đợi.
