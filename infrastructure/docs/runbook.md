# Mosquitto Broker Runbook (Cẩm Nang Vận Hành MQTT Broker)

> **Dành cho:** Toàn bộ thành viên dự án **Legacy-link** (Firmware ESP32, Backend, Simulator, Tester).  
> **Mục tiêu:** Cung cấp hướng dẫn từng bước để cài đặt, khởi động, kiểm tra, sửa lỗi và vận hành MQTT Broker một cách nhanh chóng và chuẩn xác nhất.

---

## 0. Bảng tra nhanh: Gặp triệu chứng này thì xem mục nào

Cách dùng nhanh nhất của cẩm nang này: **đọc cột "Bạn thấy gì", rồi đi thẳng tới mục được chỉ định.**

| Bạn thấy gì trên màn hình | Nghĩa là | Xem |
| :--- | :--- | :--- |
| `no configuration file provided: not found` | Đang đứng sai thư mục | Mục 9, Lỗi 1 |
| `Exited (1)` + log có `Unable to open pwfile` | Chưa tạo file mật khẩu | Mục 9, Lỗi 2 |
| `mosquitto-init` hiện `Exited (0)` | Chuẩn bị quyền thành công, trạng thái bình thường | Mục 6 |
| `mosquitto-init` lỗi hoặc `Unable to open log file` | Bước chuẩn bị quyền chưa hoàn tất | Mục 9, Lỗi 10 |
| `refers to undefined network` | Thiếu khai báo network trong compose | Mục 9, Lỗi 3 |
| `bind: address already in use` | Cổng 1883 đã bị chiếm | Mục 9, Lỗi 4 |
| Publish OK nhưng subscriber không nhận | Gõ sai chữ trong tên topic | Mục 9, Lỗi 5 |
| `Invalid container name` | Tên container trong `.env` có dấu tiếng Việt | Mục 9, Lỗi 6 |
| Postgres `unhealthy`, hoặc `ECONNREFUSED 127.0.0.1:5432` | Database chưa sẵn sàng / sai cổng / sai tài khoản | Mục 9, Lỗi 7 |
| `relation "telemetry" does not exist` | Chưa nạp schema | Mục 9, Lỗi 8 |
| Sửa `POSTGRES_*` trong `.env` mà không có gì thay đổi | Biến chỉ đọc lúc volume còn trống | Mục 9, Lỗi 9 |

### ⚠️ Lỗi nguy hiểm nhất: mất database mà không có gì báo đỏ

Nếu bạn thấy trong log của backend dòng lặp lại mãi:
```text
[TELEMETRY] Loi ghi database: connect ECONNREFUSED 127.0.0.1:5432
```
thì hệ thống **đang chạy bình thường nhưng không lưu gì cả**.

Lý do phải cảnh báo trước: trong `backend/src/index.js`, mỗi handler đọc database đều bọc trong `try/catch`, và comment của team backend ghi rõ — *"Database loi thi ghi log roi di tiep. Khong de mot loi ha tang lam sap ca tien trinh"*. Tức là backend **cố tình nuốt lỗi** để một máy hỏng không làm chết cả tiến trình. Hệ quả là: broker vẫn xanh, `test-mqtt.sh` vẫn báo `[SUCCESS]`, tiến trình vẫn sống — nhưng không một bản ghi nào tới nơi.

Chạy `docker compose ps`. Nếu Postgres không hiện `healthy`, bạn đã tìm ra vấn đề. Chi tiết ở Mục 9, Lỗi 7.

---

## 1. Yêu cầu tiên quyết (Prerequisites)

Trước khi bắt đầu, máy tính của bạn cần cài đặt:
- **Docker Engine** (phiên bản 20.x trở lên).
- **Docker Compose** (phiên bản 2.x trở lên, kiểm tra bằng lệnh: `docker compose version`).
- Quyền chạy Docker (trên Linux: user đã được thêm vào nhóm `docker` hoặc có quyền `sudo`).

---

## 2. Quy trình chuẩn khi vừa Clone Repository về (Onboarding Workflow)

Khi vừa clone repository về máy mới, thực hiện các bước sau. Chỉ cần Docker và Compose; không cần đổi owner hay quyền file thủ công.

```text
[Clone Repo] ──> [cd infrastructure] ──> [cp .env.example .env] ──> [Tạo passwd] ──> [docker compose up -d] ──> [Test ping] ──> [Nạp schema DB]
```

