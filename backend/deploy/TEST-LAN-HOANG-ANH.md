# Bàn giao test LAN với Hoàng Anh — 10/10/2026

Thông tin dưới đây đã kiểm tra trên máy Thịnh. Chưa phải kết quả nghiệm thu firmware/ESP32 thật. Dùng script/curl trước; chưa thêm CORS cho frontend trên máy Hoàng Anh.

## 1. Thông tin gửi Hoàng Anh

| Thông tin | Giá trị hiện tại |
|---|---|
| IP Wi-Fi máy backend | `192.168.110.214` |
| API base URL | `http://192.168.110.214:3000` |
| MQTT broker | `192.168.110.214`, TCP `1883` |
| MQTT URL | `mqtt://192.168.110.214:1883` |
| Device ID đã đăng ký | `BENCH-01` |
| Gateway ID đã gắn trong DB | `643C60A7DBCC` |
| Metric trong catalog simulator hiện tại | `temperature`, `current`, `rpm` |
| Schema | version 4, các cột thiết yếu đầy đủ |
| Quyền HTTP | read token dùng GET; write token dùng GET/POST |

IP này do Wi-Fi cấp; nếu đổi mạng/IP thì cập nhật URL. ESP32 và laptop Hoàng Anh phải tới được IP trên, không dùng `localhost` của máy Hoàng Anh.

Credential nằm ở file **`backend/.env.handoff-test` trên máy Thịnh**, quyền file 0600 và Git đã bỏ qua. File chứa MQTT username/password và hai API token. Thịnh gửi riêng file này cho Hoàng Anh để test; không đưa file/token vào Git, screenshot công khai hoặc source firmware/FE được commit. Không gửi DATABASE_URL hoặc mật khẩu PostgreSQL: firmware/script không cần truy cập trực tiếp DB.

File dùng định dạng env cho Node (`node --env-file=.env.handoff-test ...` hoặc `process.loadEnvFile`). Không dùng `source` để tự thực thi giá trị env dưới dạng shell. Trong curl, thay placeholder token bằng token tương ứng đọc từ file này.

## 2. Kết quả chuẩn bị đã xác nhận

- Bật lại đúng container `legacy-link-postgres` và `legacy-link-mosquitto` hiện có; giữ volume/cấu hình.
- Database trước migration có 95 telemetry và 2 alarm.
- Backup custom-format trước nâng cấp ở `backend/.env.test-runtime/backups/`.
- Đã restore bản backup vào DB tạm, so số dòng khớp 95/2, rồi xóa riêng DB tạm.
- Chạy `npm run db:migrate` thành công: version 4.
- Sau migration vẫn 95 telemetry, 2 alarm; không seed thêm và không đổi gateway vì BENCH-01 đã đúng mapping.
- API và consumer đã bật bằng `scripts/lan-test-services.mjs`.
- Gọi API qua IP LAN **từ chính máy backend**: ready 200, GET bằng read token 200, thiếu token 401, POST bằng read token 403.
- MQTT qua IP LAN đăng nhập và subscribe ACK thành công; không publish số đo giả vào DB demo.
- Firewall zone Wi-Fi hiện cho phép dải TCP 1025–65535, bao gồm 1883 và 3000; chưa sửa firewall.
- Chưa thấy gateway `643C60A7DBCC` online qua `/gateways` ở thời điểm preflight.

Gọi được IP LAN từ máy backend chưa chứng minh máy Hoàng Anh/ESP32 đi qua Wi-Fi được. Cần bước curl từ máy Hoàng Anh và kết nối ESP32 thật bên dưới. Wi-Fi có thể bật client isolation dù cùng SSID.

## 3. Hoàng Anh kiểm tra kết nối trước

Từ máy Hoàng Anh:

```bash
curl --connect-timeout 5 http://192.168.110.214:3000/health/live
curl --connect-timeout 5 http://192.168.110.214:3000/health/ready
```

Mong đợi HTTP 200 và ready=true. Có thể thêm `-i` để xem mã HTTP. Health không cần token. Nếu timeout, kiểm tra IP/mạng/AP isolation; nếu ready 503, đọc checks để tìm DB/consumer/MQTT nào chưa sẵn sàng.

GET máy và catalog, thay `<API_READ_TOKEN>` bằng read token trong file riêng:

```bash
curl -i -H 'Authorization: Bearer <API_READ_TOKEN>' http://192.168.110.214:3000/machines
curl -i -H 'Authorization: Bearer <API_READ_TOKEN>' 'http://192.168.110.214:3000/catalog?deviceId=BENCH-01'
curl -i -H 'Authorization: Bearer <API_READ_TOKEN>' http://192.168.110.214:3000/gateways
```

Script/curl và MQTT không chịu cơ chế CORS của trình duyệt. Cần token đúng cho API và MQTT username/password đúng cho broker. Không dùng API token làm mật khẩu MQTT.

## 4. Các topic firmware cần dùng

```text
Gửi số đo:       legacy-link/devices/BENCH-01/telemetry
Gửi cảnh báo:    legacy-link/devices/BENCH-01/alarm
Trạng thái máy:  legacy-link/devices/BENCH-01/status
Diagnostics:    legacy-link/devices/BENCH-01/diagnostics
Gateway state:  legacy-link/gateways/643C60A7DBCC/state
Nhận ACK lưu:   legacy-link/gateways/643C60A7DBCC/ingestion/ack
```

Telemetry dùng schemaVersion=1, deviceId=BENCH-01, gatewayId=643C60A7DBCC, messageId ổn định và timestamp epoch milliseconds. Timestamp dùng giờ hiện tại của thiết bị đã đồng bộ, không lấy số timestamp cố định từ tài liệu. ID/nội dung không đổi khi retry. Các metric cần thuộc cấu hình đang dùng hoặc replay history hợp lệ.

