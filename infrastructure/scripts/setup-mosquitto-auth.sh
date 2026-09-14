#!/usr/bin/env bash
# ==============================================================================
# [NOTE] Script Cấu Hình Xác Thực Cho Mosquitto (setup-mosquitto-auth.sh)
#
# Vai trò: Script hỗ trợ tạo hoặc cập nhật file mật khẩu đã hash `passwd` cho Mosquitto.
# Sử dụng container Docker chạy tạm (ephemeral container) để lập trình viên
# không cần phải cài đặt công cụ `mosquitto_passwd` trực tiếp trên máy của mình.
#
# Cách dùng:
#   chmod +x ./scripts/setup-mosquitto-auth.sh
#   ./scripts/setup-mosquitto-auth.sh [username] [password]
#
# Nếu không truyền tham số, script sẽ lấy giá trị từ `.env` hoặc giá trị mặc định.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Thiết lập Shebang (dòng 1: #!/usr/bin/env bash)
# ------------------------------------------------------------------------------
# - Cú pháp: #! (Shebang) khai báo trình thông dịch cho file script.
# - Tại sao dùng '/usr/bin/env bash' thay vì '/bin/bash':
#   * Trên nhiều hệ điều hành (macOS, FreeBSD, một số bản Linux), bash có thể nằm ở
#     /usr/local/bin/bash hoặc /opt/homebrew/bin/bash chứ không phải /bin/bash.
#   * Dùng 'env bash' giúp tìm vị trí bash theo biến môi trường $PATH của hệ thống,
#     đảm bảo script chạy được trên mọi máy.
# - NẾU THIẾU DÒNG NÀY:
#   * Hệ điều hành sẽ dùng shell mặc định của user (có thể là sh, dash, zsh...).
#   * Các cú pháp đặc thù của Bash (như pipefail, parameter expansion nâng cao)
#     sẽ bị báo lỗi cú pháp "Syntax error".
# - NẾU VIẾT KHÁC ĐI:
#   * Viết '#!/bin/sh': Chạy theo chuẩn POSIX shell tối giản, không hỗ trợ 'pipefail' hay mảng.
#   * Viết '#!/bin/bash': Chạy tốt trên đa số Ubuntu/Debian, nhưng dễ lỗi trên macOS.

# ------------------------------------------------------------------------------
# 2. Thiết lập chế độ nghiêm ngặt (Strict Mode) cho Bash
# ------------------------------------------------------------------------------
# - Cú pháp: set -euo pipefail
#   * -e (errexit): Dừng script ngay lập tức nếu bất kỳ lệnh nào trả về exit code khác 0.
#   * -u (nounset): Dừng script và báo lỗi nếu truy cập vào biến chưa từng được khai báo.
#   * -o pipefail: Trong chuỗi pipe (A | B | C), nếu A hoặc B lỗi, cả chuỗi tính là lỗi
#     (mặc định Bash chỉ lấy kết quả của lệnh cuối cùng C).
# - NẾU THIẾU DÒNG NÀY:
#   * Mặc định Bash rất "lỳ": Dù lệnh 'docker run' phía dưới bị thất bại (ví dụ do chưa bật Docker),
#     script vẫn sẽ thản nhiên chạy tiếp các lệnh sau và in ra "[SUCCESS]", khiến bạn lầm tưởng
#     đã tạo mật khẩu thành công dù thực tế chưa hề có gì được tạo!
#   * Nếu bạn gõ sai chính tả tên biến, Bash sẽ mặc định coi biến đó là chuỗi rỗng (""),
#     rất dễ dẫn đến các thảm họa như: rm -rf "$THU_MUC_GO_SAI/*" biến thành "rm -rf /*".
# - NẾU VIẾT KHÁC ĐI:
#   * Viết tách: 'set -e; set -u; set -o pipefail' (tương đương nhưng dài hơn).
#   * Không dùng 'set -e': Bạn sẽ phải tự kiểm tra lỗi thủ công sau TỪNG lệnh:
#     docker run ... || { echo "Lỗi rồi!"; exit 1; }
set -euo pipefail

