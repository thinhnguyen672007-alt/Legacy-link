# Mosquitto Broker Runbook (Cẩm Nang Vận Hành MQTT Broker)

> **Dành cho:** Toàn bộ thành viên dự án **Legacy-link** (Firmware ESP32, Backend, Simulator, Tester).  
> **Mục tiêu:** Cung cấp hướng dẫn từng bước để cài đặt, khởi động, kiểm tra, sửa lỗi và vận hành MQTT Broker một cách nhanh chóng và chuẩn xác nhất.

---

## 1. Yêu cầu tiên quyết (Prerequisites)

Trước khi bắt đầu, máy tính của bạn cần cài đặt:
- **Docker Engine** (phiên bản 20.x trở lên).
- **Docker Compose** (phiên bản 2.x trở lên, kiểm tra bằng lệnh: `docker compose version`).
- Quyền chạy Docker (trên Linux: user đã được thêm vào nhóm `docker` hoặc có quyền `sudo`).

---

## 2. Quy trình chuẩn khi vừa Clone Repository về (Onboarding Workflow)

Khi bạn vừa clone repository về máy tính lần đầu tiên, hãy thực hiện đúng **4 bước tối ưu sau** (chỉ mất chưa đầy 1 phút):

```text
[Clone Repo] ──> [cd infrastructure] ──> [cp .env.example .env] ──> [Tạo passwd] ──> [docker compose up -d] ──> [Test ping]
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

### Bước 2.3: Khởi tạo tài khoản MQTT ban đầu
Chạy script tự động đóng gói bằng Docker (không cần cài thêm công cụ gì trên máy thật):
```bash
chmod +x ./scripts/setup-mosquitto-auth.sh
./scripts/setup-mosquitto-auth.sh
```
*Lệnh này sẽ tự động tạo user mặc định: `legacy_admin` với mật khẩu: `legacy_secret_2026`.*

### Bước 2.4: Khởi động Broker và kiểm tra sức khỏe
```bash
# Khởi chạy ngầm broker
docker compose up -d

# Chạy script test tự động
chmod +x ./scripts/test-mqtt.sh
./scripts/test-mqtt.sh
```
Nếu màn hình hiện:
```text
[SUCCESS] Message published successfully!
[SUCCESS] Mosquitto broker is healthy and authentication is working.
```
👉 **Chúc mừng! Hệ thống MQTT Broker của bạn đã hoạt động hoàn hảo 100%!**

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
* **Dữ liệu có bị mất không?** **KHÔNG!** Dữ liệu tin nhắn (`mosquitto/data/mosquitto.db`), cấu hình (`mosquitto.conf`) và mật khẩu (`passwd`) đều nằm an toàn trên máy thật của bạn.

---

## 5. Khởi động lại Broker (Restart)

Dùng khi bạn vừa sửa file cấu hình `mosquitto.conf` hoặc vừa thêm/đổi mật khẩu trong `passwd`:
```bash
docker compose restart mosquitto
```
*Lệnh này sẽ tắt tiến trình bên trong container rồi bật lại ngay lập tức mà không xóa container.*

---

## 6. Kiểm tra trạng thái hoạt động (Check Status)

Để kiểm tra xem Broker đang sống hay đã chết:

```bash
docker compose ps -a
```

* **Cột `STATUS`:**
  * `Up ...`: Broker đang sống và khỏe mạnh.
  * `Exited (0)`: Broker đã tắt an toàn theo lệnh của người dùng.
  * `Exited (1)` hoặc mã khác: Broker bị sập do lỗi (cần xem log ngay!).
* **Cột `PORTS`:**
  * `0.0.0.0:1883->1883/tcp`: Cổng 1883 đang mở đón kết nối từ mọi thiết bị trong mạng LAN (ESP32, PC khác).

---

## 7. Đọc và Soi Logs (Logs & Diagnostics)

Khi nghi ngờ Broker gặp trục trặc, hãy xem nhật ký hoạt động:

### Lệnh xem log:
```bash
# Xem 50 dòng log gần nhất và tiếp tục theo dõi thời gian thực (nhấn Ctrl+C để thoát)
docker compose logs -f --tail=50 mosquitto
```

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
   > 💡 **Giải thích:** Đây chỉ là cảnh báo nhắc nhở của Mosquitto về quyền file trên máy Linux. Broker **vẫn đọc được file mật khẩu và vẫn hoạt động bình thường**, không cần lo lắng!

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
* **Hiện tượng:** `docker compose ps` thấy `Exited (0)` hoặc `Exited (13)`. Xem log thấy dòng lỗi trên.
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
