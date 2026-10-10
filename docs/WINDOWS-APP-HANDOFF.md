# Bàn giao triển khai app Windows — 2026-10-11

## 1. Phạm vi và quyền đã có

Người dùng hiện chỉ yêu cầu lập kế hoạch; chỉ bắt đầu triển khai khi người dùng giao model tiếp theo thực hiện. Trả lời tiếng Việt ngắn, dễ hiểu. Dùng ponytail; thao tác giao diện bằng computer-use, đọc thêm gui-envsteal và wm-ops trước khi điều khiển desktop. Không spawn agent nếu chưa được yêu cầu.

Đã được phép sửa code, kiểm thử, push nhánh, tạo PR, build file tải từ GitHub, cài/chạy trên Windows VM, quay demo và gửi video kèm tin nhắn tới nhóm Messenger **sonnet4.5** và cá nhân **thùy anh**. Trước gửi phải kiểm tra đúng tên/người/nhóm và nội dung. Không xin phép lại các việc này; không tự merge PR.

ESP32 vẫn chạy nhưng **khác mạng với Linux, hiện không kết nối backend này được** (người dùng xác nhận). Không tự đổi firmware, mạng, mật khẩu hay cấu hình thiết bị để vượt trở ngại. Tiếp tục toàn bộ phần mềm, cài VM, demo và gửi video; ghi rõ chưa nghiệm thu cảnh báo mới từ ESP32 thật. Không cần chờ ESP32 để hoàn thành phần độc lập.

## 2. Trạng thái đã kiểm tra

- GitHub: https://github.com/thinhnguyen672007-alt/Legacy-link . PR #80 đã merge vào `origin/main` `2ecc859`.
- Repo gốc: `/home/james/Projects/Hackathon DENSON/Legacy-link-`, đang ở `fix/frontend-navigation-test-build` `03910b8`; main local còn `b72c91f`. Source đã có bản sửa của PR #80. Trước khi viết tài liệu này working tree sạch.
- Worktree `/home/james/Projects/Hackathon DENSON/Legacy-link-demo`: `fix/hide-api-address-and-ai-denso` `d48bfde`, sạch nhưng cũ. Không dùng nhánh này làm nền Windows.
- Chưa có `desktop/`, nhánh Windows hay workflow build Windows. Có vài worktree prunable; không cần dọn chúng.
- Stack gốc đang healthy; `http://localhost:8080/health` và `/api/health/ready` trả 200. IP wlan0 lần kiểm tra này `192.168.1.13`; kiểm lại lúc thực thi.
- Windows VM container `omarchy-windows` đang chạy; RDP localhost 3389, console 8006. Chưa kiểm tra lại bên trong VM ở lượt lập kế hoạch.
- Người dùng đã đăng nhập GitHub Desktop và clone repo tại `C:\Users\docker\Documents\GitHub\Legacy-link`. Git từng được cài sau đó; kiểm tra lại nếu cần, không clone/login lại mặc định. Build qua Actions nên VM không bắt buộc có Node/Git.
- Desktop dự kiến: workspace 1 Codex, 2 Zen/Messenger, 3 Windows VM. Xác minh cửa sổ và môi trường GUI mới, không dùng địa chỉ cửa sổ hoặc file /tmp cũ.
- Giữ bàn phím ảo Windows: chỉ ẩn/minimize, **không bấm X, không đóng process**; người dùng nhắc rằng đóng sẽ không bật lại được bằng cách thao tác hiện tại. Nếu computer-use bị cancelled, không bypass; chỉ resume theo lệnh tiếp tục của người dùng.
- Người dùng đã cung cấp tài khoản app `admin` và mật khẩu trong cuộc trò chuyện. Dùng thông tin đó khi kiểm thử, không hỏi lại nếu context vẫn có. Không chép mật khẩu vào tài liệu, code, shell history, log, PR, screenshot hoặc video; đăng nhập trước khi quay. Nếu thông tin không còn trong context thì hỏi riêng, không đoán/reset mật khẩu.
- `.env` thật nằm ở `Legacy-link-/infrastructure/.env`, Git ignore. Không in/commit bí mật, không tạo lại env hoặc rotate credentials. Không đưa Gemini key vào desktop.

Đọc `PROJECT-FINISH-PLAN.md`, `PROJECT-FINISH-STATUS.md` trước khi sửa. Phần chặng C trong PLAN là thiết kế nền. Một số dòng STATUS cũ còn ghi Gemini chưa có key, đã được các mục cuối đính chính; không làm lại AI/web/backend.