### Bước 2.1: Di chuyển vào thư mục hạ tầng
> ⚠️ **LƯU Ý QUAN TRỌNG:** Toàn bộ các lệnh Docker Compose bắt buộc phải được chạy từ bên trong thư mục `infrastructure/`.

```bash
cd infrastructure
```

### Bước 2.2: Khởi tạo file cấu hình môi trường (.env)
Sao chép từ file mẫu (không sửa trực tiếp `.env.example`):
```bash
cp .env.example .env
```
*(Nếu cổng 1883 trên máy bạn đang bị chiếm bởi phần mềm khác, bạn có thể mở file `.env` vừa tạo và sửa `MQTT_PORT=1884`)*.

Chỉnh `MQTT_DEV_USER` và `MQTT_DEV_PASS` trong `.env` trước khi tạo mật khẩu. File `.env` và file mật khẩu thật không được commit; mỗi máy cần tự tạo chúng. Nếu `.env` đã tồn tại, giữ cấu hình hiện có, không sao chép đè.

### Bước 2.3: Khởi tạo tài khoản MQTT ban đầu
Chạy script tự động đóng gói bằng Docker (không cần cài thêm công cụ gì trên máy thật):
```bash
./scripts/setup-mosquitto-auth.sh
```
Script tạo hoặc cập nhật tài khoản theo `.env`, băm mật khẩu rồi đặt owner/group theo user Mosquitto trong image và quyền `600`. Không cần cài `mosquitto_passwd` trên máy host hoặc tự chạy `sudo chown`/`chmod`. Nếu giữ nguyên file mẫu, tài khoản là `legacy_admin` với mật khẩu `legacy_secret_2026`.

### Bước 2.4: Khởi động Broker và kiểm tra sức khỏe
```bash
# Khởi chạy hạ tầng và tự chuẩn bị quyền Mosquitto
docker compose up -d

# Kiểm tra cả container khởi tạo đã kết thúc
docker compose ps -a

# Chạy script test tự động
./scripts/test-mqtt.sh
```
Compose chạy `mosquitto-init` trước và chỉ khởi động broker sau khi bước này thành công. Container khởi tạo đặt quyền cho `passwd`, thư mục data và file log theo UID/GID trong image, không phụ thuộc UID của người dùng trên máy host. Log vẫn được lưu riêng tại `mosquitto/log/mosquitto.log`.

Trạng thái mong đợi: `mosquitto-init` là `Exited (0)`, broker là `Up`, Postgres là `Up ... (healthy)` sau khi khởi tạo xong.
Nếu màn hình hiện:
```text
[SUCCESS] Message published successfully!
[SUCCESS] Mosquitto broker is healthy and authentication is working.
```
Kết quả này xác nhận broker chấp nhận publish bằng tài khoản cấu hình. Để kiểm tra subscriber nhận được dữ liệu, làm thêm bài test hai cửa sổ ở Mục 8.

### Bước 2.5: Nạp schema cho database Postgres

Broker đã chạy, nhưng database thì chưa có bảng nào. Nạp schema một lần cho mỗi volume mới:
```bash
docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/schema.sql
```
*Dữ liệu mẫu (không bắt buộc):*
```bash
docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/seed-demo.sql
```
Kiểm tra 6 bảng đã tạo:
```bash
docker compose exec postgres psql -U legacy_admin -d legacy_link -c '\dt'
```
*Đợi cột `STATUS` của Postgres hiện `healthy` trước khi nạp — nghĩa là database đã sẵn sàng nhận lệnh.*

---

## 3. Khởi động Broker (Start)

* **Khởi chạy ngầm (Chế độ khuyến nghị dùng hàng ngày):**
  ```bash
  docker compose up -d
  ```
  *Cờ `-d` (detached mode) giúp container chạy ngầm dưới nền, giải phóng cửa sổ terminal để bạn làm việc khác.*

* **Khởi chạy xem log trực tiếp (Foreground mode - dùng khi cần debug sâu):**
  ```bash
  docker compose up
  ```
  *Nhấn `Ctrl + C` để dừng container.*

---

## 4. Dừng Broker (Stop vs Down)

Tùy vào mục đích mà bạn chọn một trong hai lệnh sau:

