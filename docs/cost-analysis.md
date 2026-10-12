# Legacy Link — chi phí và cách đối chiếu

Cập nhật 12/10/2026. Đội xác nhận ESP32 mua **130.000đ**. Đây là giá board, không phải tổng gateway. Reviewer chưa nhận hóa đơn/link sản phẩm. Các số 91%, 59 giờ/tháng, ROI 290% và hoàn vốn 2,3 tháng đã được bỏ khỏi deck sửa vì chưa có đầu vào đủ kiểm chứng.

## BOM cần chốt

| Hạng mục | Giá | Trạng thái |
|---|---:|---|
| ESP32 | 130.000đ | Đội cung cấp; cần ảnh hóa đơn/link nếu còn |
| Adapter dùng trong bench | Chưa cung cấp | CH340/UART bench không tương đương RS-485 công nghiệp |
| RS-485 cách ly cho pilot | Chưa cung cấp | Cần chọn theo điện áp/interface và yêu cầu máy thật |
| Nguồn, vỏ, cáp, đầu nối | Chưa cung cấp | Không được bỏ khỏi tổng gateway |
| Công khảo sát/cấu hình máy đầu tiên | Chưa đo | Tách khỏi máy đã có profile |
| Công cấu hình máy đã có profile | Chưa đo | ≤15 phút là KPI đề xuất |
| Server/mạng dùng chung | Chưa phân bổ | Tính cùng phạm vi cho cả hai phương án |
| Bảo trì/thay thế | Chưa đo | Không claim độ bền tương đương gateway công nghiệp |

## Cách tính không phóng đại

Chi phí gateway hoàn chỉnh = board + interface + nguồn + vỏ/cáp + công setup.

Chi phí triển khai N máy = N × phần cứng mỗi máy + công profile dùng chung + công cấu hình từng máy + server/mạng chung.

Tiết kiệm đầu tư (%) = (chi phí baseline − chi phí Legacy Link) / chi phí baseline × 100.

Tiết kiệm thời gian (%) = (thời gian baseline − thời gian Legacy Link) / thời gian baseline × 100.

Chỉ tính ROI khi có đầu tư ban đầu, chi phí vận hành và lợi ích theo thời gian. Ghi công thức/mẫu số, thời hạn và nguồn từng đầu vào. Tiết kiệm giờ công không tự động trở thành tiền thu được hoặc giảm headcount.

## Baseline công bằng

So với commercial gateway hoặc IPC phục vụ cùng số máy, cùng register map, cùng dashboard/server, cùng yêu cầu interface/cách ly và môi trường. Hai phương án đều được tính lợi ích giám sát tập trung. Không gán lợi ích dashboard riêng cho Legacy Link.

MGate MB3180 là gateway Modbus serial/Ethernet; không mặc định hỗ trợ MQTT hoặc toàn bộ backend/dashboard. Cần thêm connector/software khi có. Tham chiếu nhà sản xuất: https://www.moxa.com/en/products/industrial-edge-connectivity/protocol-gateways/modbus-tcp-gateways/mgate-mb3180-mb3280-mb3480-series

Không dùng giá 300–330 USD của deck cũ như báo giá đã xác nhận. Chọn một báo giá/link có ngày, VAT/shipping và phạm vi rõ; nếu chưa có, trình bày là phần cần đo trong pilot.

## Phép đo đội cần làm

1. Chọn một profile đã có và nguồn Modbus sẵn; ghi build/device/gateway ID.
2. Bắt đầu tính giờ trước chọn profile; kết thúc khi đọc thử/áp dụng và số đo hợp lệ đã lên dashboard.
3. Ghi rõ có tính nối dây, flash, Wi-Fi và tạo register map hay không.
4. Nếu không còn phần cứng, không tự tạo số đo; giữ mục này là chưa đo và dùng bằng chứng acceptance trước đó có ngày/commit.
