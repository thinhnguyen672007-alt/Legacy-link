#!/usr/bin/env bash
# ==============================================================================
# [NOTE] One-Shot Infrastructure Setup (setup.sh)
#
# Role: gom toàn bộ quy trình dựng hạ tầng thành MỘT lệnh, thay vì 6 lệnh rời.
# Trước đây người mới clone repo về phải chạy:
#     cp .env.example .env
#     ./scripts/setup-mosquitto-auth.sh
#     docker compose up -d
#     ./scripts/test-mqtt.sh
#     docker compose exec -T postgres psql ... < ../backend/db/schema.sql
#     docker compose exec -T postgres psql ... < ../backend/db/seed-demo.sql
# Script này làm hết, và dừng lại ngay khi bước nào thất bại.
#
# Usage:
#   ./scripts/setup.sh          # broker + database + consumer + API
#   ./scripts/setup.sh --seed   # kèm dữ liệu mẫu (demo)
#   ./scripts/setup.sh --seed-bench  # BENCH-01 voi gateway ID that
#   ./scripts/setup.sh --help
#
# Runbook: docs/runbook.md Mục 2
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# 1. Tham số dòng lệnh
# ------------------------------------------------------------------------------
# - Vì sao parse ở đây chứ không để trong hàm: Bash không có hàm `fail` sẵn,
#   mà script này cố tình tuyến tính (đọc từ trên xuống) để người đọc theo dõi
#   được đúng thứ tự thực thi.
#
# - `for arg in "$@"`: duyệt từng tham số. Dấu "$@" trong ngoặc kép là BẮT BUỘC:
#   không có dấu nháy thì mỗi tham số chứa khoảng trắng sẽ bị tách thành nhiều.
# - `case`: so khớp từng mẫu. `*)` là trường hợp còn lại — dùng cho cả 2 việc:
#   in hướng dẫn và báo lỗi, vì cả hai đều phải kết thúc bằng `exit 2` (2 là
#   mã thoát chuẩn của Bash cho "dùng sai cú pháp", khác với 1 = lỗi chạy được).
# - `-h|--help`: hai dấu gạch ngang cách nhau nghĩa là "hoặc".
# ------------------------------------------------------------------------------
WANT_SEED=false
WANT_BENCH=false

for arg in "$@"; do
  case "$arg" in
    --seed) WANT_SEED=true ;;
    --seed-bench) WANT_BENCH=true ;;
    -h|--help)
      sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "[ERROR] Khong hieu tham so: '$arg'" >&2
      echo "        Dung: $0 [--seed] [--seed-bench] | $0 --help" >&2
      exit 2
      ;;
  esac
done

# ------------------------------------------------------------------------------
# 2. Đường dẫn tuyệt đối
# ------------------------------------------------------------------------------
# Cùng idiom với test-mqtt.sh: ${BASH_SOURCE[0]} cho biết chính file này đang
# chạy, nên đường dẫn đúng dù gọi từ bất kỳ đâu. `cd ... && pwd` chuẩn hoá
# thành đường dẫn tuyệt đối.
# ------------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

# Mọi lệnh `docker compose` dưới đây PHẢI chạy trong thư mục chứa
# docker-compose.yml. `cd` một lần ở đây thay vì lặp `cd` mỗi lệnh — và cũng
# là lý do `set -e` không làm hỏng script khi lệnh sau thất bại.
cd "$INFRA_DIR"

# ------------------------------------------------------------------------------
# 3. Biến môi trường (.env)
# ------------------------------------------------------------------------------
# - `if [ -f .env ]`: chỉ tạo khi CHƯA có. Không ghi đè file cũ — trong đó có
#   cảng mật khẩu người dùng đã sửa. Đây là điểm khác biệt quan trọng nhất so
#   với `cp -n` hay `cp` thẳng: `cp` không có điều kiện, sẽ nghĩa là xoá sạch
#   cấu hình của họ.
# - Vì sao `set -e` không giết script khi chưa có .env: lệnh `cp` nằm trong
#   nhánh `then` của if, tức là trong "điều kiện", nên lỗi của nó không kích
#   hoạt -e. (Ngược lại, `source .env` không có if sẽ chết ngay.)
# ------------------------------------------------------------------------------
if [ -f .env ]; then
  echo "[INFO] Da co .env, giu nguyen cau hinh hien tai."
else
  cp .env.example .env
  echo "[INFO] Da tao .env tu .env.example."