### Cách 1: Tạm dừng tạm thời (`stop`)
Dùng khi bạn muốn tạm nghỉ, đi ăn trưa hoặc nhường tài nguyên máy, lát nữa bật lại ngay:
```bash
docker compose stop mosquitto
```
* **Đặc điểm:** Chỉ đóng băng tiến trình, **giữ nguyên container và mạng ảo**. Khi bật lại bằng `docker compose start mosquitto` sẽ chạy tiếp ngay lập tức.

### Cách 2: Dọn dẹp sạch sẽ tài nguyên (`down`)
Dùng khi kết thúc buổi làm việc, hoặc khi **vừa sửa file `docker-compose.yml`**:
```bash
docker compose down
```
* **Đặc điểm:** Tắt container, **xóa bỏ container và xóa mạng ảo**. 
* **Dữ liệu có bị mất không?** **KHÔNG!** Dữ liệu tin nhắn (`mosquitto/data/mosquitto.db`), cấu hình (`mosquitto.conf`) và mật khẩu (`passwd`) đều nằm an toàn trên máy thật của bạn. Database Postgres cũng nằm trong named volume `postgres-data` nên **không** bị `down` xóa.

> ⚠️ **Ngoại lệ duy nhất:** `docker compose down -v` (có thêm cờ `-v`) sẽ **xoá cả named volume**, tức là mất toàn bộ dữ liệu database. Không thêm `-v` trừ khi bạn thật sự muốn bắt đầu lại từ đầu — xem Mục 9, Lỗi 7.

---

## 5. Khởi động lại Broker (Restart)

Dùng khi bạn vừa sửa file cấu hình `mosquitto.conf` hoặc vừa thêm/đổi mật khẩu trong `passwd`:
```bash
docker compose restart mosquitto
```
*Lệnh này sẽ tắt tiến trình bên trong container rồi bật lại ngay lập tức mà không xóa container.*

`restart` không chạy lại bước khởi tạo quyền. Khi đổi cấu hình Compose hoặc cần áp dụng quy trình tự chuẩn bị quyền, dùng:

```bash
docker compose up -d mosquitto
```

### Thêm hoặc đổi mật khẩu MQTT

Chỉnh `MQTT_DEV_USER` / `MQTT_DEV_PASS` trong `.env`, rồi chạy:

```bash
./scripts/setup-mosquitto-auth.sh
docker compose up -d --force-recreate mosquitto
./scripts/test-mqtt.sh
```

Chỉ sửa `.env` không tự cập nhật file mật khẩu. Script giữ các tài khoản khác đã có; tạo lại container broker bảo đảm đọc đúng file mới kể cả khi công cụ cập nhật thay thế file cũ. Cập nhật mật khẩu tương ứng ở ESP32/backend/simulator nếu các client đang dùng tài khoản vừa đổi.

---

## 6. Kiểm tra trạng thái hoạt động (Check Status)

Để kiểm tra xem Broker đang sống hay đã chết:

```bash
docker compose ps -a
```

* **Cột `STATUS`:**
  * Service `mosquitto` hiện `Up ...`: Tiến trình broker đang chạy; dùng script test để kiểm tra publish có xác thực.
  * Service `mosquitto-init` hiện `Exited (0)`: Đã chuẩn bị quyền xong, không phải lỗi và không cần giữ container này chạy.
  * Service `mosquitto` hiện `Exited (0)`: Broker đã kết thúc; xem log nếu không chủ động dừng.
  * Service `mosquitto-init` hoặc `mosquitto` hiện `Exited (1)` hay mã khác: Xem log của đúng service bị lỗi.
* **Cột `PORTS`:**
  * `0.0.0.0:1883->1883/tcp`: Cổng 1883 đang mở đón kết nối từ mọi thiết bị trong mạng LAN (ESP32, PC khác).
  * `127.0.0.1:5432->5432/tcp` của Postgres: Cổng database **chỉ** mở trên chính máy này. Đây là chủ ý — database không được phép chạm từ LAN.
* **Cột `STATUS` của Postgres:**
  * `Up ... (healthy)`: Database đã sẵn sàng nhận truy vấn. Backend có thể kết nối ngay.
  * `Up ... (health: starting)`: Đang khởi tộng, chờ thêm vài giây.
  * `Up ... (unhealthy)`: Đã bật quá thời gian chờ mà `pg_isready` vẫn chưa thành công — xem Mục 9, Lỗi 7.

---

## 7. Đọc và Soi Logs (Logs & Diagnostics)

Khi nghi ngờ Broker gặp trục trặc, hãy xem nhật ký hoạt động:

