# Windows app — nghiệm thu 2026-10-11

Nhánh `feat/windows-app`, PR [#81](https://github.com/thinhnguyen672007-alt/Legacy-link/pull/81). Nền main `2ecc859`. Người dùng đã cho phép merge khi CI xanh và không conflict; hiện GitHub yêu cầu review trước merge.

## Build dùng để nghiệm thu cuối

- Version 0.1.3, source `8305396d13bbd8b12ab789322b6fdee318614669`.
- [Push workflow](https://github.com/thinhnguyen672007-alt/Legacy-link/actions/runs/38088154883), [artifact ZIP](https://github.com/thinhnguyen672007-alt/Legacy-link/actions/runs/38088154883/artifacts/11683370850).
- Installer `Legacy-Link-Setup-0.1.3-x64.exe`, kèm manifest và SHA256SUMS. Artifact giữ 30 ngày, cần đăng nhập GitHub để tải. Bản unsigned hiện SmartScreen; kiểm đúng source/artifact trước More info → Run anyway.
- Node 22 trên Actions; Electron 44.7.0, electron-builder 26.15.3; người cài không cần Node. 12 desktop tests và 89 frontend tests qua; frontend lint/build qua. Xem Checks của PR để đối chiếu từng commit.

## Kiểm tra thực tế bằng computer-use

Windows 11 x64 VM; dùng Edge đã đăng nhập GitHub để tải ZIP, giải nén và chạy NSIS. Cài per-user vào `C:\Users\docker\AppData\Local\Programs\Legacy Link`. Không đóng bàn phím ảo; chỉ minimize.

| Tình huống | Bằng chứng đã thực hiện |
| --- | --- |
| URL sai rồi sửa | 0.1.0: `http://127.0.0.1:9999` báo lỗi; đổi sang web Linux LAN thành công |
| Đăng nhập thật | 0.1.0/0.1.1/0.1.3: admin qua UI/mật khẩu hiện có; 0.1.3 nhập bằng chuột trên bàn phím ảo, không dùng token bootstrap |
| Dữ liệu thật | BENCH-01 từ backend hiện có, Mất liên lạc/Dữ liệu cũ, mẫu cuối 22:11:06 10/10; không gọi live |
| X xuống tray | 0.1.0/0.1.1: ẩn cửa sổ, tray vẫn chạy, gửi toast thử từ menu khay được |
| Toast Windows | 0.1.0/0.1.1/0.1.2 hiện THÔNG BÁO THỬ; click Action Center chưa mở lại app, 0.1.3 đã sửa bằng protocol activation: bấm thông báo thử mới nhất trong Action Center mở lại đúng app thành công (form đăng nhập), đã xác nhận qua computer-use; lượt quay 0.1.3 click toast sau X/tray phục hồi đúng phiên đăng nhập và trang cảnh báo |
| Mở lần hai | 0.1.1: mở desktop shortcut khi app đang ở khay, quay lại dashboard vẫn đăng nhập |
| Logout | 0.1.1/0.1.3: nút đăng xuất về form trống trước quay. Logic stop/401/403 và chống phản hồi phiên cũ được test tự động |
| Đổi server / hủy | 0.1.0: hủy setup giữ dashboard/phiên. 0.1.3: áp dụng lại URL hiện có thành công, phiên cũ bị bỏ và về form trống |
| Mất mạng / phục hồi | 0.1.0: Windows Firewall chỉ chặn outbound tới Linux:8080 bằng rule tạm LLTEST; app báo mất kết nối/đang thử lại, giữ phiên; xóa rule rồi tự về Đang theo dõi, không phát lịch sử. Đã xác nhận rule không còn tồn tại; không ngắt RDP/backend |
| Quit / URL lưu | Quit đóng thật; nâng cấp 0.1.0→0.1.1→0.1.2→0.1.3 mở lại với URL cũ, form đăng nhập trống; token/mật khẩu không lưu |
| ESP32 alarm mới | Chưa nghiệm thu: người dùng xác nhận khác mạng. Không tạo alarm giả vào DB/MQTT live |

## Video và bàn giao

Đã sửa trạng thái nhập VM bằng khởi động lại VM trên đĩa hiện có; sau đó chuột + bàn phím ảo nhập được đầy đủ tài khoản. Bàn phím ảo còn chạy, chỉ minimize. Đăng nhập thử 0.1.3 thành công, đăng xuất về form trống rồi mới quay.

Video gốc quay liên tục, không cắt và không sửa code trong lúc quay: nhập tài khoản/mật khẩu (ô mật khẩu che ký tự), đăng nhập, xem BENCH-01, biểu đồ 7 ngày với 100 mẫu lịch sử, cảnh báo lịch sử, X xuống tray, THÔNG BÁO THỬ, click Action Center phục hồi phiên, đổi máy chủ/áp dụng lại URL về form trống. Không demo AI hoặc alarm phần cứng mới.

- File local ngoài repo: `artifacts/windows-demo/demo-original.mp4` (886,55 giây, 36.070.940 byte) và `demo-x5.mp4` (177,4 giây, 3.810.767 byte), tính từ thư mục cha checkout.
- Bản x5 dùng `setpts=PTS/5`, MP4 H.264/yuv420p, không audio, không cắt; cả hai file giải mã toàn bộ không lỗi và đã mở phát kiểm tra.
- Đã xác nhận đúng hai cuộc trò chuyện được chỉ định trong Zen, kiểm clip/nội dung trước gửi. Cả hai hiện video 2:57 và trạng thái Đã gửi, kèm link installer và giới hạn ESP32. Bằng chứng gửi giữ local, không đưa nội dung chat riêng tư vào repo.
- Không dựng stack mô phỏng riêng và không ghi dữ liệu giả vào DB/MQTT live. Clip dùng lịch sử backend hiện có, hiển thị thiết bị mất liên lạc/dữ liệu cũ.

## Giới hạn

Backend/web Linux cần truy cập được; đổi Wi-Fi/IP phải nhập URL mới và CORS tương ứng. HTTP LAN cho demo. Không auto-start, auto-update, ký số hoặc lưu mật khẩu. Quit đóng hoàn toàn thì không nhận thông báo. Polling chỉ xét 24 giờ gần nhất, giới hạn 100 trang/50.000 hàng; khi quá tải báo chưa hoàn tất. Không chứng minh alarm mới từ thiết bị thật bằng toast thử.

Đồng hồ VM lệch so với thời gian backend: khoảng 24 giờ không có mẫu, chọn 7 ngày thấy lịch sử. Cần đồng bộ giờ Windows trước nghiệm thu alarm mới; chưa chứng minh polling alarm thật trong điều kiện đồng hồ đúng.