fi

# Nạp .env để script tự lấy tên container, port, tài khoản. `set -u` ở trên có
# nghĩa là biến chưa set sẽ báo lỗi ngay, nên `:-` là bắt buộc cho mọi biến.
#
# Vì sao `-u` KHÔNG làm hỏng `source`: file .env tự gán giá trị cho chính nó
# (`FOO=bar` là gán, không phải đọc), nên không biến nào bị đọc trước khi gán.
requested_profiles="${COMPOSE_PROFILES:-}"
# shellcheck disable=SC1091
source .env
export COMPOSE_PROFILES="${requested_profiles:-${COMPOSE_PROFILES:-full}}"
# Generate the API write token locally; never print it or commit the real .env.
if [[ ",$COMPOSE_PROFILES," == *,full,* ]] && [ -z "${API_WRITE_TOKEN:-}" ]; then
  umask 077
  API_WRITE_TOKEN="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  if grep -q '^API_WRITE_TOKEN=' .env; then
    sed -i "s/^API_WRITE_TOKEN=.*/API_WRITE_TOKEN=$API_WRITE_TOKEN/" .env
  else
    printf '\nAPI_WRITE_TOKEN=%s\n' "$API_WRITE_TOKEN" >> .env
  fi
  chmod 600 .env
  echo "[INFO] Da tao API_WRITE_TOKEN trong .env."
fi
if [ "$WANT_BENCH" = true ] && ! [[ "${BENCH_GATEWAY_ID:-}" =~ ^[A-F0-9]{12}$ ]]; then
  echo "[ERROR] --seed-bench can BENCH_GATEWAY_ID (12 ky tu HEX hoa doc tu USB)." >&2
  exit 1
fi
if [[ ",$COMPOSE_PROFILES," == *,full,* ]] && [ ! -s ../backend/db/schema.sql ]; then
  echo "[ERROR] Profile full can backend/db/schema.sql." >&2
  exit 1
fi

# DATABASE_URL is interpolated in Compose; refuse unescaped URL delimiters.
for key in POSTGRES_USER POSTGRES_PASS POSTGRES_DB; do
  value="${!key:-}"
  if [ -n "$value" ] && ! [[ "$value" =~ ^[a-zA-Z0-9_.~-]+$ ]]; then
    echo "[ERROR] $key chi ho tro chu/so va _ . ~ - trong cau hinh hien tai." >&2
    exit 1
  fi
done
if [[ ",$COMPOSE_PROFILES," == *,full,* ]] && ! [[ "$API_WRITE_TOKEN" =~ ^[a-fA-F0-9]{32,128}$ ]]; then
  echo "[ERROR] API_WRITE_TOKEN can 32-128 ky tu hex; de rong de tu tao." >&2
  exit 1
fi

MQTT_CONTAINER_NAME="${MQTT_CONTAINER_NAME:-legacy-link-mosquitto}"
POSTGRES_USER="${POSTGRES_USER:-legacy_admin}"
POSTGRES_DB="${POSTGRES_DB:-legacy_link}"

# ------------------------------------------------------------------------------
# 4. Precondition: Docker phải chạy
# ------------------------------------------------------------------------------
# Kiểm tra TRƯỚC khi làm bất cứ việc gì, vì nếu không có Docker thì mọi bước
# sau đều thất bại theo dây chuyền với lỗi khó hiểu (vd "bind source path does
# not exist" chứ không phải "docker không chạy").
#
# `command -v docker > /dev/null 2>&1`: thành công khi tìm thấy lệnh. Phần
# `> /dev/null` chặn không cho "docker" in ra màn hình.
#
# Dấu `!` trước `command -v` trong `if !` nghĩa là "nếu KHÔNG tìm thấy" thì
# vào nhánh then. Tương tự `if ! docker ps | grep -q ...` trong test-mqtt.sh.
# ------------------------------------------------------------------------------
if ! command -v docker > /dev/null 2>&1; then
  echo "[ERROR] Khong tim thay lenh 'docker'." >&2
  echo "        Cai Docker Engine truoc, xem: https://docs.docker.com/engine/install/" >&2
  exit 1
fi

