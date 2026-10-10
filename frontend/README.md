# Frontend Legacy-link

## Demo bằng Docker Compose

Trên máy Linux chạy `infrastructure/docker-compose.yml` profile `full`, frontend có sẵn tại `http://<IP-Wi-Fi-Linux>:8080`. API đi qua `/api` cùng địa chỉ web; đăng nhập bằng tài khoản admin đã tạo lần đầu, sau đó admin cấp tài khoản Viewer/Technician. Xem [hướng dẫn máy mới](../infrastructure/README.md). Phần bên dưới dành cho chạy Vite để phát triển và các mốc nghiệm thu trước khi frontend được đưa vào Compose.

Ứng dụng tiếng Việt theo hướng **Sổ vận hành**: thiết bị, lịch sử số đo, cảnh báo, chẩn đoán và cấu hình preview → probe → apply. Nhánh `feature/frontend`; mốc demo dự kiến khoảng 20/10/2026, chạy trên máy backend Docker Compose.

## Chạy trên máy backend

Cần Node 22.12 trở lên và npm. Chạy các lệnh trong thư mục `frontend/` của nhánh này:

```sh
npm ci
npm run dev
```

Mở **http://127.0.0.1:5173**. API mặc định **http://localhost:3000**; có thể nhập URL khác tại màn hình kết nối hoặc đặt `VITE_API_BASE_URL` trong `.env.local`. `.env.example` chỉ chứa URL, không chứa token.

Nhân viên đăng nhập bằng username/password. Admin tạo Viewer (chỉ xem) hoặc Technician (thao tác); màn hình Nhân viên chỉ dành cho Admin. Tài khoản mới phải đổi mật khẩu. Phiên chỉ ở RAM trình duyệt và hết hạn sau 8 giờ; đóng/tải lại trang cần đăng nhập lại. Khóa hoặc đổi quyền thu hồi phiên phía server. Xem [account setup](../backend/deploy/ACCOUNTS.md) để migrate và tạo Admin đầu tiên.

Để xem bản build trên cùng origin:

```sh
npm run build
npm run preview
```

Dừng dev server trước khi chạy preview vì cùng dùng cổng 5173. `preview` dùng cho trình diễn local, chưa phải cấu hình hosting production. Các route chi tiết cần SPA fallback về `index.html` nếu dùng web server khác.

## CORS cho Docker Compose — người vận hành cấu hình

Cổng frontend 5173 khác API 3000 nên browser cần backend cho phép origin. Đặt trong môi trường **container API**:

```dotenv
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

Giữ các origin hợp lệ đang dùng khác nếu có. Không dùng `*`, không tắt auth. Với stack `infrastructure/docker-compose.yml`, biến được truyền từ môi trường Compose vào service `backend-api`; với `backend/compose.yml`, service tên `api`, lấy từ `.env.compose`. Chọn đúng project/file/overlay đang chạy. Sau sửa môi trường, người vận hành cần recreate **riêng API** theo lệnh Compose của stack; `docker restart` không cập nhật biến môi trường. Không dừng broker, database hoặc consumer chỉ để chạy frontend.

**Kiểm tra 10/10:** API local `legacy-oct10-api-1` trả ready và tám endpoint đọc khớp schema, nhưng `CORS_ORIGINS` chưa được đặt; request có Origin `http://127.0.0.1:5173` trả 403. Chưa thay đổi container để tránh gián đoạn bench. Vì vậy UI chưa được nghiệm thu với API thật trên trình duyệt.

Nếu trình duyệt chạy cùng máy backend, localhost dùng được. Máy khác phải dùng IP LAN và thêm đúng origin của frontend; HTTPS → HTTP có thể bị browser chặn. Không suy đoán mọi lỗi mạng đều là CORS.

## Kiểm thử

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

Unit/component test dùng dữ liệu mô phỏng, không gọi thiết bị thật. Kiểm tra response JSON/HTML/rỗng, lỗi quyền, Retry-After, timeout không gửi lại POST, ID chuỗi, số 0/âm/khoảng trống biểu đồ, trạng thái 202, probe hết hạn/khác config/khác boot, persistence, session và quyền chỉ đọc.

API fixture độc lập để xem/test giao diện:

```sh
npm run test:fixtures
```

Trong UI nhập API **http://127.0.0.1:4319**, username `viewer` hoặc `technician`, password `fixture-password` (chỉ fixture). Mở frontend bằng **127.0.0.1:5173** đúng origin fixture cho phép. Thiết bị/profile có nhãn **MÔ PHỎNG**. Không có ESP32/DB thật phía sau fixture; không dùng kết quả này làm bằng chứng phần cứng. UI không tự chuyển sang fixture khi API thật lỗi. Dừng bằng Ctrl+C sau test.

Script kiểm tra đọc API thật (không ghi hoặc in token):

```sh
npx tsx scripts/live-read.mts --container TEN_CONTAINER_API_LOCAL
```

Hoặc đặt `LEGACY_LINK_API_URL`, `LEGACY_LINK_READ_TOKEN` trong môi trường tiến trình rồi chạy `npx tsx scripts/live-read.mts`. Không ghi token vào lệnh/history hay commit. `--container` chỉ đọc token trong bộ nhớ từ container chỉ định; cần quyền Docker và chỉ dùng trên máy đội kiểm soát.

## Hướng dẫn sử dụng

1. Kết nối API và kiểm tra danh sách. “Liên lạc được”, “Dữ liệu mới”, “Đọc thiết bị”, “Gửi dữ liệu” là bốn tín hiệu khác nhau.
2. Mở thiết bị để xem số đo, lịch sử hoặc diagnostics. Giá trị 0 là phép đo hợp lệ; thiếu mẫu được ghi rõ, không tự thay 0.
3. Lịch sử tải 100 mẫu/trang, tối đa 31 ngày/truy vấn; dùng “Tải thêm” khi còn cursor. Lịch sử không tự chạy liên tục. Có bảng dữ liệu thay thế biểu đồ. Đơn vị lịch sử chưa được xác minh theo revision nên không tự gắn catalog mới vào dữ liệu cũ.
4. Cảnh báo có bộ lọc thiết bị, mức độ, đã xem và thời gian. Trang đầu tự cập nhật; trang sau giữ khoảng truy vấn để phân trang nhất quán. “Đã xem” chỉ ghi nhận đã đọc, không xử lý lỗi vật lý.
5. Cấu hình: chọn gateway → nạp profile hoặc đọc catalog theo mã máy → chỉnh form → kiểm tra cấu hình → đọc thử → xem số đo → xác nhận áp dụng. Mọi chỉnh sửa hủy kết quả thử cũ. Probe chỉ hợp lệ trong 60 giây và cùng boot.
6. Nếu gửi lệnh lỗi mạng, dừng việc gửi lại, đọc lịch sử gateway và theo dõi đúng operation ID. UI giữ form/operation trong phiên khi đổi màn hình; không tự gửi lại POST.
7. Sau apply: kiểm tra `applied`, `persisted` và `restoredAfterRestart` riêng. `persisted:false` chưa lưu bền. Không power-cycle bench chỉ để hiện dấu thành công nếu chưa phối hợp.

## Bàn giao

- [Giải thích kiến trúc và câu hỏi thuyết trình](docs/HANDOFF.md)
- [Kết quả kiểm thử và phần nghiệm thu còn chờ](docs/ACCEPTANCE.md)
- [Bối cảnh sản phẩm đã duyệt](PRODUCT.md)
- [Hướng thiết kế](docs/surface-brief.md)

P1 quản lý/import/export profile đầy đủ, hệ thống nâng cao; P2 hiệu ứng bổ sung chưa triển khai. CI/root manifest/deploy ngoài frontend chưa thay đổi. Nhánh `feature/frontend` dùng PR vào `main`; hướng dẫn nghiệm thu thật nằm trong báo cáo bên dưới.

## Employee accounts

Account setup and migration: [backend/deploy/ACCOUNTS.md](../backend/deploy/ACCOUNTS.md).
Production builds default to the same-origin `/api` proxy; Vite development defaults to `http://localhost:3000`. The Docker image accepts `API_UPSTREAM` (for example `backend-api:3000`) and forwards Authorization unchanged. Set CORS_ORIGINS to the browser's actual origin on the backend. A frontend-only deployment without the updated backend/schema cannot sign in with accounts.
