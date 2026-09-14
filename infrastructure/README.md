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

#### Step 5: Stop the Infrastructure
```bash
docker compose down
```

### 5. Security & Credentials
- **Never commit credentials**: The file `mosquitto/config/passwd` and `.env` contain sensitive secrets and are excluded via `.gitignore`.
- Only commit `.example` files with dummy placeholder values.

### 6. Future Extensibility
This infrastructure is designed to easily accommodate future services:
- **Database Layer**: Time-series (TimescaleDB / InfluxDB) or Relational (PostgreSQL) services can be plugged into `docker-compose.yml`.
- **Backend & Frontend**: Custom services can join the shared Docker network to communicate with Mosquitto by hostname (`mosquitto:1883`).

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

#### Bước 5: Dừng hạ tầng
```bash
docker compose down
```

### 5. Quy tắc bảo mật
- **Không commit mật khẩu thật**: File `mosquitto/config/passwd` và `.env` chứa thông tin nhạy cảm và đã được cấu hình trong `.gitignore`.
- Chỉ commit các file `.example` với thông tin mẫu/giả định.

### 6. Khả năng mở rộng trong tương lai
Cấu trúc này sẵn sàng để tích hợp thêm các dịch vụ khi dự án phát triển:
- **Cơ sở dữ liệu**: Dễ dàng bổ sung PostgreSQL, TimescaleDB hoặc InfluxDB vào `docker-compose.yml`.
- **Backend & Frontend**: Các container dịch vụ khác có thể kết nối trực tiếp đến Mosquitto qua hostname nội bộ `mosquitto:1883`.