# `docker info` la cach kiem tra DAEM (daemon) co chay hay khong.
# `command -v docker` chi kiem tra binary co trong PATH — daemon co the da
# tat. Chuyen tiep `> /dev/null 2>&1` de loi cua daemon khong lam nhieu man hinh.
if ! docker info > /dev/null 2>&1; then
  echo "[ERROR] Docker daemon khong phan hoi." >&2
  echo "        Bat Docker Desktop, hoac khoi dong docker service:" >&2
  echo "          sudo systemctl start docker" >&2
  exit 1
fi

echo "[INFO] Docker san sang."

# ------------------------------------------------------------------------------
# 5. Tạo file mật khẩu MQTT
# ------------------------------------------------------------------------------
# GIAI THÍCH VÌ SAO BƯỚC NÀY PHẢI CHẠY TRƯỚC `docker compose up`:
#
# docker-compose.yml mount `mosquitto/config/passwd` với
# `create_host_path: false`. Cờ đó là CHỐT CHẶN: nếu file chưa tồn tại, daemon
# TỪ CHỐI tạo container với lỗi
#     invalid mount config for type "bind": bind source path does not exist
# và dừng luôn — chưa tới bước khởi động. File passwd bị .gitignore nên không
# có trong repo, tức mỗi máy đều phải tự tạo.
#
# Service `mosquitto-init` chỉ kiểm tra file này đã đúng chưa (exit 1 nếu
# thiếu), chứ không tự tạo. Nên không có cách nào để bỏ qua bước này mà vẫn
# có broker.
#
# `|| exit 1`: nếu script con thất bại thì dừng. Không có `||` này, `set -e`
# cũng lo, nhưng viết tường minh để người đọc thấy ý định.
# ------------------------------------------------------------------------------
echo "[INFO] Tao file mat khau MQTT..."

# PHAT HIEN THU MUC TRONG KHI LA FILE — phai kiem TRUOC khi goi script con.
#
# Neu bo qua check nay, setup-mosquitto-auth.sh se chay `mosquitto_passwd -c`
# vao mot duong dan la thu muc. Loi tra ve luc do la:
#     Error: Unable to open file /mosquitto/config/passwd for writing. File exists.
# Dong "File exists" doc len nhu the da co file bi trung — nguoi doc se tim
# ve phia "cap nhat tai khoan" ma khong bao gio nghi den vi duong dan dang la
# thu muc. O day ta chan no lai va noi dung nguyen nhan.
#
# `-d` kiem tra la THU MUC. `-f` o nhanh else phia duoi la FILE THUONG, nen
# hai nhanh loai truu nhau het: thu muc vao day, moi thu khac vao kia.
if [ -d mosquitto/config/passwd ]; then
  echo "[ERROR] mosquitto/config/passwd la THU MUC, khong phai file." >&2
  echo "[ERROR] Neu bi Docker tu tao (create_host_path bi bo), xoa no roi chay lai:" >&2
  echo "[ERROR]   rm -rf mosquitto/config/passwd" >&2
  exit 1
elif [ ! -f mosquitto/config/passwd ]; then
  echo "[INFO]        Chua co passwd -> tao moi."
else
  echo "[INFO]        Da co passwd -> cap nhat tai khoan."
fi

./scripts/setup-mosquitto-auth.sh > /dev/null || {
  echo "[ERROR] Tao mat khau MQTT that bai." >&2
  exit 1
}

# ------------------------------------------------------------------------------
# 6. Khởi động dịch vụ
# ------------------------------------------------------------------------------
# `-d` (detached): chạy nền, terminal trả lại quyền. Không có -d thì lệnh treo
# cho tới khi bấm Ctrl+C.
#
# LỖI ĐÃ BIẾT, xem runbook Mục 9 Lỗi 4: nếu `create_host_path: false` được
# bỏ đi trong lúc nâng cấp, lệnh này sẽ tạo một THƯ MỤC rỗng tên `passwd`,
# và mosquitto chết với "Unable to open pwfile". Kiểm tra sau khi up để chặn
# trường hợp đó sớm.
# ------------------------------------------------------------------------------
# Build before stopping workers, so a failed build does not interrupt ingestion.
docker compose config --quiet
if [[ ",$COMPOSE_PROFILES," == *,full,* ]]; then
  docker compose build backend-consumer backend-api
fi
# C7-C10 replaces uniqueness keys: old workers must not write during migration.
docker compose stop backend-consumer backend-api api-gateway
echo "[INFO] Khoi dong ha tang..."
docker compose up -d --wait --wait-timeout 90 postgres
# Password generator can replace the mounted file inode: recreate broker to reload.
docker compose up -d --force-recreate --wait --wait-timeout 90 mosquitto || {
  echo "[ERROR] 'docker compose up -d' that bai." >&2
  echo "        Doc log: docker compose logs" >&2
  exit 1
}