### Lệnh xem log:
```bash
# Xem 50 dòng log gần nhất và tiếp tục theo dõi thời gian thực (nhấn Ctrl+C để thoát)
docker compose logs -f --tail=50 mosquitto
```

### File log riêng trên máy host

Log được ghi đồng thời ra Docker và `mosquitto/log/mosquitto.log`. Trên Linux, file thuộc user Mosquitto của container và quyền `600`, nên đọc bằng:

```bash
sudo tail -n 50 -f mosquitto/log/mosquitto.log
```

Hoặc xem qua container, không cần đổi quyền file:

```bash
docker compose exec mosquitto tail -n 50 -f /mosquitto/log/mosquitto.log
```

Log Docker/lazydocker giữ lịch sử qua các lần restart. Cảnh báo cũ không có nghĩa lỗi vẫn tồn tại; đối chiếu timestamp của lần khởi động mới. Xem kết quả chuẩn bị quyền bằng `docker compose logs mosquitto-init`.

### Cách nhận diện các trạng thái qua Log:

1. **Trạng thái khởi động thành công mỹ mãn:**
   ```text
   mosquitto version 2.1.2 starting
   Config loaded from /mosquitto/config/mosquitto.conf.
   Opening ipv4 listen socket on port 1883.
   mosquitto version 2.1.2 running
   ```
   *(Nhìn thấy chữ `running` là 100% yên tâm).*

2. **Khi có thiết bị kết nối vào:**
   ```text
   New connection from 192.168.1.5:56436 on port 1883.
   New client connected from 192.168.1.5:56436 as auto-C161... (p4, c1, k60, u'legacy_admin').
   ```

3. **Cảnh báo an ninh về file `passwd` (KHÔNG PHẢI LỖI):**
   ```text
   Warning: File /mosquitto/config/passwd has world readable permissions...
   Warning: File /mosquitto/config/passwd owner is not mosquitto...
   ```
   > 💡 **Giải thích:** Phiên bản hiện tại vẫn chạy nhưng phiên bản sau có thể từ chối file. Compose đã có `mosquitto-init` tự đặt owner/group theo user Mosquitto trong image và quyền `600` trước khi broker chạy. Nếu đang dùng container tạo bằng cấu hình cũ, chạy `docker compose up -d mosquitto` để áp dụng. Cảnh báo cũ vẫn nằm trong lịch sử log; kiểm tra log của lần khởi động mới.

---

## 8. Hướng dẫn Test MQTT Pub/Sub

### Cách 1: Test nhanh tự động
```bash
./scripts/test-mqtt.sh
```

### Cách 2: Test thủ công 2 máy / 2 cửa sổ terminal qua mạng LAN

Giả sử IP máy tính chạy Broker là `192.168.1.5` (kiểm tra bằng lệnh `ip a` hoặc `hostname -I`).

* **Cửa sổ 1 - Đóng vai trò Subscriber (Người nhận tin):**
  ```bash
  mosquitto_sub -h 192.168.1.5 -p 1883 -t "factory/site-a/#" -u legacy_admin -P "legacy_secret_2026" -v
  ```
  *(Cờ `-v` giúp in ra cả tên Topic kèm nội dung)*.

* **Cửa sổ 2 - Đóng vai trò Publisher (Thiết bị ESP32 gửi tin):**
  ```bash
  mosquitto_pub -h 192.168.1.5 -p 1883 -t "factory/site-a/cnc-01/temperature" -u legacy_admin -P "legacy_secret_2026" -m '{"temp": 68.5, "unit": "C"}'
  ```

* **Kết quả bên Subscriber nhận được:**
  ```text
  factory/site-a/cnc-01/temperature {"temp": 68.5, "unit": "C"}
  ```

---

## 9. Sổ tay các lỗi thực tế thường gặp & Cách khắc phục (Troubleshooting)

### 🔴 Lỗi 1: `no configuration file provided: not found`
* **Hiện tượng:** Gõ `docker compose ps` hoặc `docker compose up` thì bị báo lỗi này.
* **Nguyên nhân:** Bạn đang đứng ở thư mục gốc của project (nơi không có file `docker-compose.yml`).
* **Cách sửa:** Gõ lệnh chuyển vào đúng thư mục:
  ```bash
  cd infrastructure
  ```

---

