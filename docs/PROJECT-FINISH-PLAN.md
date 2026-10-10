# Legacy-link — kế hoạch hoàn tất bản nộp hackathon

## 0. Mục tiêu và trạng thái bàn giao

Đây là kế hoạch gốc lập tại `main` `8364b1e` (PR #71); xem [trạng thái hiện tại](PROJECT-FINISH-STATUS.md) để biết chặng nào đã thực hiện. Trước đó #69 thêm tài khoản và #70 thêm AI Copilot. Trước mỗi chặng, kiểm tra Git vì đội vẫn cập nhật repo.

Người dùng mới lập trình; trả lời tiếng Việt. Ponytail ultra + ADHD: ít thay đổi nhưng giải quyết đủ bài toán, báo trạng thái ngắn và bước tiếp theo cụ thể. Không hỏi lại quyết định đã chốt.

Đã chốt:

1. Máy 1 chạy Modbus simulator và nối ESP32 bằng phần cứng hiện có.
2. Máy 2 Linux chạy toàn bộ server bằng Docker; cả hai máy và ESP32 dùng hotspot 4G iPhone.
3. Frontend chạy trên Linux và mở bằng browser hoặc app Windows. Có máy Windows thật, có thể dùng thêm Windows VM trên Linux.
4. Repo chung; Docker trước, kiểm thử hệ thống thật, rồi Electron và bộ cài `.exe`.
5. Mục tiêu là bản nộp hackathon có thể dựng lại và có bằng chứng; không đồng nghĩa sản phẩm công nghiệp thương mại hoàn chỉnh.

### Định nghĩa hoàn tất

- Sau chuẩn bị cấu hình một lần, Linux chạy đủ broker, DB, consumer, API và frontend bằng `docker compose up -d --build --wait` trong `infrastructure/`.
- Số đo Modbus qua ESP32 thật xuất hiện trên UI; lịch sử, cảnh báo, phân quyền và commissioning hoạt động đúng.
- Installer `.exe` cài được trên Windows; app ở khay vẫn nhận alarm mới, bấm thông báo mở đúng trang.
- Khởi động lại giữ dữ liệu/tài khoản; lỗi mạng/hết phiên được báo trung thực; không âm thầm thay dữ liệu thật bằng fixture.
- Có commit/image/app version chốt, hướng dẫn, checklist, bằng chứng kiểm thử và artifact nộp bài. Windows/phần cứng chưa thử thì chưa được ghi toàn dự án hoàn tất.

### Ngân sách dự kiến

| Chặng | Thời gian dự kiến | Điều kiện đầu ra |
| --- | --- | --- |
| A. Docker và bootstrap | 90–150 phút | Cold start + restart giữ dữ liệu + browser login đạt |
| B. Hai máy qua hotspot | 45–90 phút | Số đo/cảnh báo thật hiển thị trên web |
| C. App Windows | 120–180 phút | Installer đã cài và thông báo thật trên Windows |
| D. Diễn tập/bàn giao | 45–90 phút | Bản chốt, hướng dẫn, báo cáo và artifact |

Toàn bộ khoảng **6–9 giờ làm việc**, có thể kéo dài nếu gặp lỗi mạng/phần cứng/build Windows. Mốc 3 giờ trước đây chỉ nên dành cho chặng desktop khi web/backend đã ổn. Khi hết thời gian, báo rõ chặng còn thiếu; không cắt nghiệm thu để đổi thành trạng thái hoàn tất.

## 1. Kiến trúc

```text
Máy 1: Modbus simulator -- adapter/wiring đã kiểm chứng --> ESP32
                                                            |
                                                    Wi-Fi / MQTT :1883
                                                            |
Máy 2 Linux: Mosquitto --> consumer --> PostgreSQL --> HTTP API
                  ^                                      |
                  +-------- lệnh cấu hình ---------------+
                                                         |
                                               Frontend Nginx :8080
                                               /      : React web
                                               /api/* : proxy API
                                                         |
                                            Browser / Electron Windows
```

Electron tải frontend từ máy Linux. UI web và app dùng chung mã, không đóng gói thêm một bản React vào installer. Browser Linux vẫn là cách demo hệ thống khi app Windows có lỗi.

| Thành phần | Cách vận hành |
| --- | --- |
| MQTT | Container, publish 1883 cho ESP32 |
| PostgreSQL | Container + volume bền, không mở DB ra LAN |
| Consumer/API | Giữ hai process/container, dùng hostname `mosquitto`/`postgres` nội bộ |
| Frontend | Dockerfile hiện có; cổng 8080; API cùng origin qua `/api` |
| Windows | Electron + electron-builder NSIS, nhập URL `http://<IP-Linux>:8080` |

Giữ API gateway cổng 3000 loopback cho script cũ; frontend proxy trực tiếp backend-api. Chưa cần hợp nhất hai proxy. Domain không cần cho bài demo. HTTP/MQTT plaintext chỉ thuộc phạm vi hotspot demo riêng, không ghi nhận là cấu hình triển khai công nghiệp an toàn.

Không thêm auto-update, auto-start Windows, lưu mật khẩu, tự dò server/mDNS, cloud, Kubernetes, dashboard mới, auth mới hay AI local. Chỉ sửa firmware nếu có lỗi cần thiết để hoàn thành bài demo.

## 2. Repo hiện có và các khoảng trống

| Khu vực | Đã có | Còn thiếu |
| --- | --- | --- |
| Compose | Broker, DB, consumer, API, gateway | Frontend service; chuỗi init cho máy mới |
| Broker | `init-mosquitto.sh` sửa quyền | Vẫn yêu cầu passwd có sẵn từ script host |
| DB | `backend/scripts/migrate.mjs`, advisory lock | Tích hợp vào startup, chờ init trước khi chạy app |
| Admin | `createAccounts().bootstrap()` và create-admin CLI | Bootstrap chạy lại an toàn; CLI hiện báo lỗi nếu đã có tài khoản |
| Frontend | React/Vite, Dockerfile, Nginx `/api`, BrowserRouter | CORS/POST thật qua LAN, tích hợp desktop bridge |
| Auth | Viewer/Technician/Admin, phiên 8 giờ, thu hồi khi đổi mật khẩu/logout | Desktop phải theo phiên này, bỏ kế hoạch nhập API token thủ công |
| Copilot | Trong backend, Gemini + rules/quick-action fallback | Nghiệm thu có/không có key và Internet |
| Desktop | Chưa có | Electron, tray, background alarm, installer, test Windows |
| Firmware | Có báo cáo ESP32 thật | Nghiệm thu chuỗi mới có UI/desktop và hotspot |

Báo cáo `frontend/docs/ACCEPTANCE.md` có phần trước auth accounts, không dùng nguyên trạng làm nghiệm thu mới. Báo cáo firmware mới hơn tại `firmware/legacy-link-core/docs/physical-acceptance-2026-10-10.md` đã bổ sung queue/recovery/profile/power-cycle. Giữ lịch sử, viết báo cáo mới cho bản chốt.

## 3. Git và cách model tiếp theo làm việc

1. Kiểm tra `git status`, fetch, đọc diff commit mới. Giữ file local và tài liệu chưa commit. Không hard reset hoặc xóa volume để vượt lỗi.
2. Tạo `feature/demo-compose` từ main cập nhật. Hoàn tất A/B, commit theo đầu việc đã kiểm tra; có thể tạo draft PR khi GitHub dùng được, không tự merge.
3. Tạo `feature/windows-app` từ commit Docker đã kiểm tra nếu PR chưa merge; ghi rõ phụ thuộc. Đồng bộ lại main có kiểm soát khi Docker được merge.
4. Sau mỗi chặng cập nhật `docs/PROJECT-FINISH-STATUS.md`: commit, kiểm tra đã chạy, bằng chứng, blocker, bước tiếp theo. Đọc lại file này khi đổi model.
5. Test trên project/cổng/volume riêng. Không stop, migrate hay flash bench đang được đội dùng để làm test tự động. Cần thao tác phần cứng thì phối hợp người vận hành khi tới chặng đó.

## 4. Chặng A — Docker một lệnh

### A1. Chuẩn bị môi trường và cấu hình

- Kiểm tra containers/project, cổng đang dùng và Node process chạy tay; không in credential/env ra log. Tránh hai consumer cùng MQTT client ID và tránh nhầm stack lab với stack mới.
- Mở rộng `infrastructure/scripts/prepare-env.mjs` và `.env.example`: giữ bí mật cũ; thêm cổng/bind frontend, origin web demo, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. Sinh mật khẩu/token mới bằng random an toàn, `.env` mode 0600, không log giá trị.
- Giữ `COMPOSE_PROFILES=full` trong `.env` để người dùng không cần nhớ `--profile`. Giữ ý nghĩa profile broker/maintenance hiện có.
- Người vận hành chỉ cần Docker: ghi cách chạy script chuẩn bị env qua image Node trong container, không bắt cài Node trên host. Đừng chown cả repo khi container tạo file. Mật khẩu admin được xem/cấp riêng, không in vào báo cáo công khai.
- Chọn IP Wi-Fi thật từ danh sách, không đoán docker0/VPN/VM. `GEMINI_API_KEY` chỉ vào backend-api và là tùy chọn. Giữ model đã được đội thử; không tự chọn model mới.

**Một lần chuẩn bị** vẫn cần thiết: repo không thể tự biết mật khẩu Wi-Fi, địa chỉ máy chủ và tài khoản mong muốn. Những lần bật demo sau dùng một lệnh Compose. Không đưa credentials mặc định công khai để giả đạt zero-setup.

### A2. Chuỗi khởi động

```text
mosquitto-init -> mosquitto healthy -------------------+
                                                     +-> consumer
postgres healthy -> backend-init completed ----------+-> API -> frontend
```

1. `mosquitto-init`: tạo passwd từ env khi chưa có, đúng owner/mode, ghi nguyên tử. Chạy lại giữ user khác và dữ liệu. Không silently rotate credential hay xóa user. Sai env/passwd phải lộ qua kiểm tra broker. Nếu giữ bind mount Linux, dùng mount thư mục phù hợp để tránh broker đòi bind một file chưa được init tạo.
2. `backend-init`: dùng image backend, chờ PostgreSQL healthy, chạy script migration sẵn có, rồi ensure admin. Cấp cả env MQTT mà module config hiện yêu cầu. Consumer/API phụ thuộc `service_completed_successfully`; init exit 0 là bình thường.
3. Ensure admin: reuse hash/transaction/lock hiện có. Tạo nếu chưa có tài khoản; chạy lại không đổi username/hash/quyền. Giữ hợp đồng CLI bootstrap cũ bằng script/mode riêng nhỏ. Không nuốt mọi lỗi 409 hoặc lỗi SQL thành thành công.
4. Thêm frontend service từ `frontend/Dockerfile`, `API_UPSTREAM=backend-api:3000`, publish mặc định 8080, chờ API healthy. Kiểm tra trang tĩnh bằng `/health`, toàn chuỗi qua `/api/health/ready`.
5. Giữ storage DB/MQTT qua restart/down-up. Nếu thay bind/volume, phải có backup/restore rõ, không lặng lẽ tạo DB rỗng. Không bật retention xóa dữ liệu mặc định chỉ để demo.

**Nâng cấp khác khởi động lại:** init phù hợp cold start và chạy lại bản đã chốt. Nâng schema trên deployment đang chạy vẫn cần backup/dừng worker/migrate như quy trình hiện có. Migration lock không ngăn API cũ ghi. Không quảng cáo `compose up` mọi commit mới là nâng cấp an toàn.

### A3. CORS/proxy

- Frontend dùng `/api` cùng origin, Nginx giữ Authorization. POST cùng origin vẫn có thể mang header Origin và backend hiện kiểm allowlist; proxy không tự làm vấn đề này biến mất.
- `.env` phải có đúng `CORS_ORIGINS`: localhost/127.0.0.1 với cổng web, IP Wi-Fi Linux với cổng web, và origin VM nếu dùng địa chỉ khác. Giữ origin hợp lệ cũ, không wildcard hoặc tắt auth.
- IP đổi: helper/hướng dẫn cập nhật CORS và recreate API, app đổi URL; không rotate MQTT password hay rebuild UI vì IP. Firmware broker host hiện vẫn cần cập nhật riêng.
- Bắt buộc thử browser `POST /api/auth/login` và POST được cấp quyền qua URL LAN. Health GET thành công chưa đủ.
- Giữ timeout Nginx 30s phục vụ Copilot; đối chiếu ngân sách client/backend khi sửa, không cắt ngắn request đang hợp lệ.

### A4. File liên quan

| File | Thay đổi dự kiến |
| --- | --- |
| `infrastructure/docker-compose.yml`, `.env.example` | Init/frontend/env/dependency/ports |
| `scripts/prepare-env.mjs`, `init-mosquitto.sh`, `setup.sh` | Chuẩn bị mới, tương thích setup/nâng cấp cũ |
| `backend/scripts/`, `src/auth/accounts.js`, `Dockerfile` | Ensure admin nhỏ; copy script vào image |
| `infrastructure/scripts/test-stack.mjs` | Copy thêm `frontend/`, port/admin riêng; test direct Compose cold start |
| `.github/workflows/{infra,stack,frontend}.yml`, README/runbook | CI triggers và hướng dẫn khớp đường deploy mới |

Test-stack hiện chỉ copy backend/infrastructure và gọi `setup.sh`; nếu chỉ thêm frontend service mà không sửa harness, bài test sẽ hỏng hoặc không chứng minh một lệnh `up` chạy được.

### A5. Gate hoàn tất

1. Compose config hợp lệ; từ volume test rỗng chạy lệnh đích lên đủ. Init exit 0, service chạy dài healthy.
2. Browser qua web proxy đăng nhập admin, tạo Viewer/Technician, đổi mật khẩu bắt buộc, kiểm tra quyền; sai token/Origin vẫn bị từ chối.
3. Tạo dữ liệu test và đổi mật khẩu admin; down không `-v`, up lại: lịch sử, ID và mật khẩu mới còn nguyên. Init lại không reset account.
4. Thiếu/sai config báo lỗi dễ hiểu; không key Gemini vẫn chạy. Test auth/accounts khi sửa bootstrap, watchdog tests và stack acceptance/outage/backup hiện có khi thay startup.
5. Test dùng project/thư mục/cổng/bí mật riêng; chỉ xóa tài nguyên test đó. Lưu kết quả thật, không coi workflow đã được viết là CI đã pass.

**Chưa qua cold start, giữ dữ liệu và browser login thì chưa chuyển Electron.**

## 5. Chặng B — hai máy qua iPhone và dữ liệu thật

### B1. Mạng

- Bật hotspot, Maximize Compatibility nếu iPhone hỗ trợ; giữ tên/mật khẩu, nguồn điện ổn định. ESP32 cần mạng 2.4 GHz.
- Lấy IP Linux thật mỗi lần đổi/bật lại hotspot. Không giả định IP cố định hoặc luôn có cùng dải. Từ máy 1 mở web Linux; từ ESP32 xác minh MQTT connect. Cùng SSID chưa chứng minh thiết bị liên lạc được.
- Firewall chỉ cần cho phép TCP 1883 và web 8080 trên mạng demo. DB không cần mở LAN. Windows VM NAT dùng địa chỉ host thực sự truy cập được; không bắt buộc bridge Wi-Fi.
- Nếu hotspot chặn thiết bị giao tiếp, xác nhận bằng test rồi báo người dùng; phương án dự phòng là router riêng của đội. Không tiếp tục chỉnh Docker để chữa giới hạn mạng.
- ESP32 cần NTP sau boot mới gửi phép đo hợp lệ. Thử public NTP qua 4G hoặc NTP LAN đã xác minh. Không hứa cold boot hoàn toàn offline vẫn gửi telemetry.

### B2. Firmware/bench

- Dùng adapter/wiring đã kiểm chứng, không coi UART TTL là đã nghiệm thu RS-485/CNC. Xác định COM/serial, baud/parity, slave ID và register map thật.
- Wi-Fi/broker IP/port/credential nằm trong ignored `local_settings.h`, khớp `.env` MQTT Linux. Thay các giá trị này hiện cần build/upload firmware; đừng hứa sửa app là ESP32 tự tìm lại broker.
- Sao lưu NVS/cấu hình trước flash khi thiết bị đã có cấu hình. Đọc gateway ID từ Serial/trạng thái thực tế, không lấy board ID cũ trong báo cáo làm mặc định.
- Đăng ký máy bằng commissioning sẵn có hoặc `seed-bench.sql` có gateway ID thật. Không seed máy giả mặc định vào màn hình dữ liệu thật. Catalog/device/profile phải khớp firmware.
- Mốc đối chiếu có sẵn: slave 1, 9600/8N1, FC03 protocol addresses 1/2/3; raw 250/144/1272 -> khoảng 25°C/1.44A/1272rpm. Xác minh profile đang dùng trước khi áp dụng.

### B3. Gate nghiệm thu thật

1. Browser Linux đăng nhập, đổi giá trị simulator và thấy số đo/thời gian mới qua ESP32/MQTT/DB/UI. Phân biệt online gateway với dữ liệu mới.
2. Tạo high/critical theo ngưỡng profile đã xác nhận, giữ giá trị kiểm tra không spam, giảm rồi tăng để rearm; lịch sử và ACK đúng quyền.
3. Technician preview -> probe -> apply trên bench; kiểm tra `applied`/`persisted` riêng. Chỉ ghi `restoredAfterRestart` sau thử restart thực sự được phối hợp. Khôi phục profile A cho demo.
4. Copilot quick actions đọc dữ liệu thật, Viewer dùng được. Thử Gemini khi có key/4G và rules khi thiếu key/model lỗi; UI thể hiện đúng chế độ.
5. Khi bench sẵn sàng, thử outage ngắn khoảng 10s, stale/reconnect/queue drain. Queue RAM hữu hạn, không kéo outage để rồi hứa không mất dữ liệu. Không lặp tất cả firmware tests cũ nếu không có thay đổi/rủi ro mới.

Lưu screenshot/log đã che bí mật, commit/profile/gateway/device và kết quả trong báo cáo mới. Chưa có phần cứng thì hoàn thành kiểm thử độc lập nhưng giữ gate B là đang chờ.

## 6. Chặng C — app Windows

### C1. Workflow

1. Cài `Legacy-Link-Setup-<version>.exe`; mở form Địa chỉ máy chủ. Nhập URL web đầy đủ, lưu URL. Nếu server không lên: hiển thị lỗi, Thử lại và Đổi địa chỉ.
2. Đăng nhập bằng web hiện có, giữ Viewer/Technician/Admin. Phiên 8 giờ; không lưu mật khẩu/token trên đĩa. Tài khoản bắt buộc đổi mật khẩu đi qua luồng hiện có trước khi bắt đầu alarm polling.
3. X thu xuống tray, giải thích một lần. Menu: Mở dashboard, Thử thông báo, Đổi máy chủ, Thoát. Mở lần hai đưa cửa sổ đang chạy lên.
4. Alarm mới tạo Windows notification; click mở đúng máy, không tự ACK. Logout/hết phiên dừng theo dõi; Quit thoát thật; mở lại đăng nhập lại.
5. Có trạng thái Đang theo dõi/Mất kết nối/Cần đăng nhập. Khi server offline vẫn mở được màn hình cấu hình app local.

### C2. Tổ chức tối thiểu

```text
desktop/
  package.json + package-lock.json
  main.cjs               window/tray/IPC/config URL
  preload.cjs            bridge hẹp
  alarms.cjs             poll/chọn alarm mới, test không cần GUI
  setup.html + setup.js  nhập URL và lỗi kết nối
  assets/                icon app/tray
  test/ + README.md
```

Không bắt buộc số lượng file nếu cách gộp nhỏ rõ hơn. Chỉ thêm Electron/electron-builder và dependency thật sự cần, không thêm framework UI.

- `frontend/src/session.tsx`: connect/disconnect/401 đồng bộ tới bridge tùy chọn `window.legacyDesktop`; browser không có bridge vẫn chạy.
- `App.tsx` hoặc component nhỏ: nhận event mở alarm và dùng router navigation; không reload/loadURL cả web để chuyển route vì sẽ mất phiên React.
- `pages/Alarms.tsx` đang lấy search param vào useState lần đầu: sửa để notification máy khác cập nhật filter ngay cả khi đang ở route alarms. Test tình huống này.
- Typed bridge nhỏ, listener có cleanup, không rò qua StrictMode/reconnect. Main nhận token phiên trong memory; không cần nhận write token riêng do user role đã ở backend.
- Frontend container phải build/deploy integration mới. Installer chỉ chứa Electron shell/setup/assets; **không bắt build/nhét React vào installer** khi đã chọn hosted frontend.

### C3. Biên an toàn

- Tắt Node integration, bật context isolation/sandbox, không tắt webSecurity. Chặn popup/điều hướng origin lạ, từ chối permission không dùng.
- URL chỉ HTTP/HTTPS hợp lệ, không credential/query/hash. Cấu hình server chỉ sửa từ trang setup local, không cho web tùy ý ghi cấu hình máy chủ.
- IPC kiểm tra đúng window/main frame/origin đã chọn; so URL đã parse, không `startsWith` host. Validate token và dữ liệu ở ranh giới.
- Main tự xác định `/api` từ origin server, không nhận URL fetch tùy ý từ renderer; không gửi token theo redirect sang host khác. Validate JSON alarm và giới hạn payload.
- HTTP LAN là giới hạn demo; không bỏ qua lỗi certificate toàn cục. Không log password/token, không đưa key Gemini vào app.

### C4. Quy tắc polling

1. Main chạy timer nối tiếp khoảng 5 giây với timeout, không chồng request. Logout/đổi server abort hoặc tăng generation để response phiên cũ không tạo notification mới.
2. Dùng `/alarms` hiện có; ID giữ dạng chuỗi. API sort timestamp+ID, tối đa 500/trang và 31 ngày/query. Demo theo dõi cửa sổ **24 giờ gần nhất**, đọc đủ các trang với from/to cố định trong mỗi lượt.
3. Lượt đầu tạo baseline ID, không bung lịch sử cũ. Sau đó so ID, bắt cả event tới trễ nhưng timestamp còn trong cửa sổ. Lưu ID cùng timestamp để bỏ khỏi memory khi ra cửa sổ; không chỉ dùng timestamp > lần trước hoặc chỉ trang đầu.
4. Chỉ đánh dấu lượt đọc hoàn tất khi đủ trang và dữ liệu hợp lệ. Lỗi giữa lượt không làm mất baseline/dedupe. Nếu dataset quá lớn/rate limit, báo theo dõi chậm và giảm tần suất, không âm thầm cắt trang. 24h là giới hạn demo; nếu lưu lượng đòi hỏi, API cursor theo thời điểm nhận là task riêng.
5. Một ID thông báo tối đa một lần trong phiên. Tối đa 3 toast/lượt, nhiều hơn gom thành một thông báo số lượng. 401 dừng/báo hết phiên một lần; 403 báo quyền; mạng/5xx retry 5/10/20/40/60s; 429 tôn trọng Retry-After có giới hạn. Không reset baseline vì lỗi mạng rồi spam lại lịch sử.

Nội dung toast chỉ dùng deviceId/severity/code/value có thật. Alarm API không luôn có tên máy/đơn vị/ngưỡng; không bịa “85°C vượt 80°C”. Test notification ghi rõ là thử. Không hứa thông báo event ngoài cửa sổ theo dõi hoặc trong lúc app đã thoát.

### C5. Build và gate Windows

- Build Windows x64 trên máy Windows hoặc GitHub Actions Windows runner; xác nhận target nếu Windows thực tế ARM64. Dùng lockfile, bản Electron được hỗ trợ lúc thực thi. Tránh mất giờ cài Wine nếu có runner Windows.
- NSIS installer với appId/AppUserModelID, icon `.ico`, Start Menu shortcut. Người cài `.exe` không cần Node. Lưu version/commit/SHA-256 artifact.
- Test logic: baseline, ID lặp/lớn, nhiều trang, late event, JSON sai, lỗi giữa lượt, 401/429, đổi phiên khi request đang chạy. Frontend test/lint/build và test browser không có bridge.
- Bản Windows đã cài phải thử toast, click route/filter đúng máy, tray, single instance, Quit, logout, đổi URL, server offline và mạng trở lại. Kiểm tra Do Not Disturb khi toast không hiện; không tự đổi cài đặt người dùng.
- Installer chưa ký số có thể bị Windows hỏi xác nhận; thử trước demo. Ghi rõ VM hay Windows vật lý. App chạy Linux/unit test pass không thay thế nghiệm thu `.exe`.

**Gate C:** installer thật + Windows đã hiện alarm từ backend thật khi app ở tray. Nếu chưa có người thao tác máy Windows, báo còn chờ; hoàn tất code/artifact trước.

## 7. Chặng D — diễn tập và bộ nộp bài

### D1. Artifact cuối

| Artifact | Nội dung |
| --- | --- |
| `docs/DEMO-RUNBOOK.md` | Setup một lần, câu lệnh bật/tắt, IP/ports, login, mạng/firmware, VM nếu dùng |
| `docs/DEMO-ACCEPTANCE.md` | Commit/image/app version, môi trường, pass/fail/chưa thử và bằng chứng đã che bí mật |
| `docs/PROJECT-FINISH-STATUS.md` | Tiến độ A–D, commit, blockers thật, bước tiếp theo |
| Windows installer + SHA-256 | Version khớp source, hướng dẫn cài/gỡ và thông báo nền |
| Source/images/video dự phòng | Commit chốt, image build/pull/cache hoặc docker save, video demo thật nếu cần |

Không đưa `.env`, mật khẩu, Wi-Fi, key/token hoặc DB dump thật vào Git/artifact công khai. Khi tới bước nộp, hỏi deadline/đường nộp/quy định video chưa được cung cấp; không tự suy đoán và không tự publish bài nộp.

### D2. Kịch bản 5 phút

1. 0:00–0:45: giới thiệu kiến trúc, stack đã chuẩn bị; trình bày một lệnh bật, mở dashboard đăng nhập. Không download/build lần đầu bằng 4G trên sân khấu.
2. 0:45–1:45: thay raw simulator, thấy số đo mới và lịch sử; phân biệt dữ liệu mới với gateway online.
3. 1:45–2:45: app xuống tray, tăng qua ngưỡng thật của profile, toast xuất hiện, bấm mở cảnh báo, Technician xác nhận đã xem.
4. 2:45–4:15: commissioning profile đã diễn tập hoặc Copilot đọc dữ liệu theo trọng tâm đội chọn; không ứng biến map chưa kiểm chứng.
5. 4:15–5:00: nêu giới hạn đúng: simulator + ESP32 thật, queue RAM hữu hạn, AI chỉ đọc; khôi phục profile/giá trị bình thường.

Outage demo là tùy chọn đã tập trước, không chen vào bằng mọi giá. Gemini lỗi thì quick actions/rules với nhãn thật. App lỗi thì tiếp tục browser và ghi desktop chưa đạt. Hotspot chặn LAN thì đổi điều kiện mạng, không có phần mềm thay thế giả làm dữ liệu thật.

### D3. Chốt bản và ngày demo

- Freeze commit/image trước diễn tập cuối; không pull PR mới sát giờ mà chưa kiểm tra lại.
- Cache images/tải installer trước; kiểm tra tài nguyên Linux/VM, điện thoại/cáp/nguồn điện.
- Bật hotspot, kiểm tra IP Linux, NTP/MQTT và URL web. IP đổi cần xử lý cả broker firmware và CORS/URL app theo runbook.
- Bản đã build chỉ cần `docker compose up -d --wait`; xác nhận `/api/health/ready`, login và một phép đo thật trước trình bày.
- Dừng bằng `docker compose down` khi cần, không `down -v`. Backup trước nâng cấp/chuyển máy. Nếu xuất image để mang máy khác, test import/up trên môi trường mục tiêu.

## 8. Kiểm tra phù hợp từng thay đổi

| Thay đổi | Kiểm tra |
| --- | --- |
| Compose/init/admin | Config, cold start/rerun, accounts integration, stack acceptance/watchdog |
| Frontend bridge/route | Frontend tests/lint/build, browser login/POST, desktop navigation |
| Desktop | Logic/IPC tests, Windows build, bản cài trên Windows |
| Firmware nếu buộc sửa | Build, host/contract tests liên quan, ESP32 thật |
| Chỉ tài liệu | Paths/commands/env/service names khớp, không chạy lại toàn bộ suite |

Không claim CI/test đã pass khi chưa chạy. Không lặp test rộng sau khi đạt gate trừ khi có thay đổi/lỗi mới. Nếu bị sandbox/network chặn, xin quyền bằng công cụ thay vì đi đường vòng. Nếu chưa có thiết bị, ghi ca còn chờ và đưa đúng một thao tác cụ thể cho người dùng.

## 9. Prompt giao model tiếp theo

> Đọc `docs/PROJECT-FINISH-PLAN.md` và `docs/PROJECT-FINISH-STATUS.md`. Thực thi A → B → C → D cho demo Legacy-link. Bắt đầu kiểm tra Git/local changes và tạo nhánh `feature/demo-compose`; hoàn tất Docker cold start bằng một lệnh, frontend và bootstrap chạy lại an toàn. Dùng lại mã sẵn có, không mở rộng tính năng. Test trên stack riêng, không ngắt/migrate bench đang dùng. Sau mỗi chặng ghi commit, bằng chứng và việc còn thiếu vào STATUS. Tiếp tục phần mềm đã được giao, không hỏi lại quyết định đã chốt. Chỉ hỏi khi thiếu thông tin thực tế về thiết bị, quyền công cụ, điều kiện nộp bài hoặc có nguy cơ ảnh hưởng dữ liệu thật. Hoàn tất phần độc lập trước khi chờ người dùng thao tác phần cứng. Không tự merge/publish bài nộp. Trả lời tiếng Việt, ngắn, dễ làm theo. Build thành công không đồng nghĩa Windows/ESP32 đã nghiệm thu.

## 10. Tài liệu đối chiếu

- [Docker startup/init dependencies](https://docs.docker.com/compose/how-tos/startup-order/).
- [Electron renderer/IPC security](https://www.electronjs.org/docs/latest/tutorial/security).
- [Electron notifications](https://www.electronjs.org/docs/latest/tutorial/notifications).
- [electron-builder NSIS](https://www.electron.build/docs/nsis/).
- Nội bộ: `backend/deploy/ACCOUNTS.md`, `docs/commissioning-demo.md`, `infrastructure/scripts/test-stack.mjs`, `firmware/legacy-link-core/docs/physical-acceptance-2026-10-10.md`.
