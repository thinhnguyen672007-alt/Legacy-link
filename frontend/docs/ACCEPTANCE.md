# Kiểm thử frontend — 10/10/2026

Nhánh `feature/frontend`, nền repo `fb68875`. Bản source được chuẩn bị trong worktree riêng để review qua PR vào `main`. Phạm vi thay đổi: `frontend/` và báo cáo discovery frontend. Không sửa backend/firmware/infra hay ngắt bench.

**Kết luận:** P0 đã có triển khai và qua test độc lập. Chưa gọi là sẵn sàng demo thật: browser chưa kết nối API Compose do CORS; chưa chạy ACK/probe/apply từ UI trên ESP32 trong lượt này.

## Bằng chứng tự động

| Kiểm tra | Kết quả |
| --- | --- |
| `npm test` | 28 tests qua, 3 files |
| `npm run lint` | Qua, không lỗi |
| `npm run build` | TypeScript + Vite qua; JS tải đầu 474,71 kB, gzip 147,37 kB; chi tiết/chart tải riêng |
| Impeccable detector | Một lượt, không findings; không thay thế kiểm tra browser |
| Finish review độc lập | Hai findings đã sửa và chấm resolved; disposition `ship` trong phạm vi UI |

Test mô phỏng bao gồm parse JSON/HTML/body rỗng, sai schema, 429, network/timeout POST không retry, abort, ID chuỗi lớn, trạng thái 202/terminal, probe hết hạn/khác config/boot/offline, incomplete readings, lưu flash thất bại, giá trị âm/0 và khoảng thiếu biểu đồ, phiên chỉ đọc, xóa token khi ngắt kết nối, giữ dữ liệu tốt gần nhất khi API lỗi và giữ form/operation khi chuyển màn hình trong lúc probe đang chờ. Hai regression tests kiểm tra đối chiếu snapshot trước theo dõi thao tác và hai probe ngoài khoảng liên tiếp phải xác nhận lại.

## Browser với API mô phỏng độc lập

Frontend `127.0.0.1:5173`, fixture `127.0.0.1:4319`, thiết bị có nhãn **MÔ PHỎNG**. Fixture chỉ chạy khi người kiểm thử bật script, không tự thay thế API thật. Kết quả không chứng minh đường đi qua MQTT/DB/ESP32.

- Kết nối, danh sách, chi tiết, lịch sử, diagnostics, alarm ACK và bộ lọc đã thao tác qua browser.
- Preview → probe (202 chờ) → completed → dialog → apply → applied/persisted đã thử bằng fixture. Không suy luận khôi phục qua reboot khi response không có bằng chứng.
- Lịch sử thao tác có thiết bị/gateway/thời gian, cấu hình đầy đủ, so sánh bản đang chuẩn bị và xác nhận riêng theo ID trước khi theo dõi.
- Kiểm tra 1440, 1024 và 390 px: không tràn ngang toàn trang. Bảng và JSON kỹ thuật cuộn trong vùng riêng. Form 390 px dùng bố cục xếp dọc.
- Keyboard: Enter mở dialog; focus vào “Quay lại”; Tab đi qua “Áp dụng cấu hình”, “Đóng” rồi vòng lại; Escape đóng và trả focus về nút mở. Chưa kiểm tra toàn bộ với screen reader hoặc audit WCAG tự động.
- Tải lại trang xóa session/token như thiết kế. Các lỗi mạng/503/quyền và timeout còn được test ở lớp component/client, không cố tình dừng dịch vụ bench.

Ảnh chụp thật từ browser, nguồn dữ liệu fixture; không phải mockup AI:

| View | Bằng chứng |
| --- | --- |
| Thiết bị 1440 / 1024 / 390 | [Desktop](screenshots/desktop.jpg), [laptop](screenshots/laptop.jpg), [mobile](screenshots/mobile.jpg) |
| Lịch sử, âm/0/khoảng thiếu | [Desktop](screenshots/history.jpg), [mobile](screenshots/history-mobile.jpg) |
| Cấu hình | [Desktop](screenshots/commissioning.jpg), [mobile](screenshots/commissioning-mobile.jpg) |
| Hộp xác nhận và đối chiếu sau sửa | [Dialog](screenshots/confirm.jpg), [đối chiếu desktop](screenshots/reconciliation.jpg), [mobile](screenshots/reconciliation-mobile.jpg) |

## API thật — chỉ đọc

Chạy `scripts/live-read.mts --container legacy-oct10-api-1` trên API `http://127.0.0.1:3000`; token đọc giữ trong bộ nhớ script, không ghi log. Tám endpoint trả dữ liệu hợp lệ với schema FE:

- `/machines`
- `/gateways`
- `/profiles`
- `/operations`
- `/alarms`
- `/machines/BENCH-01`
- `/catalog?deviceId=BENCH-01`
- `/machines/BENCH-01/telemetry`

API ready. Container chưa đặt `CORS_ORIGINS`; request có Origin `http://127.0.0.1:5173` trả 403, không có Allow-Origin. Đây là kiểm tra HTTP trực tiếp, chưa phải browser integration thành công. Không gửi POST vào API thật, không tạo hoặc xác nhận alarm thật, không đổi cấu hình ESP32.

## Việc cần nghiệm thu trước demo dự kiến 20/10

1. Người vận hành cấu hình đúng `CORS_ORIGINS` cho API Compose và recreate riêng service API theo [README](../README.md). Giữ nguyên token/DB/broker/consumer và các origin khác đang dùng.
2. Trên máy demo, mở frontend, nhập token trực tiếp; đối chiếu danh sách, metric, timestamps, lịch sử và diagnostics BENCH-01 với API thật.
3. Phối hợp người giữ bench để ACK một alarm đã chọn; reload và kiểm tra acknowledgedAt từ DB.
4. Chọn profile đã được đội kiểm chứng; preview → probe → apply từ UI. Xác minh operation cuối, catalog, persisted và dữ liệu tiếp theo. Chỉ kiểm tra reboot khi người vận hành bố trí được.
5. Chạy thử bài demo 3–5 phút và một lần phục hồi mất kết nối FE. Không dùng fault test gây ngắt stack đang phục vụ đội.

Có khoảng 10 ngày là mốc kế hoạch, không phải lịch tự động: 10–12/10 chốt CORS và nghiệm thu đọc; 13–15/10 alarm/commissioning với bench; 16–18/10 sửa lỗi tích hợp và tập demo; 19/10 kiểm tra bản build/token/cáp/mạng, 20/10 là ngày dự kiến cần đội xác nhận.

## Công cụ thiết kế đã dùng

Impeccable được dùng cho direction contract, thiết kế code-led, rà soát UI và tài liệu design. Các hướng dẫn phù hợp trong frontend-agent-kit được tham khảo trong [discovery](../../docs/FRONTEND-DISCOVERY-2026-10-10.md); không chạy installer hoặc thay cấu hình global. Dùng Lucide SVG và font đóng gói local; không ship ảnh tạo sinh. Screenshot tài liệu chỉ là bằng chứng test.