### 🔴 Lỗi 2: `Unable to open pwfile "/mosquitto/config/passwd"` & Container tự tắt
* **Hiện tượng:** Broker không khởi động, log có `Unable to open pwfile`, `mosquitto-init` báo `Missing or empty passwd file`, hoặc Compose báo nguồn bind mount `passwd` không tồn tại.
* **Nguyên nhân:**
  1. Chưa tạo file `passwd`.
  2. Hoặc trong `docker-compose.yml` chưa mount dòng: `- ./mosquitto/config/passwd:/mosquitto/config/passwd:ro`.
* **Cách sửa:**
  Chạy script để sinh file mật khẩu:
  ```bash
  ./scripts/setup-mosquitto-auth.sh
  docker compose up -d
  ```

---

### 🔴 Lỗi 3: `service "mosquitto" refers to undefined network ...`
* **Hiện tượng:** Không thể `up` hoặc `down`, Compose báo lỗi mạng chưa định nghĩa.
* **Nguyên nhân:** Thiếu 1 trong 2 tầng khai báo Network trong `docker-compose.yml`.
* **Cách sửa:** Đảm bảo trong `docker-compose.yml` có đủ cả 2 vế:
  ```yaml
  services:
    mosquitto:
      networks:
        - legacy-link-net      # Tầng 1: Đăng ký vào mạng

  networks:
    legacy-link-net:           # Tầng 2: Khai sinh mạng
      name: ${DOCKER_NETWORK_NAME:-legacy-link-net}
      driver: bridge
  ```

---

### 🔴 Lỗi 4: Xung đột cổng 1883 (`bind: address already in use`)
* **Hiện tượng:** Báo lỗi cổng 1883 đã bị chiếm dụng khi `docker compose up`.
* **Nguyên nhân:** Trên máy bạn đang có dịch vụ Mosquitto cài trực tiếp trên OS (Native) hoặc một container khác đang chạy chiếm cổng 1883.
* **Cách sửa:**
  * **Cách A (Tắt dịch vụ cũ):**
    ```bash
    sudo systemctl stop mosquitto
    ```
  * **Cách B (Đổi cổng Docker sang cổng khác mà không sửa code chung):**
    Mở file `.env` và đổi:
    ```bash
    MQTT_PORT=1884
    ```
    Sau đó chạy `docker compose up -d`. Lúc này ESP32 sẽ kết nối vào cổng `1884`.

---

### 🔴 Lỗi 5: Subscriber không nhận được tin nhắn dù không báo lỗi gì
* **Hiện tượng:** Publisher gửi thành công nhưng Subscriber im lìm.
* **Nguyên nhân:** **Lệch ký tự trong tên Topic** (Ví dụ bên gửi gõ `.../tmp` nhưng bên nhận lại subscribe `.../temp`). Ký tự MQTT phân biệt chính xác từng chữ hoa/thường.
* **Cách sửa:**
  * Kiểm tra khớp chính xác từng chữ cái giữa bên gửi và bên nhận.
  * Hoặc dùng Wildcard `#` ở bên nhận để bắt toàn bộ tín hiệu con:
    `-t "factory/site-a/#"`

---

### 🔴 Lỗi 6: `Invalid container name (...)`
* **Hiện tượng:** `docker compose up` báo lỗi cú pháp tên container.
* **Nguyên nhân:** Đặt biến `MQTT_CONTAINER_NAME` trong `.env` có dấu tiếng Việt (ví dụ `Bố_Huy_Sigma`) hoặc ký tự lạ ngoài `[a-zA-Z0-9_.-]`.
* **Cách sửa:** Mở file `.env` sửa lại tên tiếng Anh không dấu (ví dụ: `legacy-link-mosquitto` hoặc `huy-sigma-container`).

---

### 🔴 Lỗi 7: Postgres bị `unhealthy` hoặc không kết nối được
* **Hiện tượng:** `docker compose ps` hiện `Up ... (unhealthy)`, hoặc backend báo lỗi `ECONNREFUSED 127.0.0.1:5432`.
* **Nguyên nhân thường gặp:**
  1. Bạn vừa `up -d` và backend khởi động ngay lập tức, chưa đợi Postgres sẵn sàng.
  2. Cổng 5432 trên máy đã bị một PostgreSQL cài trực tiếp trên OS chiếm.
  3. `POSTGRES_USER` / `POSTGRES_DB` trong `.env` lệch với `DATABASE_URL` trong `backend/.env`.