# ------------------------------------------------------------------------------
# 3. Xác định các đường dẫn thư mục an toàn và tuyệt đối
# ------------------------------------------------------------------------------
# - Cú pháp:
#   * ${BASH_SOURCE[0]}: Biến đặc biệt chứa đường dẫn file script đang chạy.
#   * dirname: Lấy ra thư mục chứa file đó.
#   * cd ... && pwd: Di chuyển tạm vào thư mục và in ra đường dẫn tuyệt đối chuẩn (không có ../).
#   * $(): Command substitution, gom kết quả câu lệnh bên trong gán cho biến.
# - NẾU THIẾU DÒNG NÀY (ví dụ hardcode đường dẫn tương đối SCRIPT_DIR="."):
#   * Đường dẫn sẽ bị phụ thuộc hoàn toàn vào vị trí đứng hiện tại của bạn khi gõ lệnh trong terminal!
#   * Nếu bạn đứng ở thư mục gốc project gõ './infrastructure/scripts/setup-mosquitto-auth.sh',
#     thư mục config sẽ bị tạo nhầm ra ngoài thư mục gốc thay vì nằm trong 'infrastructure/'.
# - NẾU VIẾT KHÁC ĐI:
#   * Viết 'dirname $0': Nếu ai đó chạy script bằng 'source script.sh' thay vì './script.sh',
#     $0 sẽ là tên shell ('bash') chứ không phải tên file script, dẫn tới xác định sai đường dẫn.
#   * Viết cố định '/home/james/...': Chỉ chạy được trên máy cá nhân của bạn, đồng đội clone về sẽ lỗi ngay.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Lấy thư mục cha của SCRIPT_DIR (tức thư mục 'infrastructure')
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

# Thư mục chứa cấu hình Mosquitto
CONFIG_DIR="$INFRA_DIR/mosquitto/config"

# Đường dẫn tới file mật khẩu passwd
PASSWD_FILE="$CONFIG_DIR/passwd"

# ------------------------------------------------------------------------------
# 4. Tự động nạp biến môi trường từ file .env (nếu có)
# ------------------------------------------------------------------------------
# - Cú pháp:
#   * [ -f "$INFRA_DIR/.env" ]: Kiểm tra xem file .env có thực sự tồn tại hay không.
#   * source: Đọc file .env và đưa toàn bộ biến vào phiên làm việc hiện tại.
# - NẾU THIẾU DÒNG NÀY:
#   * Script sẽ không thể nhận các cấu hình được định nghĩa sẵn trong file .env
#     (ví dụ MQTT_DEV_USER, MQTT_DEV_PASS).
# - NẾU VIẾT KHÁC ĐI:
#   * Nếu bỏ câu lệnh điều kiện 'if [ -f ... ]' mà gọi thẳng 'source "$INFRA_DIR/.env"':
#     Khi dự án chưa tạo file .env, lệnh source sẽ báo lỗi "No such file or directory"
#     và làm toàn bộ script dừng đột ngột (do có 'set -e' ở trên).
#   * Viết '. "$INFRA_DIR/.env"' (dấu chấm thay cho chữ source): Hoàn toàn tương đương theo chuẩn POSIX.
if [ -f "$INFRA_DIR/.env" ]; then
  # shellcheck disable=SC1091
  source "$INFRA_DIR/.env"
fi

# ------------------------------------------------------------------------------
# 5. Gán Username và Password với cơ chế Fallback (Parameter Expansion)
# ------------------------------------------------------------------------------
# - Cú pháp: ${1:-${MQTT_DEV_USER:-legacy_admin}}
#   * $1: Tham số thứ nhất bạn gõ sau tên script (ví dụ: ./setup.sh admin1 pass1).
#   * :- : Toán tử điều kiện: nếu giá trị bên trái rỗng/chưa có, dùng giá trị bên phải.
#   * Thứ tự ưu tiên: Tham số terminal ($1) -> Biến .env ($MQTT_DEV_USER) -> Mặc định "legacy_admin".
# - NẾU THIẾU CƠ CHẾ NÀY (ví dụ chỉ viết USERNAME="$1"):
#   * Nếu bạn chạy script mà không gõ username (chỉ gõ ./setup.sh), do có cờ 'set -u',
#     script sẽ crash ngay lập tức vì lỗi "1: unbound variable" (biến chưa được định nghĩa).
# - NẾU VIẾT KHÁC ĐI:
#   * Viết bằng if-else truyền thống:
#       if [ -n "${1:-}" ]; then USERNAME="$1"; elif [ -n "${MQTT_DEV_USER:-}" ]; then USERNAME="$MQTT_DEV_USER"; else USERNAME="legacy_admin"; fi
#     -> Cách viết ${1:-...} giúp thu gọn 5 dòng code if-else phức tạp thành đúng 1 dòng duy nhất.
USERNAME="${1:-${MQTT_DEV_USER:-legacy_admin}}"
PASSWORD="${2:-${MQTT_DEV_PASS:-legacy_secret_2026}}"

