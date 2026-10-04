# Legacy-link Infrastructure

> **Branch:** `feature/infra-base`  
> **Module:** Core Infrastructure & Message Broker

---

## English

### 1. Overview
This directory contains the foundational infrastructure for the **Legacy-link** project. The primary goal is to provide a clean, containerized (Docker-based) environment centered around an **Eclipse Mosquitto MQTT broker**, serving as the central communication bus connecting the ESP32 gateway (`firmware/`), backend services (`backend/`), simulators (`simulators/`), and user interfaces (`frontend/`).

### 2. Directory Structure
```text
infrastructure/
├── mosquitto/
│   ├── config/
│   │   ├── mosquitto.conf         # Mosquitto broker configuration
│   │   └── passwd.example         # Template for MQTT user credentials
│   ├── data/
│   │   └── .gitkeep               # Persistent message store (git-ignored)
│   └── log/
│       └── .gitkeep               # Broker runtime logs (git-ignored)
├── scripts/
│   ├── setup-mosquitto-auth.sh    # Helper script to generate hashed password file
│   └── test-mqtt.sh               # Quick pub/sub verification script
├── docs/
│   ├── architecture.md            # Network topology & integration details
│   └── runbook.md                 # Operations & troubleshooting runbook (Tiếng Việt)
├── .env.example                   # Template environment variables
├── .gitignore                     # Ignores runtime data, logs, and sensitive credentials
├── docker-compose.yml             # Service orchestration definition
└── README.md                      # Infrastructure documentation (this file)
```

### 3. Core Components
- **Eclipse Mosquitto MQTT Broker**: Runs inside Docker to handle publish/subscribe messaging between the ESP32 gateway and application services.
  - **Port 1883**: Standard MQTT protocol listener.
  - **Authentication**: Password file authentication enabled (`allow_anonymous false`).
  - **Persistence**: Retains messages across container restarts (`/mosquitto/data/`).
  - **Logging**: Outputs to both stdout and `/mosquitto/log/mosquitto.log`.
- **PostgreSQL 16**: Stores telemetry history, machine state, and alarms for the backend. Runs in a named volume so data survives `docker compose down`.
  - **Port 5432**: Bound to `127.0.0.1` only, so the database is not reachable from other machines on the LAN.
  - **Initialization**: The schema is created from `backend/db/schema.sql` (see Step 5), matching the database name and credentials in `backend/.env`.
- **Docker Compose**: Orchestrates infrastructure services with isolated networking (`legacy-link-net`).
- **Scripts**: Helper utilities to manage MQTT authentication and test connectivity without requiring external host tools.

### 4. Getting Started
#### Prerequisites
- Docker Engine & Docker Compose (v2.x or later).

#### Step 1: Environment Configuration
Copy the example environment file:
```bash
cp .env.example .env
```

#### Step 2: Initialize MQTT Authentication
Generate a password file from the template or run the setup script:
```bash
# Using the helper script (generates password file via Docker):
./scripts/setup-mosquitto-auth.sh
```
*(Or copy `mosquitto/config/passwd.example` to `mosquitto/config/passwd` and use `mosquitto_passwd` to add credentials).*

#### Step 3: Start the Infrastructure
```bash
docker compose up -d
```

#### Step 4: Verify Status and Logs
```bash
docker compose ps
docker compose logs -f mosquitto
```

#### Step 5: Load the Database Schema
The Postgres container creates an empty database on first start. Apply the schema once per fresh volume:
```bash
docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/schema.sql
```
Optional demo data (two FANUC-30i machines, shared register map):
```bash
docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/seed-demo.sql
```
The credentials above must match `DATABASE_URL` in `backend/.env`. If you changed `POSTGRES_USER`, `POSTGRES_PASS`, or `POSTGRES_DB` in `.env`, update `DATABASE_URL` to match.

Verify the tables exist:
```bash
docker compose exec postgres psql -U legacy_admin -d legacy_link -c '\dt'
```

#### Step 6: Stop the Infrastructure
```bash
docker compose down
```
Data in the Postgres named volume and the Mosquitto store survives `down`. Remove them only when you intend to start from scratch — see the runbook.

### 5. Security & Credentials
- **Never commit credentials**: The file `mosquitto/config/passwd` and `.env` contain sensitive secrets and are excluded via `.gitignore`.
- Only commit `.example` files with dummy placeholder values.
- **Database is loopback-only**: Postgres binds to `127.0.0.1:5432`. Other machines on the LAN cannot reach it, and the default password is a placeholder — change `POSTGRES_PASS` before any deployment beyond a local machine.

### 6. Future Extensibility
This infrastructure is designed to easily accommodate future services:
- **Time-series upgrade**: PostgreSQL can be extended with TimescaleDB (add the extension to the image) without changing how the backend connects.
- **Backend & Frontend**: Custom services can join the shared Docker network to communicate with Mosquitto by hostname (`mosquitto:1883`) and with Postgres by hostname (`postgres:5432`).

---

## Tiếng Việt

### 1. Tổng quan
Thư mục này chứa nền tảng hạ tầng ban đầu của dự án **Legacy-link**. Mục tiêu cốt lõi là cung cấp môi trường ảo hóa bằng **Docker** xoay quanh **Mosquitto MQTT broker** — đóng vai trò là xương sống truyền tin (Message Bus) kết nối giữa ESP32 gateway (`firmware/`), hệ thống backend (`backend/`), các trình giả lập (`simulators/`), và giao diện người dùng (`frontend/`).

