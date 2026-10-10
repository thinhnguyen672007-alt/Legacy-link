# Legacy Link Windows

Electron shell sử dụng web/backend Linux hiện có. Cài `Legacy-Link-Setup-0.1.3-x64.exe`, nhập URL web Linux (ví dụ `http://192.168.1.13:8080`), đăng nhập bằng tài khoản đã cấp. Không nhập `/api`; localhost trên Windows là Windows, không phải Linux.

Bấm X ẩn xuống khay và tiếp tục theo dõi; menu khay có Mở dashboard, Thử thông báo, Đổi máy chủ, Thoát. Mở app lần hai focus instance cũ. Token chỉ ở RAM; mở lại/reload cần đăng nhập. Chỉ URL được lưu. IP đổi thì đổi URL; backend phải cho phép origin web mới trong CORS.

Thông báo theo dõi API alarm trong 24 giờ gần nhất, mỗi lượt khoảng 5 giây và có backoff khi lỗi mạng. Lượt đầu không thông báo lịch sử. Click toast mở bộ lọc thiết bị, không ACK. Tối đa 3 toast/lượt, nhiều hơn gom một toast. Không nhận khi app đã Thoát hoặc chưa đăng nhập. Toast thử được ghi rõ, không chứng minh ESP32 đang kết nối. Bản demo dùng HTTP LAN riêng; chưa có ký số, auto-update hoặc auto-start.

## Build

Node 22+, trong `desktop`: `npm ci`, `npm test`, `npm run dist:win` trên Windows x64. Bản Electron/builder được pin trong lockfile. Người cài không cần Node. GitHub Actions **Windows app** chạy ngay trên nhánh `feat/windows-app`; tải artifact ZIP của push commit, giải nén, đối chiếu `manifest.json` và `SHA256SUMS.txt`, chạy `.exe`. Artifact giữ 30 ngày và cần đăng nhập GitHub/quyền repo để tải. Chưa cần merge PR.

Frontend Linux phải được build/deploy cùng thay đổi bridge; app sẽ báo không theo dõi nếu web chưa tích hợp. Test/lint/build web riêng trong `frontend`. Phần mềm và installer phải kiểm thử trên Windows đã cài; unit tests không thay thế kiểm chứng toast/tray. Kết quả thực tế ghi trong `docs/PROJECT-FINISH-STATUS.md`.