echo "[INFO] Target password file: $PASSWD_FILE"
echo "[INFO] Creating/updating user: $USERNAME"

# ------------------------------------------------------------------------------
# 6. Đảm bảo thư mục config luôn tồn tại
# ------------------------------------------------------------------------------
# - Cú pháp: mkdir -p "$CONFIG_DIR"
#   * -p (--parents): Tự động tạo các thư mục cha nếu chưa có; và nếu thư mục đã tồn tại
#     sẵn thì bỏ qua, KHÔNG báo lỗi.
# - NẾU THIẾU DÒNG NÀY:
#   * Nếu thư mục 'mosquitto/config' chưa có, lệnh 'docker run -v' phía dưới sẽ khiến Docker
#     tự động tạo ra thư mục đó với quyền của user 'root'. Kết quả là user thường trên máy host
#     sẽ không thể sửa, xóa hay lưu file vào thư mục này được.
# - NẾU VIẾT KHÁC ĐI:
#   * Bỏ cờ '-p' (chỉ viết 'mkdir "$CONFIG_DIR"'):
#     Khi bạn chạy script từ lần thứ 2 trở đi (thư mục đã có sẵn), lệnh mkdir sẽ quăng lỗi
#     "mkdir: cannot create directory ...: File exists" và script dừng lại ngay lập tức.
mkdir -p "$CONFIG_DIR"

# ------------------------------------------------------------------------------
# 7. Khởi chạy Docker Container tạm thời để băm mật khẩu
# ------------------------------------------------------------------------------
# - Tại sao dùng Docker:
#   * Công cụ 'mosquitto_passwd' chỉ có sẵn khi cài đặt Mosquitto lên máy.
#   * Dùng Docker image 'eclipse-mosquitto:2' chạy tạm giúp bất kỳ ai có Docker đều dùng được
#     mà không cần cài thêm gói phần mềm nào vào máy thật.
#
# - BÀI TOÁN "CON GÀ VÀ QUẢ TRỨNG" (Tại sao không dùng 'docker compose exec'):
#   * Lệnh 'docker compose exec mosquitto mosquitto_passwd ...' bắt buộc container
#     'mosquitto' chính PHẢI ĐANG CHẠY thì mới exec (chui vào trong) được.
#   * Nhưng khi mới clone dự án về, mosquitto.conf yêu cầu file mật khẩu (password_file).
#     Nếu CHƯA CÓ file passwd, container Mosquitto sẽ CRASH/TẮT NGAY LẬP TỨC khi vừa khởi động!
#   * Khi container đã sập, bạn KHÔNG THỂ dùng 'docker compose exec' để tạo file được!
#     (Muốn bật container thì phải có passwd, nhưng muốn tạo passwd bằng exec thì container phải bật).
#   -> GIẢI PHÁP: Dùng 'docker run --rm' tạo một container "thợ phụ" độc lập hoàn toàn,
#      sinh ra file passwd trước. Khi file đã nằm an toàn trên đĩa cứng máy host,
#      container Mosquitto chính mới có thể khởi động êm đẹp.
#
# - BÓC TÁCH CHI TIẾT TỪNG THÀNH PHẦN TRONG CÂU LỆNH:
#   docker run --rm -v "$CONFIG_DIR":/mosquitto/config eclipse-mosquitto:2 \
#     mosquitto_passwd -c -b /mosquitto/config/passwd "$USERNAME" "$PASSWORD"
#
#   1. docker run:
#      Tạo và khởi chạy một container mới từ image chỉ định.
#   2. --rm (remove):
#      Tự động XÓA SẠCH container này ngay sau khi lệnh kết thúc.
#      -> NẾU THIẾU '--rm': Mỗi lần đổi pass sẽ để lại 1 container rác (Exited) trong máy,
#         lâu ngày làm tràn ổ cứng.
#   3. -v "$CONFIG_DIR":/mosquitto/config (volume mount):
#      Cú pháp: -v ĐƯỜNG_DẪN_MÁY_HOST:ĐƯỜNG_DẪN_TRONG_CONTAINER
#      Ánh xạ thư mục config trên máy thật vào bên trong container.
#      -> NẾU THIẾU '-v': File passwd được tạo ra sẽ chỉ nằm bên trong container tạm và
#         biến mất vĩnh viễn ngay khi container bị xóa!
#   4. eclipse-mosquitto:2:
#      Tên Docker Image làm môi trường chạy (đã chứa sẵn binary mosquitto_passwd).
#   5. mosquitto_passwd:
#      Tên chương trình được gọi bên trong container (ghi đè lệnh mặc định của image).
#   6. -c (Create):
#      Tạo mới file passwd. Nếu file đã tồn tại sẽ XÓA TRẮNG nội dung cũ để ghi lại từ đầu.
#   7. -b (Batch mode):
#      Chế độ tự động, cho phép truyền trực tiếp username và password ngay trên dòng lệnh.
#      -> NẾU THIẾU '-b': Lệnh sẽ dừng lại bắt bạn gõ mật khẩu 2 lần bằng tay trên terminal,
#         không thể tự động hóa trong CI/CD hay scripts.
#   8. /mosquitto/config/passwd:
#      Đường dẫn file mật khẩu bên TRONG container (do đã mount từ $CONFIG_DIR ở máy host).
#   9. "$USERNAME" "$PASSWORD":
#      Tham số truyền vào, luôn đặt trong dấu ngoặc kép để tránh lỗi nếu chứa ký tự đặc biệt.
if [ ! -f "$PASSWD_FILE" ]; then
  echo "[INFO] File does not exist. Creating new password file..."
  touch "$PASSWD_FILE"
  
  # Trường hợp 1: File passwd CHƯA có -> Dùng cờ '-c' để tạo mới
  # NẾU VIẾT KHÁC ĐI (bỏ cờ -c khi file chưa có): Một số phiên bản mosquitto_passwd sẽ báo lỗi
  # không tìm thấy file để cập nhật.
  docker run --rm -v "$CONFIG_DIR":/mosquitto/config eclipse-mosquitto:2 \
    mosquitto_passwd -c -b /mosquitto/config/passwd "$USERNAME" "$PASSWORD"