### 2. Cấu trúc thư mục
```text
infrastructure/
├── mosquitto/
│   ├── config/
│   │   ├── mosquitto.conf         # Cấu hình Mosquitto broker
│   │   └── passwd.example         # File mẫu định dạng user/password
│   ├── data/
│   │   └── .gitkeep               # Nơi lưu trữ persistent db (được gitignore)
│   └── log/
│       └── .gitkeep               # Nơi lưu trữ log file (được gitignore)
├── scripts/
│   ├── setup-mosquitto-auth.sh    # Script tạo file mật khẩu hash bằng Docker
│   └── test-mqtt.sh               # Script kiểm tra nhanh kết nối pub/sub
├── docs/
│   ├── architecture.md            # Tài liệu kiến trúc mạng & tích hợp
│   └── runbook.md                 # Cẩm nang vận hành & xử lý sự cố (Runbook)
├── .env.example                   # Biến môi trường mẫu
├── .gitignore                     # Bỏ qua data, log và credentials nhạy cảm
├── docker-compose.yml             # File cấu hình khởi chạy dịch vụ Docker
└── README.md                      # Tài liệu hướng dẫn hạ tầng (file này)
```

### 3. Các thành phần chính
- **Eclipse Mosquitto MQTT Broker**: Chạy dưới dạng container để xử lý bản tin pub/sub giữa gateway ESP32 và các dịch vụ ứng dụng.
  - **Port 1883**: Cổng lắng nghe giao thức MQTT tiêu chuẩn.
  - **Xác thực (Authentication)**: Bắt buộc user/password (`allow_anonymous false`).
  - **Lưu trữ bền vững (Persistence)**: Lưu trữ tin nhắn ngay cả khi restart container (`/mosquitto/data/`).
  - **Ghi nhật ký (Logging)**: Xuất log đồng thời ra stdout và file `/mosquitto/log/mosquitto.log`.
- **PostgreSQL 16**: Lưu lịch sử telemetry, trạng thái máy và alarm cho backend. Dữ liệu nằm trong named volume nên không mất khi `docker compose down`.
  - **Port 5432**: Chỉ bind vào `127.0.0.1`, các máy khác trong LAN không kết nối được vào database.
  - **Khởi tạo schema**: Nạp từ `backend/db/schema.sql` (xem Bước 5), khớp với tên database và tài khoản trong `backend/.env`.
- **Docker Compose**: Điều phối các dịch vụ hạ tầng trong một bridge network riêng (`legacy-link-net`).
- **Scripts**: Các công cụ tiện ích giúp tạo mật khẩu và test kết nối nhanh chóng mà không yêu cầu cài công cụ phụ trợ trên máy thật.

### 4. Hướng dẫn khởi chạy
#### Yêu cầu cài đặt
- Docker Engine & Docker Compose (v2 trở lên).

#### Bước 1: Thiết lập biến môi trường
Sao chép file cấu hình môi trường mẫu:
```bash
cp .env.example .env
```

#### Bước 2: Khởi tạo mật khẩu MQTT
Tạo file mật khẩu thông qua script hỗ trợ:
```bash
./scripts/setup-mosquitto-auth.sh
```
*(Hoặc đổi tên file mẫu `mosquitto/config/passwd.example` thành `mosquitto/config/passwd` và dùng `mosquitto_passwd` để đặt tài khoản).*

#### Bước 3: Khởi động hạ tầng
```bash
docker compose up -d
```

#### Bước 4: Kiểm tra trạng thái và log
```bash
docker compose ps
docker compose logs -f mosquitto
```

#### Bước 5: Nạp schema cho database
Container Postgres chỉ tạo database rỗng ở lần khởi động đầu tiên. Nạp schema một lần cho mỗi volume mới:
```bash
docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/schema.sql
```
Dữ liệu mẫu (hai máy CNC cùng loại FANUC-30i, dùng chung bản đồ thanh ghi):
```bash
docker compose exec -T postgres psql -U legacy_admin -d legacy_link < ../backend/db/seed-demo.sql
```
Tài khoản trong lệnh phải khớp với `DATABASE_URL` trong `backend/.env`. Nếu bạn đã đổi `POSTGRES_USER`, `POSTGRES_PASS` hoặc `POSTGRES_DB` trong `.env` thì sửa `DATABASE_URL` cho khớp.

Kiểm tra các bảng đã tạo:
```bash
docker compose exec postgres psql -U legacy_admin -d legacy_link -c '\dt'
```

#### Bước 6: Dừng hạ tầng
```bash
docker compose down
```
Dữ liệu trong named volume của Postgres và kho lưu Mosquitto vẫn còn sau `down`. Chỉ xóa chúng khi bạn có ý định bắt đầu lại từ đầu — xem runbook.

### 5. Quy tắc bảo mật
- **Không commit mật khẩu thật**: File `mosquitto/config/passwd` và `.env` chứa thông tin nhạy cảm và đã được cấu hình trong `.gitignore`.
- Chỉ commit các file `.example` với thông tin mẫu/giả định.
- **Database chỉ mở trên loopback**: Postgres bind vào `127.0.0.1:5432`, các máy khác trong LAN không truy cập được. Mật khẩu mặc định là giá trị mẫu — đổi `POSTGRES_PASS` trước khi triển khai ngoài máy cá nhân.

### 6. Khả năng mở rộng trong tương lai
Cấu trúc này sẵn sàng để tích hợp thêm các dịch vụ khi dự án phát triển:
- **Nâng cấp time-series**: Có thể bổ sung extension TimescaleDB vào PostgreSQL mà không phải đổi cách backend kết nối.
- **Backend & Frontend**: Các container dịch vụ khác có thể kết nối trực tiếp đến Mosquitto qua hostname nội bộ `mosquitto:1883` và đến Postgres qua `postgres:5432`.