if [ -d mosquitto/config/passwd ]; then
  echo "[ERROR] mosquitto/config/passwd dang la THU MUC, khong phai file." >&2
  echo "        Nguyen do: 'create_host_path' bi bo, Docker tu tao thu muc." >&2
  echo "        Sua: xoa thu muc do roi chay lai script nay." >&2
  echo "          rm -rf mosquitto/config/passwd" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 7. Chờ Postgres sẵn sàng (bounded wait)
# ------------------------------------------------------------------------------
# VÌ SAO PHẢI CHỜ:
# Postgres sau khi bật listener vẫn còn vài giây để tạo database và chạy
# script khởi tạo. Nếu bước 8 nạp schema chạy luôn, psql sẽ bị từ chối và
# schema KHÔNG được tạo — mà lỗi đó rất dễ bỏ qua vì nhìn tổng thể vẫn thấy
# container "Up".
#
# VÌ SAO LẶP THAY VÌ MỘT LẦN `sleep`:
# Sleep cứng (vd `sleep 10`) chậm trên máy nhanh, vẫn hụt trên máy yếu, và
# không cho biết đang chờ gì. Lặp có điều kiện thì vừa nhanh vừa chắc.
#
# `pg_isready` tra loi DANG SANG SANG, không phải "database đã đúng schema".
# Nó nằm sẵn trong image postgres nên không cài gì thêm.
#
# `docker compose exec -T`: -T tat pseudo-terminal, bat buoc de khong bị treo.
# ------------------------------------------------------------------------------
echo "[INFO] Cho Postgres san sang (toi da 60 giay)..."

ready=false
for _ in $(seq 1 30); do
  # `if docker compose exec ...` thay vi chay thang: lenh nam trong dieu kien
  # nen fail khong lam script dung ngay — vay duoc lap lai o vong sau.
  if docker compose exec -T postgres \
       pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done

if [ "$ready" != true ]; then
  echo "[ERROR] Postgres khong san sang sau 60 giay." >&2
  echo "        Doc log: docker compose logs postgres" >&2
  exit 1
fi

echo "[INFO]        Postgres OK."
# Keep a recoverable copy before any SQL upgrade; backups/ is gitignored.
./scripts/backup-db.sh


# ------------------------------------------------------------------------------
# 8. Nạp schema
# ------------------------------------------------------------------------------
# Schema belongs to backend; apply via stdin with ON_ERROR_STOP.
# Full profile requires the backend directory from the same repo revision.
BACKEND_DIR="$(cd .. 2>/dev/null && pwd || echo "")"
SCHEMA="$BACKEND_DIR/backend/db/schema.sql"
SEED="$BACKEND_DIR/backend/db/seed-demo.sql"

echo "[INFO] Nap schema..."

if [ ! -d "$BACKEND_DIR/backend" ]; then
  # Không phải lỗi: checkout riêng nhánh infra không co backend/. Broker va
  # database van dung duoc, chi la chua co bang.
  echo "[INFO]        Checkout khong co backend/ (chi co infrastructure/)."
  echo "[INFO]        Bo qua buoc nap schema. Database se con rong."
  echo "[INFO]        Khi can: chay lai script nay tu nhanh co backend/."
elif [ -d "$SCHEMA" ]; then
  # Trường hợp Docker (hoặc ai do) tạo nhầm thư mục thay vì file.
  echo "[ERROR]       $SCHEMA la THU MUC, khong phai file." >&2
  echo "[ERROR]       Xoa no roi chay lai script nay:" >&2
  echo "[ERROR]         rm -rf '$SCHEMA'" >&2
  exit 1
elif [ ! -s "$SCHEMA" ]; then
  # -s: file co noi dung khac rong. File rong hoac khong ton tai deu sai.
  echo "[ERROR]       Khong tim thay schema hoac file rong: $SCHEMA" >&2
  exit 1