else
  # Trường hợp 2: File passwd ĐÃ có từ trước -> KHÔNG DÙNG cờ '-c'
  echo "[INFO] Updating existing password file..."
  
  # NẾU VIẾT SAI (vẫn để cờ -c ở đây):
  # Toàn bộ các user đã tạo trước đó (ví dụ user 'legacy_admin') sẽ bị XÓA SẠCH,
  # chỉ còn lại duy nhất một user mới vừa thêm!
  docker run --rm -v "$CONFIG_DIR":/mosquitto/config eclipse-mosquitto:2 \
    mosquitto_passwd -b /mosquitto/config/passwd "$USERNAME" "$PASSWORD"
fi

# ------------------------------------------------------------------------------
# 8. Phân quyền truy cập file passwd (chmod 0644)
# ------------------------------------------------------------------------------
# - Cú pháp: chmod 0644 "$PASSWD_FILE"
#   * Số 6 (Owner): Đọc & Ghi (4 + 2 = 6).
#   * Số 4 (Group): Chỉ đọc (4).
#   * Số 4 (Others): Chỉ đọc (4).
# - NẾU THIẾU DÒNG NÀY:
#   * File do Docker tạo ra có thể mang quyền '0600' (chỉ chủ sở hữu đọc được).
#   * Khi container Mosquitto chính thức khởi động dưới user nội bộ 'mosquitto' (UID 1883),
#     nó sẽ bị lỗi "Error: Unable to open pwfile ... Permission denied" và tắt ngay lập tức!
# - NẾU VIẾT KHÁC ĐI:
#   * Viết 'chmod 777': Cấp quyền quá mức cho phép (bất kỳ ai/tiến trình nào cũng sửa hoặc xóa được),
#     vi phạm nguyên tắc bảo mật.
#   * Viết 'chmod 700': Mosquitto container chạy với UID 1883 sẽ không đọc được file nếu file thuộc sở hữu của user máy host (UID 1000).
chmod 0644 "$PASSWD_FILE"

echo "[SUCCESS] Password file successfully configured at: $PASSWD_FILE"
echo "[NOTE] Reminder: '$PASSWD_FILE' is ignored by Git to protect secrets."