## 3. Quyết định kiến trúc

Chọn **Electron + electron-builder, installer NSIS Windows x64**, xác nhận kiến trúc Windows trước khi build. Lý do: tái sử dụng JavaScript và web hiện có, có tray/notification, build trên Actions Windows, giảm số công nghệ cần tích hợp. Chấp nhận dung lượng Electron; không tuyên bố đây là installer nhỏ nhất. Chọn phiên bản Electron còn được hỗ trợ khi thực thi, pin qua lockfile; không đoán phiên bản từ tài liệu cũ.

Installer chứa shell desktop, trang setup local, icon và logic nền. Dashboard tải từ URL web Linux, API cùng origin `/api`. Không nhét React thứ hai vào installer. Backend Linux phải chạy và Windows phải truy cập được. Không dùng localhost trong VM để chỉ Linux; nhập URL LAN thực sự truy cập được.

Luồng: cài → nhập URL web → kiểm tra web/API → đăng nhập bằng UI/tài khoản hiện có → dashboard. Lưu URL vào cấu hình userData; chỉ giữ token trong RAM. Đổi URL qua menu riêng của app và trang setup local, không thêm địa chỉ API vào topbar web. HTTP LAN là giới hạn demo; không tắt kiểm tra chứng chỉ hoặc webSecurity.

## 4. Thực hiện theo thứ tự

### A. Chuẩn bị nhánh và kiểm tra nền

1. Kiểm tra status cả hai checkout, fetch origin, đọc các commit mới nếu main tiếp tục thay đổi. Giữ tài liệu bàn giao local này và mọi thay đổi của người khác.
2. Ở repo gốc, nếu sạch ngoài tài liệu này: chuyển main rồi fast-forward origin/main, tạo `feat/windows-app`. Nếu nhánh đã tồn tại, kiểm tra và tiếp tục đúng công việc thay vì ghi đè/reset. Commit tài liệu cùng nhánh triển khai. Không sửa worktree demo cũ.
3. Kiểm tra cổng/IP, health web/API, Windows architecture và đường kết nối từ VM. Không restart stack chỉ để kiểm tra. Không ghi telemetry cũ là dữ liệu live.
4. Đọc session/auth/API alarm thực tế. `frontend/src/session.tsx` giữ session trong React; `pages/Alarms.tsx` hiện chỉ đọc query param device lúc mount. API `/alarms` phân trang timestamp+ID, tối đa 500/trang, cửa sổ tối đa 31 ngày.
5. Kiểm POST đăng nhập qua đúng URL mà VM sử dụng: GET health thành công chưa chứng minh CORS/login đúng. Nếu IP đổi và origin mới bị chặn, giữ các origin hợp lệ cũ, bổ sung đúng origin vào cấu hình hiện có rồi recreate riêng API khi cần; không wildcard/tắt auth. Không mặc định URL ngrok của Hoàng Anh trỏ tới backend này.

### B. Shell desktop tối thiểu

Tạo `desktop/package.json`, lockfile, `main.cjs`, `preload.cjs`, `alarms.cjs`, trang setup local, assets icon, tests và README. Có thể tách URL/security helpers nếu cần test rõ, không thêm framework UI.

- Setup: nhập origin HTTP/HTTPS, loại credential/query/hash và path ngoài root; normalize dấu slash. Kiểm tra health có timeout, báo lỗi dễ hiểu, có Thử lại/Đổi địa chỉ. Không lưu URL hỏng thay cấu hình đang dùng trước khi người dùng xác nhận kết nối.
- BrowserWindow: nodeIntegration false, contextIsolation true, sandbox true. Chặn popup, điều hướng origin lạ, permission không dùng; giữ webSecurity. Trang cấu hình local có CSP và preload riêng hoặc kiểm quyền theo trang.
- IPC chỉ expose thao tác cần thiết. Kiểm sender/window/main frame/origin chính xác, validate payload. Trang web không được gọi shell/file/fetch tùy ý hoặc sửa URL máy chủ.
- Với trang setup local, xác minh đúng webContents/main frame và URL tài nguyên local đã định trước; không cho phép mọi trang có origin `null`. Nếu mở setup bằng cửa sổ phụ, chỉ xóa phiên cũ khi thực sự áp dụng server mới; hủy setup giữ dashboard đang chạy.
- Chỉ một instance; mở lần hai focus cửa sổ cũ. X ẩn xuống tray và giải thích một lần. Tray: Mở dashboard, trạng thái theo dõi, Thử thông báo, Đổi máy chủ, Thoát. Quit thoát thật; app đóng hoàn toàn thì không hứa nhận cảnh báo.
- Dùng icon app/tray rõ trên Windows, lấy thương hiệu sẵn có. Đặt appId/AppUserModelID nhất quán với NSIS và shortcut Start Menu. Kiểm notification trên **bản đã cài**, không chỉ electron dev.
- Renderer reload/crash/đổi server: hủy polling và token cũ; yêu cầu đăng nhập lại khi mất session. Mạng lỗi tạm thời chỉ cập nhật trạng thái, không tự reload dashboard làm mất phiên/bản nháp.

