# Rà soát tình huống sử dụng — 2026-10-10

Nguồn: `main` tại `743e177` (PR #72 đã merge). Nhánh sửa: `fix/user-workflow-edge-cases`.
Phạm vi: web hiện có và hợp đồng backend liên quan; chưa có Windows app để nghiệm thu.

## Lỗi đã sửa

- Sai thông tin đăng nhập, sai mật khẩu hiện tại, trùng tên tài khoản và các lỗi cấu hình/control phổ biến có thông báo tiếng Việt riêng; không gắn mọi HTTP 409 với “thiết bị bận”. Mã HTTP và trạng thái kết quả chưa rõ vẫn được giữ cho logic xử lý.
- Địa chỉ API thiếu định dạng có ví dụ sửa. Lỗi kết nối hướng dẫn kiểm địa chỉ, Wi-Fi, Docker và quyền truy cập.
- Yêu cầu kiểm phiên cũ được hủy khi đổi phiên; phản hồi 401 muộn không đăng xuất người mới. Khi phiên hiện tại bị thu hồi, màn hình đăng nhập giải thích nguyên nhân. Lỗi mạng/503 không tự xóa phiên. Kiểm phiên chạy mỗi 30 giây, không phải thu hồi tức thì trên UI; backend kiểm quyền trên mỗi request.
- Đăng nhập, đổi mật khẩu, tạo/reset/đổi quyền/khóa tài khoản có khóa gửi trong lúc chờ; các trường đăng nhập/mật khẩu/tạo tài khoản không sửa giữa request. Hủy reset không làm thay đổi biểu mẫu đang gửi.
- Mật khẩu trên web kiểm giới hạn 256 byte UTF-8, vì ký tự có dấu có thể nhiều byte dù số ký tự chưa vượt 256.
- Đi từ chi tiết máy sang Cấu hình chuẩn bị đúng mã mới khi không có thao tác đang chạy. Đọc catalog ưu tiên mã đang nhập, không âm thầm lấy mã cũ từ URL. Theo dõi thao tác đang chạy vẫn được giữ khi đổi trang.
- Probe có thời điểm ở tương lai, đã đủ 60 giây, đọc thất bại/thiếu thông số, errorCode không nhất quán, sai gateway/boot/config không được dùng để áp dụng. Nút xác nhận kiểm lại thời gian thực ngay trước gửi, kể cả modal đã mở trước lúc hết hạn.
- Lỗi đọc không hiện checkbox chấp nhận ngoài khoảng. Chỉ số đo đọc thành công nhưng ngoài khoảng mới có checkbox. Có hướng dẫn khi probe hết hạn, gateway restart hoặc đồng hồ máy chậm hơn backend.
- Gateway đã báo offline hiển thị Mất liên lạc. Probe đọc được hiển thị Đọc thành công, không kết luận trạng thái nhiệt độ/máy là bình thường từ việc đọc thành công.
- Trang chi tiết không mời Viewer vào thao tác Cấu hình. Backend vẫn là nơi quyết định quyền.
- Chẩn đoán thiết bị và kết quả đọc thử dùng chung mô tả mã Modbus. Mã không biết giữ mã và hướng đối chiếu log, không đoán nguyên nhân.
- Khi ACK có phản hồi chưa rõ, không tự gửi lại. Người dùng Đọc đến hiện tại để đối chiếu; thông báo lỗi ACK cũ được xóa khi chủ động đọc lại.
- Copilot không gửi câu hỏi chỉ có khoảng trắng; câu hỏi được bỏ khoảng trắng đầu/cuối. Giờ trong Copilot và audit dùng chung GMT+7, không phụ thuộc múi giờ máy người dùng.

## Ma trận kiểm tra

| Trường hợp | Bằng chứng / kết quả |
| --- | --- |
| Địa chỉ trống, thiếu scheme, URL chứa credentials/query/hash hoặc scheme không an toàn | `client.test.ts`: chặn và giải thích |
| Đăng nhập sai / phản hồi 401 không có JSON | `client.test.ts`: thông báo đúng ngữ cảnh đăng nhập |
| Sai mật khẩu hiện tại / trùng username | `client.test.ts`: mô tả riêng, giữ HTTP status |
| Bấm gửi đăng nhập hai lần khi chưa trả về | `app.test.tsx`: đúng một request; khóa input khi chờ |
| Bấm tạo nhân viên hai lần khi chưa trả về | `accounts.test.tsx`: đúng một request; khóa input khi chờ |
| Mật khẩu tiếng Việt ít ký tự nhưng >256 byte | `accounts.test.tsx`: chặn trước POST; backend cũng kiểm byte |
| Nhân viên phải đổi mật khẩu tạm | `accounts.test.tsx`: chưa vào dashboard; đổi xong cần đăng nhập mới |
| Session cũ trả 401 sau khi session mới kết nối | `session.test.tsx`: người mới vẫn đăng nhập |
| Session hiện tại bị thu hồi / API 503 tạm thời | `session.test.tsx`: 401 xóa phiên có giải thích; 503 giữ phiên |
| Viewer mở chi tiết máy / ACK / Admin | `app.test.tsx`, `accounts.test.tsx`, backend `accounts.test.js`: ẩn hoặc chặn đúng quyền |
| Đổi mã đang nhập trong trang có query device cũ | `app.test.tsx`: catalog dùng mã đã nhập |
| Mở Cấu hình của máy khác sau một bản nháp | `app.test.tsx`: chuẩn bị đúng mã mới |
| Giới hạn register, key trùng, bounds đảo, critical/lowAlarm không hợp lệ | Backend `service.test.js`, frontend `client.test.ts`: validator chặn; UI giải thích các lỗi tương ứng |
| HTTP 202 / probe chưa hoàn tất | `app.test.tsx`, `workflow.test.tsx`: chưa mở áp dụng |
| Probe thất bại và bấm đọc thử liên tiếp | `app.test.tsx`: một request, không có checkbox bỏ qua lỗi đọc, áp dụng bị khóa |
| Ngoài khoảng và đọc thử lại | `app.test.tsx`: phải chấp nhận lại với mỗi probe |
| Probe khác config/boot/gateway, offline hoặc thiếu readings | `workflow.test.tsx`, backend `service.test.js`: chặn áp dụng |
| Probe tương lai / đúng 60 giây / success kèm errorCode lỗi | `workflow.test.tsx`: chặn |
| Probe hết hạn khi modal đang mở | `app.test.tsx`: không POST apply, báo đọc lại |
| Timeout, mất mạng, JSON/HTML sai, API schema sai, hủy request | `client.test.ts`: giữ status/uncertainty; POST không tự retry |
| Lỗi Modbus 2 / 226 / mã lạ | `workflow.test.tsx`: có metric, địa chỉ, mã, hướng kiểm; mã lạ không đoán |
| ACK có thể đã tới backend nhưng phản hồi 503 | `app.test.tsx`: chỉ gửi một lần, đọc lại danh sách để đối chiếu |
| Backend lỗi sau khi đã tải danh sách | `app.test.tsx`: giữ dữ liệu gần nhất kèm thông báo |
| Giá trị 0, âm, khoảng không có mẫu | `app.test.tsx`, `workflow.test.tsx`: giữ 0/âm, ngắt đường ở khoảng mất mẫu |
| Copilot câu hỏi trống / khoảng trắng đầu-cuối | `copilot.test.tsx`: không gửi trống, gửi câu hỏi đã trim |
| Copilot chưa có Gemini / API thật lỗi | `copilot.test.tsx` và backend AI tests: không sinh thiết bị giả, chế độ rules/fallback rõ |
| Thời gian hiển thị khác múi giờ máy | `workflow.test.tsx`: timestamp UTC 00:00 hiển thị 07:00 |
| Hai process/gateway tranh cùng thiết bị; API restart, dữ liệu gửi lại | Đã rà `db/operations.js`, `db/provisioning.js`, `completion-checks.mjs`; khóa và kiểm ownership trước publish. Backend không sửa trong lượt này; integration đầy đủ thuộc bằng chứng PR #72, không ghi là vừa chạy lại |

## Kiểm chứng lượt này

- Frontend: **65/65 tests PASS**, lint và TypeScript/build PASS; backend: **83/83 unit tests PASS**.
- Docker frontend build; Chromium với fixture riêng desktop 1440px và mobile 390px: lỗi dưới badge, mô tả lỗi đọc rõ, không tràn ngang. Fixture không gửi lệnh tới ESP32 thật.
- Kết quả và triển khai live được ghi tại PROJECT-FINISH-STATUS.md sau khi hoàn tất.

## Giới hạn

Đây là ma trận cụ thể, không phải chứng minh không còn mọi lỗi có thể xảy ra. Chưa thử lại trên CNC thật, các kiểu wiring/noise khác, mất nguồn khi RAM queue còn mẫu, phần cứng mới chưa đăng ký, nhiều người dùng tải lớn, Gemini với key thật hoặc Windows installer. Kiểm thử ứng dụng dùng dữ liệu giả lập có kiểm soát; không reset tài khoản hoặc cấu hình demo thật để tạo tình huống lỗi. Build có cảnh báo chunk chính hơn 500 kB trước gzip; chưa làm benchmark mạng chậm trong lượt này.
