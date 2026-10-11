# Reload và chuyển về màn hình đăng nhập — 2026-10-11

## Nguyên nhân đã tái hiện

Chromium thật, backend `accounts-integration.mjs --serve` và PostgreSQL riêng, Vite 127.0.0.1:5174. Tạo employee qua UI admin, logout, đăng nhập employee, đổi mật khẩu bắt buộc. Không dùng mock auth, không sửa tài khoản/live DB.

Sau đổi mật khẩu, `.ll-morph-surface` còn class `collapsed`, computed width 228px trên viewport 1440px. Hero/card opacity vẫn 1, filter none; nền root `styles.css` #f5f6f8 lộ ra ngoài nền đã thu nhỏ, tạo khối trắng và cảm giác form mờ. `App` giữ `collapsing=true` từ animation đăng nhập; chỉ nút đăng xuất thường xóa cờ đó. Không còn `.dashboard-page-outgoing`, viewport hay animation dashboard: nghi vấn clone/minHeight không phải nguyên nhân ở lượt tái hiện.

Đổi mật khẩu trả 200 và backend xóa mọi session của user. `/auth/logout` sau đó trả 401; `request` chỉ throw ApiError, `.catch` ở disconnect không gọi expire hoặc set session. Đây là response đã dự kiến, không phải nguồn của lỗi CSS. Test 401 muộn của phiên cũ vẫn qua.

Reload mất phiên được PR #84 (`5b9ceb7`) sửa và merge trong lúc kiểm thử. Đã fast-forward nhánh lên main mới, bỏ implementation session trùng của lượt này. Giữ nguyên session-storage/restore mới của main, và chạy lại hồi quy reload trên bản kết hợp. PR này chỉ sửa trạng thái chuyển cảnh và thêm bằng chứng/test, không thay cơ chế token của main.

## Sửa dùng chung

- `frontend/src/App.tsx`: kết thúc cờ đăng nhập khi session đã có; mọi đường mất session cùng mở lại nền. Nút logout thường dùng cùng disconnect; CSS và thời lượng chuyển cảnh không đổi.
- `accounts.test.tsx`, `navigation-motion.test.tsx`: hồi quy forced password, unmount giữa animation cancel cả hai animation, remove clone và reset minHeight.
- `frontend/scripts/auth-transition-browser.mjs`: hồi quy DOM/CSS bằng Chromium thật, tài khoản/database test riêng.

## Kết quả

Frontend: `npm test` 99/99; `npm run typecheck`, `npm run lint`, `npm run build` PASS. Build còn warning chunk >500kB đã có trước. Backend `npm run test:accounts` PASS migration/login/first password change/roles/revocation/logout/expiry.

Browser script PASS 13 lần kiểm form sạch trên desktop 1440×1000, mobile 390×844 và reduced motion: logout thường, bắt buộc đổi mật khẩu, reload sau logout, reload giữ phiên/giữ yêu cầu đổi mật khẩu; thêm đổi mật khẩu thường/thu hồi phiên trên desktop và logout giữa chuyển trang trên mobile. Width đo theo clientWidth (loại scrollbar), không còn class collapsed, clone, viewport/minHeight hay animation dashboard ở màn hình login. Form trống, hero/card opacity 1, session storage đã xóa. Không có pageerror.

Chạy lại: `node backend/scripts/accounts-integration.mjs --serve`; lấy API loopback được in, chạy Vite với `VITE_API_BASE_URL=<API>` và `--port 5174`; chạy script với `AUTH_TEST_API=<API>`, `PLAYWRIGHT_MODULE=<module playwright>`; tùy chọn `AUTH_TEST_HEADED=1`, `AUTH_TEST_OUTPUT=<thư mục>`. API test chỉ bind loopback, script chỉ chấp nhận API 127.0.0.1; dùng tài khoản owner/mật khẩu test trong script, không dùng credentials live.

[DOM trước](evidence/auth-transitions/before-dom.json), [13 kết quả sau](evidence/auth-transitions/dom-results.json).

Trước sửa:

![Login lỗi sau đổi mật khẩu](evidence/auth-transitions/before-password-logout.png)

Sau sửa:

![Login sạch sau đổi mật khẩu](evidence/auth-transitions/after-password-logout.png)

Chưa deploy lên ngrok Hoàng Anh hoặc cập nhật stack live. Bằng chứng browser ở môi trường local test riêng; không khẳng định ngrok đã cập nhật.