### C. Tích hợp web và session

- Thêm typed bridge tùy chọn `window.legacyDesktop`; browser không có bridge vẫn hoạt động bình thường.
- Đồng bộ session mới, logout, hết phiên/thu hồi, đổi mật khẩu tới main. Chỉ bắt đầu theo dõi sau khi hoàn tất bắt buộc đổi mật khẩu. Main nhận token phiên trong RAM, tự suy ra endpoint từ server đã chọn; không nhận URL API tùy ý từ renderer.
- Main 401 phải thông báo frontend xóa đúng phiên đó; dùng generation/session identity để lỗi phiên cũ không xóa phiên mới. Không gửi token qua redirect; request alarm dùng redirect error.
- Notification click gửi event hẹp về React router, không `loadURL` cả dashboard. Chuyển tới `/alarms?device=...`; đổi filter ngay cả khi đã đứng ở `/alarms`, reset cursor và các filter đang che alarm. Toast tổng hợp mở danh sách phù hợp. Click toast cũ sau logout/đổi server không khôi phục phiên hoặc mở máy ở server khác.
- Có trạng thái Đang theo dõi/Mất kết nối/Cần đăng nhập/Theo dõi chậm dễ xem trong app. Nếu web chưa có bridge integration, báo rõ không theo dõi được thay vì hiện đang hoạt động.
- Test browser không bridge, đồng bộ session, StrictMode/cleanup listener và click hai máy liên tiếp ở cùng route.
- Đồng bộ cùng token/server phải idempotent: render lại hoặc StrictMode không được reset baseline hay tạo nhiều timer. Cleanup listener tách khỏi logout thực sự. Chỉ chuyển route nội bộ không làm ngừng polling; reload tài liệu mới là mất session. Nếu click notification lúc listener chưa sẵn sàng, giữ một đích chờ theo đúng phiên và gửi khi frontend ready.

### D. Theo dõi và thông báo

- Timer nối tiếp khoảng 5 giây ở **main process**, không phụ thuộc tab ẩn. Timeout + abort/generation khi logout/đổi server. Không chồng lượt request.
- Mỗi lượt lấy đủ trang alarm trong 24 giờ với from/to cố định, không lọc chỉ unacknowledged vì ACK có thể thay đổi. ID giữ chuỗi, dedupe theo ID; không chuyển sang Number.
- Lượt đầy đủ đầu tiên lập baseline, không thông báo lịch sử. Các lượt sau bắt ID mới kể cả event tới trễ còn trong cửa sổ. Giữ baseline qua lỗi mạng; chỉ cập nhật sau lượt đầy đủ, JSON hợp lệ. Prune ID hết cửa sổ.
- Giới hạn tài nguyên/payload và phát hiện cursor lặp. Nếu dữ liệu quá lớn, báo theo dõi chậm/chưa hoàn tất, không ghi thành công sau khi cắt trang. Không thay backend để thêm streaming ở chặng này.
- Tối đa 3 toast/lượt; nếu nhiều hơn dùng một toast tổng hợp. Nội dung chỉ dùng deviceId/code/severity/value thật; không tự suy ra đơn vị/ngưỡng. Không tự ACK.
- 401: ngừng và báo hết phiên một lần; 403: ngừng/báo quyền; lỗi mạng/5xx: backoff 5/10/20/40/60s; 429: tôn trọng Retry-After trong giới hạn hợp lý.
- Test quan trọng: baseline, trùng ID và ID lớn, phân trang, event trễ, lỗi giữa lượt, JSON sai, 401/403/429, logout/đổi server khi request đang chạy, nhiều alarm, notification click phiên cũ.

### E. Kiểm tra, deploy bridge, build và GitHub