* **Cách sửa:**
  ```bash
  # 1. Xem Postgres có báo gì không
  docker compose logs --tail=50 postgres

  # 2. Chờ cho tới khi cột STATUS hiện healthy
  docker compose ps

  # 3. Nếu cổng bị chiếm, đổi cổng trong .env
  POSTGRES_PORT=5433
  ```
  *Sau khi đổi `POSTGRES_PORT`, sửa `DATABASE_URL` trong `backend/.env` cho khớp cổng mới.*

---

### 🔴 Lỗi 8: Bảng trong database không có (`relation "telemetry" does not exist`)
* **Hiện tượng:** Backend báo lỗi SQL như `relation "telemetry" does not exist`, hoặc `psql -c '\dt'` không thấy bảng nào.
* **Nguyên nhân:** Container Postgres tạo database rỗng, chưa nạp schema.
* **Cách sửa:** Nạp schema rồi khởi động lại backend:
  ```bash
  docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/schema.sql
  ```

---

### 🔴 Lỗi 9: Đổi `POSTGRES_USER`/`POSTGRES_PASS`/`POSTGRES_DB` trong `.env` nhưng không có gì thay đổi
* **Hiện tượng:** Sửa user hoặc mật khẩu trong `.env`, `docker compose up -d` lại, nhưng đăng nhập bằng giá trị mới vẫn thất bại / giá trị cũ vẫn dùng được.
* **Nguyên nhân:** Ba biến `POSTGRES_*` **chỉ được đọc một lần duy nhất**, lúc volume còn trống. Volume đã có dữ liệu thì Postgres bỏ qua chúng hoàn toàn. Đây là hành vi cố ý để không lỡ tay đổi mật khẩu làm hỏng dữ liệu đang có.
* **Cách sửa:** Chỉ khi bạn thật sự muốn xóa sạch và làm lại từ đầu:
  ```bash
  docker compose down -v      # -v = xóa cả named volume postgres-data
  docker compose up -d
  docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/schema.sql
  ```
  > ⚠️ **Cảnh báo:** `down -v` **xoá toàn bộ dữ liệu telemetry, trạng thái máy và alarm**. Chỉ dùng ở máy cá nhân khi thử nghiệm.

---

### 🔴 Lỗi 10: Không ghi được file log hoặc `mosquitto-init` thất bại

Xem lỗi của bước chuẩn bị quyền:

```bash
docker compose logs mosquitto-init
docker compose ps -a
```

Nếu thiếu hoặc rỗng `passwd`, chạy `./scripts/setup-mosquitto-auth.sh` trước. Với container tạo bằng cấu hình cũ, áp dụng Compose mới:

```bash
docker compose up -d mosquitto
./scripts/test-mqtt.sh
docker compose logs --tail=30 mosquitto
```

Không cần tự đổi quyền trên host: `mosquitto-init` chuẩn bị quyền và broker chờ bước này thành công. Nếu log init báo `Operation not permitted` hoặc `Read-only file system`, kiểm tra thư mục repo có nằm trên filesystem cho phép quyền POSIX và ghi dữ liệu hay không; với filesystem không hỗ trợ `chown`, chuyển repo sang filesystem Linux phù hợp (trên WSL dùng thư mục Linux thay vì ổ Windows mount). Không dùng `chmod 777` để thay thế.

---

## 10. Sơ đồ xử lý sự cố nhanh (Quick Recovery Flowchart)

Gặp sự cố với Broker? Hãy làm theo đúng trình tự 4 bước sau:

```text
       Broker không hoạt động / Thiết bị không kết nối được?
                               │
                               ▼
        [Bước 1]: Kiểm tra vị trí đứng có đúng không?
                  gõ: pwd  ==>  Bắt buộc phải là: .../infrastructure
                               │
                               ▼
        [Bước 2]: Kiểm tra container đang sống hay chết?
                  gõ: docker compose ps -a
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
        STATUS: Up                         STATUS: Exited / Không thấy
    (Broker đang sống)                     (Broker đã bị sập)
            │                                     │
            ▼                                     ▼
  [Kiểm tra mạng & Topic]:                [Bước 3]: Mở log xem lý do sập:
  - Xem đúng IP LAN máy chưa?             gõ: docker compose logs mosquitto
  - Xem đúng cổng 1883 chưa?                      │
  - Xem đúng topic chưa?                          ▼
  - Xem đúng user/pass chưa?              [Bước 4]: Sửa lỗi theo Mục 9
                                                  │
                                                  ▼
                                          [Bước 5]: Khởi động lại:
                                          gõ: docker compose up -d
```
