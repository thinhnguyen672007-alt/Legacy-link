# Legacy Link — đường đọc bằng chứng cho BGK

Đề D1: https://densohackathon.vn/theme. Public source được review: `9d61244c9ec07186bbcd91ad86af51264afcd038`. Các thay đổi submission trong checkout này chưa được đưa lên GitHub.

## Kết quả và giới hạn

| Claim | Bằng chứng | Giới hạn |
|---|---|---|
| ESP32 nhận số đo Modbus và gửi server | [Physical stack acceptance](physical-acceptance-2026-10-10.md) | Nguồn Python/OpenModSim, CH340 UART; chưa là PLC/RS-485 thật |
| Đổi profile A/B không reflash | [Firmware acceptance](../firmware/legacy-link-core/docs/physical-acceptance-2026-10-10.md) | Trong phạm vi Modbus RTU hiện hỗ trợ |
| Mất ACK sau lưu, gửi lại 4 lần, DB một row | Firmware acceptance, mục Lost ACK | Duplicate-safe persistence trong thử nghiệm có giới hạn |
| Phục hồi outage ngắn | Stack/firmware acceptance | RAM queue; power loss mất pending, full queue bỏ mẫu mới |
| UI probe/apply/history | Video Web trong bộ nộp | Không thay cho nguồn hardware đồng thời nhìn thấy |
| Desktop Windows và thông báo | Video Windows mới 62 giây | Chưa đối chiếu thao tác nguồn của từng notification trong video |

## Kiểm thử khi review

Backend public: 106 unit tests và integration MQTT/SQL/ACK/security/proxy/accounts PASS. Frontend: 104 tests, lint/build PASS. Desktop: 28 tests PASS (native APIs mô phỏng). Firmware host tại máy review chưa chạy do thiếu libasan; workflow Build public báo success. Không lấy automated tests làm chứng nhận công nghiệp.

## Trước nộp

- Đăng video 2–3 phút có thuyết minh; thêm URL thật vào README, slide cuối và form.
- Link repo: https://github.com/thinhnguyen672007-alt/Legacy-link
- Live: https://vineyard-fifteen-elusive.ngrok-free.dev/ — server đội phải online; gửi tài khoản Viewer qua form riêng, không commit credential.
- Xác minh CV/contact đã được BTC nhận; thêm URLs GitHub/project cá nhân vào form hoặc CV.
- Chốt credential riêng, mạng/đồng hồ và backup video. Không mặc định đổi .env sẽ đổi password store Mosquitto đã tồn tại.
- Thử PDF/PPTX và link bằng trình duyệt mới; ngrok có trang trung gian lần đầu.
- Không claim CNC thật, OPC-UA, 500 PLC, zero-loss hoặc ROI thực đo khi chưa có bằng chứng.