1. Chạy test logic desktop; toàn bộ frontend test/lint/build. Sửa lỗi trước push, không chỉ kiểm build như PR #80 lượt đầu.
2. Build/deploy **riêng frontend** từ nhánh mới để web Linux có bridge integration. Xác minh Compose dùng env/context gốc. Không chạy setup nâng cấp toàn stack, không migrate DB hoặc dừng Windows VM cho thay đổi chỉ frontend.
3. Thêm `.github/workflows/windows-app.yml`: push nhánh `feat/windows-app` (và các lần push sửa), pull_request với paths phù hợp; thêm workflow_dispatch nhưng không phụ thuộc nó vì workflow mới chưa có ở main. Windows runner, npm ci, tests, electron-builder `--win nsis --x64 --publish never`.
4. Artifact gồm installer `.exe`, SHA-256 và manifest version/source commit; tên chứa version/commit. Quyền workflow tối thiểu contents read. Upload artifact để browser đăng nhập GitHub trên VM tải ZIP và giải nén `.exe`; không cần chờ merge hoặc tạo release công khai. Dùng lockfile và ghi lệnh rebuild.
   Build nguồn nhánh và manifest phải khớp nhau; PR workflow mặc định có thể checkout merge commit tạm, không ghi nhầm là head commit. Ưu tiên artifact của push trên nhánh cho demo. Đặt thời gian lưu artifact rõ ràng (ví dụ 30 ngày), gửi link trang run/artifact, báo người tải cần đăng nhập GitHub và quyền repo nếu có; không gọi link này là tải vĩnh viễn.
5. Push `feat/windows-app`, tạo PR thường hướng main, ghi hành vi mới và các kiểm thử đã thực sự chạy. Chờ Actions, tải đúng artifact của commit mới nhất. Sửa lỗi và push tiếp nếu build/test thất bại; không tự merge.

### F. Nghiệm thu Windows bằng computer-use

Đọc skills, lấy GUI environment, xác nhận workspace/window. Kiểm GitHub login hiện có (phamTuan207), không tự đổi tài khoản. Tải qua browser VM như người dùng yêu cầu; không giả định file/automation cũ còn tồn tại. Không đóng bàn phím ảo.

Checklist bắt buộc trên installer đã cài:

| Tình huống | Kết quả cần thấy |
| --- | --- |
| Cài và mở | Shortcut/icon/version đúng; không cần Node |
| URL sai/server không tới | Lỗi rõ, sửa URL và retry được |
| Đăng nhập | Tài khoản/role hiện có; dữ liệu lịch sử backend thật, trạng thái thiết bị offline/stale trung thực |
| Thử thông báo | Toast Windows ghi rõ THÔNG BÁO THỬ; bấm mở app |
| X và tray | Cửa sổ ẩn, app còn chạy, toast thử vẫn hoạt động |
| Mở lần hai | Một instance, focus cửa sổ cũ |
| Logout/hết phiên | Theo dõi ngừng, không toast dữ liệu của phiên cũ |
| Đổi URL | Token/baseline server cũ bị bỏ; đăng nhập lại đúng server |
| Server/mạng lỗi và phục hồi | Báo mất kết nối rồi phục hồi, không spam lịch sử |
| Quit rồi mở lại | Thoát thật; URL còn, mật khẩu/token không lưu |
| Alarm thật từ ESP32 | CHƯA NGHIỆM THU khi ESP32 khác mạng |

Không dừng backend live để giả mất mạng; dùng URL sai hoặc kiểm thử mạng cô lập trong VM phù hợp. Notification không hiện thì kiểm Windows Do Not Disturb/notification settings; không tự đổi preference người dùng nếu cần lựa chọn của họ. Thiếu mật khẩu thật thì hỏi người dùng, không reset tài khoản hoặc thay bằng token rồi gọi là login pass.

Kiểm hết phiên 401 bằng test tự động/môi trường riêng; trên live có thể đăng xuất/thu hồi chính phiên thử qua luồng sẵn có. Không đổi mật khẩu admin hoặc khóa tài khoản để tạo lỗi. Đổi URL sai chỉ kiểm trang setup, **không thay thế** test mất mạng giữa phiên; ghi riêng kết quả nào đã thực sự thử. Nếu tắt mạng VM để thử, phải có đường điều khiển độc lập và khôi phục, không làm mất RDP đang là đường điều khiển duy nhất.

Kiểm thử dữ liệu giả chỉ dùng môi trường riêng/test tự động, không chèn alarm giả vào DB/MQTT live. Test notification chỉ chứng minh đường app → Windows; không chứng minh ESP32 → backend → notification. Nếu ESP32 trở lại cùng mạng, đối chiếu telemetry mới rồi mới thử alarm mới; không tự thay ngưỡng/profile. Nếu vẫn khác mạng, hoàn tất video/gửi với giới hạn nêu rõ.

