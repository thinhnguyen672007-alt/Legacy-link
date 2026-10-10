# Bàn giao frontend cho đội

## Đường đi dữ liệu và vai trò file

```text
ESP32 → MQTT → backend → PostgreSQL → HTTP API
                                      ↓
Connection → session → api/client + schema → TanStack Query → pages → UI
```

| File | Việc chính |
| --- | --- |
| `src/main.tsx` | Gắn router, session và app vào trang; font được đóng gói local |
| `src/session.tsx` | Token trong bộ nhớ, cache theo phiên, lịch polling/backoff |
| `src/api/client.ts` | Tạo URL, bearer token, timeout, parse body, lỗi có status, không retry POST |
| `src/api/schema.ts` | Zod kiểm tra dữ liệu API tại đầu vào; kiểm tra điều kiện apply |
| `src/pages/Connection.tsx` | Nhập URL/token, thử GET machines trước khi vào |
| `src/pages/Machines.tsx` | Danh sách, tìm kiếm, lọc cần chú ý, polling 5 giây |
| `src/pages/MachineDetail.tsx` | Chi tiết polling 3 giây, lịch sử theo cursor, chart và diagnostics |
| `src/pages/Alarms.tsx` | Đọc/lọc, phân trang, xác nhận đã xem |
| `src/pages/Commissioning.tsx` | Form, preview, probe, operation, dialog apply và phục hồi kết quả chưa rõ |
| `src/components/ui.tsx`, `src/styles.css` | Badge có chữ/icon, thông báo, ngày GMT+7, design tokens và responsive |
| `src/test/` | Test mô phỏng; không ship fixture vào code app |
| `scripts/fixture-api.mjs` | API độc lập để test UI; dùng validator config thật của backend |
| `scripts/live-read.mts` | Đối chiếu schema các endpoint đọc với API thật, không đổi thiết bị |

“Cache” là bản dữ liệu gần nhất giữ tạm; “polling” là đọc lại theo chu kỳ. Khi API lỗi, giữ bản tốt gần nhất với thời điểm cập nhật. Query key có device/filter/cursor, nên phản hồi của truy vấn cũ không dùng để ghi vào thiết bị mới. AbortSignal hủy request không còn cần; khi tab ẩn, TanStack không tiếp tục interval nền. Cấu hình được giữ khi đổi route trong cùng phiên, nhưng gateway/operation không poll khi rời màn cấu hình.

## Các quyết định cần hiểu

- React + TypeScript để tách trang và phát hiện lỗi kiểu; Zod còn kiểm tra JSON thực tế, vì type TypeScript tự nó không bảo vệ dữ liệu mạng.
- TanStack Query giữ cache, hủy request và quản lý đọc nền; không tự viết framework cache.
- Router cho phép mở URL thiết bị trực tiếp. Tải lại cần nhập token lại; đây là đánh đổi cố ý.
- Recharts tải riêng khi mở chi tiết, giảm phần JavaScript tải đầu. Line không nối qua khoảng thiếu; số âm/0 được giữ nguyên.
- Radix Dialog quản lý focus cho bước apply. Form cấu hình không bắt nhập toàn bộ JSON.
- Preview dùng POST nhưng chỉ kiểm tra; probe/apply là thao tác trên gateway và không tự retry. Sau timeout không thể kết luận lệnh chưa đến nơi.
- Quyền thật do backend kiểm tra. Disable nút chỉ giúp người dùng hiểu phiên chỉ đọc.
- Backend hỗ trợ metric key mở; form không tự đặt danh sách metric bắt buộc. Đơn vị và scale theo cấu hình, không scale thêm tại FE.
- Không có revision theo từng mẫu: biểu đồ lịch sử hiển thị số nguyên gốc API, ghi rõ chưa xác minh đơn vị lịch sử. Ngưỡng ngắt đường dùng chu kỳ cấu hình hiện tại và được chú thích.
- CORS và Retry-After là việc cần phối hợp backend/infra; frontend không tự tắt bảo vệ origin để demo.

## Giới hạn đã biết

OpenAPI 0.5.0 có summary operation RAM đã cũ; source thực tế dùng PostgreSQL. `deliveryDelayMs` được source chặn ở 0 dù mô tả cho phép âm. CORS chưa expose Retry-After: FE dùng backoff nếu browser không đọc được. Gateway cấu hình cần trạng thái mới hơn tiêu chí online của danh sách máy. Queue RAM không chịu được mất điện; counter committed theo boot không phải tổng row DB.

Lịch sử thao tác P0 chỉ đủ đối chiếu và tiếp tục theo ID, không có bộ lọc/audit nâng cao. Nạp profile có sẵn đã hỗ trợ; quản lý/import/export đầy đủ ở P1. Chưa triển khai đăng nhập người dùng, OEE, BI, điều khiển bật/tắt máy hoặc TLS firmware.

## Demo 3–5 phút

1. Kết nối Compose đã cấu hình CORS; mở BENCH-01. Nói rõ ESP32 thật đang đọc simulator.
2. Thay một giá trị simulator cùng người phụ trách bench; xem thời điểm đo/nhận và biểu đồ.
3. Mở alarm thật, bấm đã xem, cập nhật lại để thấy kết quả từ DB.
4. Nạp profile đã chuẩn bị, kiểm tra → đọc thử → xem lại → apply. Đợi trạng thái cuối, chỉ ra lưu flash là một kết quả riêng.
5. Mở diagnostics và nói đúng giới hạn RAM; không tạo outage trên dịch vụ chung để biểu diễn.

## Câu hỏi thường gặp khi trình bày

**Vì sao máy online mà không có số đo?** Liên lạc gateway chỉ chứng minh có heartbeat; đọc Modbus có thể lỗi hoặc dữ liệu đã cũ. FE tách bốn trạng thái.

**Vì sao nhận 202 chưa hiện thành công?** HTTP mới tiếp nhận lệnh; cần ESP32 trả kết quả cuối và backend lưu catalog.

**Vì sao phải đọc thử lại sau khi sửa?** Kết quả cũ chỉ chứng minh đúng cấu hình đã thử, trên đúng boot, trong khoảng còn hiệu lực.

**Mất mạng rồi bấm lại có sao không?** Request có thể đã đến backend. FE khóa gửi khi chưa rõ và cho đối chiếu operation, không tự gửi lại.

**Token có giấu được khỏi người dùng browser không?** Không. Token chỉ được giữ trong bộ nhớ để giảm lưu vết; người dùng trình duyệt có thể xem nó. Backend mới là nơi kiểm soát quyền.

**Có đảm bảo không mất dữ liệu không?** Không. Queue ESP32 ở RAM, đầy thì bỏ mẫu mới và mất điện có thể mất mẫu chưa xác nhận.

**Đã test máy công nghiệp chưa?** Chưa. Báo cáo hiện có là ESP32 + simulator; UI fixture và test tự động là lớp bằng chứng khác.