Chỉ ACK `status=committed` khớp device/kind/messageId mới cho phép xóa mẫu khỏi queue. `rejected` cần báo lỗi/cách ly phù hợp; không coi là đã lưu.

## 5. Thịnh bật/dừng Node theo từng bước test

Chạy từ thư mục backend:

```bash
cd /home/nguyenvuducthinh/Legacy-link/backend
node scripts/lan-test-services.mjs status
node scripts/lan-test-services.mjs stop consumer
node scripts/lan-test-services.mjs start consumer
node scripts/lan-test-services.mjs restart api
```

Có thể dùng `start api`, `stop api`, `restart consumer`, `start all`, `stop all`. Script chỉ quản lý hai process Node do chính nó tạo, xác minh PID/entrypoint trước khi gửi SIGTERM; không dùng pkill Node. `all` không dừng broker hoặc PostgreSQL.

**Không chạy thêm `npm start`/`npm run start:http` trong lúc hai process này đang chạy**: consumer trùng clientId có thể đá kết nối nhau, API trùng port sẽ lỗi. Muốn quay lại chạy bằng hai terminal thì chạy `stop all` trước.

Log/PID ở thư mục Git bỏ qua:

```bash
tail -f .env.test-runtime/consumer.log
tail -f .env.test-runtime/api.log
```

Node chạy trên máy Thịnh, không nằm trong container backend của stack infra. Đây là môi trường test LAN trực tiếp, chưa phải nghiệm thu proxy/watchdog chính của Huy. Sau reboot máy cần bật lại hai process.

## 6. Huy/Thịnh bật/dừng broker và database

Không cần Docker Compose để điều khiển hai container hiện có:

```bash
docker stop legacy-link-mosquitto
docker start legacy-link-mosquitto
docker stop legacy-link-postgres
docker start legacy-link-postgres
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
```

Đây là lệnh gây outage khi đến đúng bước test; chưa tự chạy stop/kill sau khi chuẩn bị xong. Chờ API ready phục hồi và có ACK mới sau mỗi bước. Không dùng `docker rm`, xóa `pgdata` hoặc `down -v` để thử mất kết nối. Máy hiện chưa có lệnh `docker compose`; vẫn điều khiển được các container hiện có bằng Docker CLI.

## 7. Thứ tự chạy test và bằng chứng cần ghi

| Bước | Thao tác | Bằng chứng thành công |
|---|---|---|
| Baseline | ESP32 gửi số đo và một alarm có ID | Backend lưu; ACK đúng ID; firmware bỏ mẫu đã ACK |
| Consumer outage | Thịnh stop consumer, Hoàng Anh tiếp tục tạo mẫu, rồi bật lại | Queue firmware tăng rồi giảm; dữ liệu thiếu ACK được replay; một ID không có hai dòng |
| Database outage | Thịnh dừng DB trong lúc firmware gửi, rồi bật lại | Không committed khi chưa lưu; retry sau phục hồi được lưu một lần |
| Broker outage | Thịnh dừng broker rồi bật lại | ESP32/backend reconnect, subscribe và nhận ACK mới; ready phục hồi |
| Mất ACK sau COMMIT | Hoàng Anh chuẩn bị cơ chế test bỏ qua/chặn ACK của một ID, giữ mẫu rồi retry | Lần đầu DB đã lưu; lần retry không tạo dòng thứ hai; firmware cuối cùng nhận ACK và bỏ mẫu |
| Đổi profile còn backlog | Giữ mẫu profile A trong queue, apply profile B rồi gửi bù | Mẫu cũ phù hợp history được nhận; mẫu mới được nhận; queue không kẹt |
| API restart | Restart api giữa probe/apply, giữ operation ID | Tra cứu lại được lịch sử; không báo applied thiếu bằng chứng; khóa không treo vĩnh viễn |

Stop consumer không thay thế test mất ACK **sau khi** COMMIT. Phải có bằng chứng mẫu đã lưu rồi ACK không được firmware xử lý. Cơ chế bỏ qua/chặn ACK cần phối hợp ở firmware/mạng, không tự sửa ACK production chỉ để làm test này.

Chỉ chạy đổi profile trên map simulator thực sự được cấu hình. Profile humidity ví dụ address 4 cần simulator có register đó; không đoán register của máy thật. Các thao tác ngoài GET dùng write token.

Thịnh đối chiếu ID trong API history hoặc truy vấn DB tại máy backend; Hoàng Anh không cần tài khoản PostgreSQL. Ghi ID, timestamp, số mẫu tạo/ACK/retry/drop, số dòng mới trong DB và trạng thái queue. Đếm thêm từ baseline 95/2 thay vì coi tổng mọi dòng là số mẫu của buổi test.

## 8. Snapshot và backup ở đâu?

- `backend/.env.test-runtime/preflight.json`: kết quả kiểm tra không chứa token.
- `backend/.env.test-runtime/backup-status.json`: vị trí backup và kết quả restore.
- `backend/.env.test-runtime/services.json`: PID/log của API và consumer.
- `backend/.env.test-runtime/backups/`: bản backup trước migration, quyền riêng tư.
- `backend/.env.handoff-test`: thông tin kết nối và credential để chia sẻ riêng với Hoàng Anh.

Backup hiện nằm trên máy Thịnh để bảo vệ bước migration. Đây chưa phải bản backup ở máy khác chống mất toàn bộ ổ đĩa; Huy cần bổ sung lịch backup/restore theo quy trình hạ tầng.