### G. Video và gửi Messenger

1. Quay ngay trên VM qua computer-use: mở app, đăng nhập sẵn hoặc tránh quay mật khẩu; dashboard/dữ liệu lịch sử thực, trạng thái thiết bị hiện tại; AI DENSO nếu backend trả được; X xuống tray; THÔNG BÁO THỬ Windows; click trở về app; menu đổi server; Quit. Không quay key, env hoặc password.
2. Giữ video gốc và tạo bản x5 bằng công cụ video sẵn có, kiểm tra tốc độ/thời lượng và phát lại trước gửi. Có thể tắt audio ở bản x5; không cần thêm pipeline quay phức tạp. Ghi chú trong clip hoặc tin nhắn rằng toast là thử và ESP32 khác mạng.
   Xác minh chỗ lưu và cách đưa video từ VM sang Linux/Zen trước lúc quay (thư mục Shared nếu thực sự truy cập được, hoặc cách chuyển file sẵn có). Quay nội dung VM; file clip cuối phải mở được từ hộp chọn tệp của Zen. Chọn MP4 H.264/yuv420p để dễ gửi, phát lại cả clip gốc và x5. Không quay cả desktop chứa chat/mật khẩu. Clip đi nhanh vẫn phải đọc được nội dung chính; dùng tin nhắn kèm để giải thích giới hạn.
3. Sang Zen workspace 2, xác nhận đúng nhóm **sonnet4.5** và cá nhân **thùy anh**. Gửi clip x5 kèm tin nhắn ngắn tới cả hai, dùng quyền đã có. Kiểm tra video đã upload/gửi xong ở từng cuộc trò chuyện, không kết luận từ việc chỉ chọn file. Nếu lỗi upload thì sửa/retry có kiểm tra tránh gửi trùng.
4. Tin nhắn mẫu, chỉ giữ tính năng đã đạt: “Đã demo app Windows Legacy-link: cài .exe, kết nối server Linux, chạy nền ở tray và thông báo thử Windows. [Link tải bản build]. ESP32 hiện khác mạng nên chưa kiểm chứng cảnh báo mới từ thiết bị thật; dữ liệu đang xem là lịch sử trên backend. Đổi mạng nhớ cập nhật địa chỉ server.” Thêm AI DENSO nếu đã demo thành công. Nếu có lỗi chưa sửa, nói đúng lỗi.
5. Cập nhật STATUS, PR description và README với version/commit, workflow/artifact, kết quả Windows VM, đường video, bằng chứng gửi và phần còn chờ. Không đưa nội dung Messenger riêng tư vào repo công khai. Báo cáo cuối ngắn: link PR, link tải, test đã đạt, đã gửi cho ai, ESP32 thật chưa nghiệm thu.

## 5. Tiêu chí kết thúc

Hoàn tất phần mềm khi có installer từ GitHub cài/chạy được trên VM, test đạt, tray và toast thử Windows hoạt động, lỗi kết nối/session xử lý được, video x5 gửi xong đúng hai cuộc trò chuyện, tài liệu/PR cập nhật. **Gate cảnh báo từ ESP32 thật vẫn pending** cho tới khi có bằng chứng mới; không gọi toàn bộ phần cứng đã nghiệm thu.

Không thêm auto-update, auto-start Windows, lưu mật khẩu, tự dò mạng, cloud, Rust/Tauri, backend mới hay AI mới. Không dọn worktree/volume hoặc đổi thông tin đăng nhập ngoài phạm vi.

## 6. Tài liệu chính thức cần đối chiếu lúc thực thi

- https://www.electronjs.org/docs/latest/tutorial/security
- https://www.electronjs.org/docs/latest/tutorial/notifications
- https://www.electron.build/docs/nsis/
- https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts

Prompt bàn giao: “Đọc docs/WINDOWS-APP-HANDOFF.md, PROJECT-FINISH-PLAN.md và PROJECT-FINISH-STATUS.md. Thực hiện kế hoạch Windows từ A đến G, dùng ponytail và computer-use đúng chỗ. ESP32 khác mạng nên chưa nghiệm thu alarm phần cứng, nhưng tiếp tục installer/VM/video/gửi Messenger đúng quyền đã có. Giữ dữ liệu/bí mật/VM, tạo feat/windows-app, push và PR, không merge. Ghi kết quả thật sau mỗi chặng.”
