# Bàn giao API để đội tự xây frontend

Phiên bản OpenAPI: 0.5.0 trong `backend/openapi.json`. Client mẫu: `backend/examples/frontend-client.js`. Đây là hợp đồng API, chưa xây giao diện.

## Kết nối

Lấy base URL, read token, write token từ người vận hành. Lab Node dùng `backend/.env`; stack Compose dùng `infrastructure/.env`. Hai môi trường có thể khác token và DB. Nếu frontend chạy trên laptop khác, localhost trỏ về laptop đó, phải dùng IP LAN máy backend.

Thêm đúng origin frontend vào CORS_ORIGINS rồi khởi động lại API. Không thêm `*`. Cho người dùng nhập token lúc chạy, không commit token. Read token đủ xem; write token cần cấu hình/ACK cảnh báo. Lỗi 401 là chưa xác thực, 403 là thiếu quyền hoặc Origin chưa được phép; 429 xem Retry-After; 503 chờ dependency phục hồi.

```js
import { createLegacyLinkApi } from '../backend/examples/frontend-client.js';
const api = createLegacyLinkApi('http://IP-BACKEND:3000', {
  getToken: () => tokenNguoiDungVuaNhap,
});
const machines = await api.machines();
```

Ví dụ trên minh họa API; sửa đường import cho repo frontend thực tế. Không tự gửi SQL hay kết nối PostgreSQL từ trình duyệt.

## Màn hình cần làm

| Màn hình | API và hành vi |
|---|---|
| Danh sách máy | GET /machines; phân biệt gatewayOnline, dataFresh, readHealth, deliveryHealth |
| Chi tiết/biểu đồ | GET /machines/:id và /machines/:id/telemetry; dùng from/to/limit/nextCursor theo OpenAPI |
| Cảnh báo | GET /alarms; lọc máy, severity, trạng thái xác nhận; POST /alarms/:id/ack bằng write token |
| Commissioning | GET /gateways, POST /config/preview, POST /gateways/:id/probe, GET /operations/:id; chỉ apply sau probe hợp lệ |
| Thư viện profile | GET /profiles; POST /profiles/import; GET /profiles/:id/export?revision=N; revision bất biến |
| Chẩn đoán | GET /system/metrics, /uptime, /operations; xem queue ESP32 trong machine.diagnostics.delivery |

Commissioning: preview → probe → poll operation tới completed → gửi đúng config đã probe cùng probeRequestId sang apply → poll tới applied. HTTP 202 chỉ nghĩa là đã nhận thao tác, **chưa phải máy đã đổi cấu hình**. Hiển thị rejected/timed_out/catalog_error và lý do; không đổi màu “thành công” ngay sau POST. Device ID đang thuộc gateway khác bị chặn.

Polling gợi ý: danh sách mỗi 5 giây, chi tiết máy đang mở mỗi 2–5 giây; dừng timer khi rời trang. Không gọi lịch sử của mọi máy liên tục. Rate limit hiện tính theo IP socket/process; qua proxy nhiều người có thể dùng chung một bucket.

## Hiển thị delivery health

```json
{
  "deviceId": "BENCH-01",
  "deliveryHealth": "backlog",
  "diagnostics": {
    "delivery": {
      "storage": "RAM", "bootId": "abc123", "clockReady": true,
      "freeHeapBytes": 45000,
      "telemetry": {"pending": 3, "capacity": 32, "highWater": 5, "committed": 80, "failedEnqueues": 0},
      "alarm": {"pending": 0, "capacity": 8, "highWater": 1, "committed": 2, "failedEnqueues": 0}
    }
  }
}
```

Đây là trích đoạn response, không phải toàn bộ các field. `unknown`: firmware cũ/chưa có báo cáo; `stale`: báo cáo đã cũ; `rejected`: backend từ chối mẫu đầu queue, xem rejection; `loss_observed`: từng enqueue thất bại từ lần boot này; `backlog`: có mẫu chờ ACK; `healthy`: báo cáo mới và không thấy dấu hiệu trên. `backlog` ngắn ngay sau gửi là bình thường; chưa ACK không đồng nghĩa đã mất dữ liệu.

Số committed là ESP32 đã nhận ACK, không phải tổng số row database. Counter reset khi bootId đổi. Khi báo cáo cũ, không trình bày pending=0 như chứng cứ hiện tại. Queue RAM có thể mất khi reset hoặc đầy, không gắn nhãn “zero data loss”.

## Test frontend sau khi xây

1. Đọc danh sách/lịch sử bằng read token; thử write phải bị 403.
2. Theo dõi cùng BENCH-01 trên FE và USB `:health`, `:inspect`, `:outbox`.
3. Gửi probe rồi apply profile; theo dõi đủ trạng thái 202 → terminal.
4. Dừng consumer theo hướng dẫn của người vận hành; FE phải hiển thị ready lỗi/data cũ, rồi cập nhật lại sau phục hồi.
5. Một alarm được ACK thì đổi trạng thái đúng; refresh trang vẫn giữ vì lưu DB.

Tự động đã kiểm tra server/proxy bằng script; thao tác thực tế trên trình duyệt và ESP32 vẫn cần đội nghiệm thu khi có frontend.