else
  # `-v ON_ERROR_STOP=1` là mấu chốt:
  # Mặc định psql gặp câu SQL lỗi vẫn TIẾP TỤC câu sau và thoát với mã 0 —
  # nghĩa là script này sẽ báo thành công dù schema chỉ tạo được một nửa.
  # Bắt buộc phải có.
  #
  # `< "$SCHEMA"` (redirect stdin) thay cho `-f "$SCHEMA"` (truyền đường dẫn):
  # đường dẫn phía trong container khác với phía trên host, nên phải nạp
  # qua stdin thay vì để psql tự mở file bên trong container.
  docker compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$SCHEMA" \
    || {
      echo "[ERROR] Nap schema that bai." >&2
      exit 1
    }

  # Xac nhan bang cach dem bang thuc te, khong tin log.
  table_count="$(docker compose exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('telemetry','machine_state','alarms','device','register_map','register_override','config_request','service_run','ingestion_receipt','consumer_health')" \
    2>/dev/null | tr -d '[:space:]' || echo 0)"

  echo "[INFO]        Da nap schema. So bang trong database: ${table_count:-0}"

  if [ "${table_count:-0}" -ne 10 ]; then
    echo "[ERROR]       Schema chua du 10 bang can cho backend hien tai." >&2
    exit 1
  fi
fi

# ------------------------------------------------------------------------------
# 9. Dữ liệu mẫu (tùy chọn)
# ------------------------------------------------------------------------------
# Tách riêng khỏi bước 8 vì nạp seed KHÔNG phải lúc nào cũng muốn: dữ liệu mẫu
# có 2 máy CNC giả, đúng cho demo, nhưng thừa khi bạn đang debug một máy thật.
#
# Kiểm tra file TRƯỚC khi khởi động dịch vụ thì không còn ý nghĩa ở đây (dịch
# vụ đã chạy), nên chỉ báo lỗi và dừng — người dùng biết ngay seed hỏng thay
# vì nghĩ nó thành công.
# ------------------------------------------------------------------------------
if [ "$WANT_SEED" = true ]; then
  echo "[INFO] Nap du lieu mau..."

  if [ ! -s "$SEED" ]; then
    echo "[ERROR]       --seed yeu cau file: $SEED" >&2
    echo "[ERROR]       File khong ton tai hoac rong." >&2
    exit 1
  fi

  docker compose exec -T postgres \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" < "$SEED" \
    || {
      echo "[ERROR] Nap du lieu mau that bai." >&2
      exit 1
    }

  echo "[INFO]        Da nap du lieu mau."
fi

if [ "$WANT_BENCH" = true ]; then
  docker compose exec -T postgres sh -c 'exec psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v gateway_id="$1"' sh "$BENCH_GATEWAY_ID" < ../backend/db/seed-bench.sql
fi

# Chỉ bật/rebuild consumer sau khi schema và seed đã nạp thành công.
# Profile broker giữ Node chạy ngoài Docker; profile full bật consumer.
echo "[INFO] Build va khoi dong cac dich vu da chon..."
docker compose up -d --wait --wait-timeout 120

# ------------------------------------------------------------------------------
# 10. Kiểm tra broker
# ------------------------------------------------------------------------------
echo "[INFO] Kiem tra broker..."
if ! ./scripts/test-mqtt.sh; then
  echo "[WARN] Broker chua the truy cap. Xem dong ERROR o tren." >&2
  echo "[WARN] Dung chay lai: docker compose logs mosquitto" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 11. Tóm tắt
# ------------------------------------------------------------------------------
echo ""
echo "[SUCCESS] Ha tang da san sang."
echo ""
echo "  Broker   : $MQTT_CONTAINER_NAME (port ${MQTT_PORT:-1883})"
echo "  Database : $POSTGRES_USER@$POSTGRES_DB (port ${POSTGRES_PORT:-5432}, chi localhost)"
if [ "${table_count:-0}" -gt 0 ]; then
  echo "  Bang     : ${table_count} bang trong schema public"
else
  echo "  Bang     : chua nap schema (checkout nay khong co backend/)"
fi
echo ""
if [[ ",$COMPOSE_PROFILES," == *,full,* ]]; then
  echo "  API      : http://${HTTP_BIND_ADDRESS:-127.0.0.1}:${HTTP_PORT:-3000}"
  echo "  Write auth: Bearer API_WRITE_TOKEN (trong .env, khong in ra log)"
fi
echo "  Kiem tra : ./scripts/status.sh"
echo "  Xem trang thai : docker compose ps"
echo "  Xem log broker : docker compose logs -f mosquitto"
echo "  Doc log Postgres: docker compose logs -f postgres"
