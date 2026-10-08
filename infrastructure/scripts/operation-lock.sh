# File này được source sau khi cd vào infrastructure/, không chạy riêng.
# Setup có thể dừng worker/migrate DB; recovery test có thể ngắt mạng.
# Chỉ cho một thao tác giữ khóa để hai script không phá trạng thái của nhau.
acquire_operation_lock() {
  # mkdir là thao tác giành khóa: cùng tên thư mục thì chỉ một tiến trình tạo được.
  # Khóa cũ không tự bị xóa; cần kiểm tra PID đã ngừng nếu máy từng mất nguồn.
  if ! mkdir .operation-lock 2>/dev/null; then
    echo '[ERROR] Another setup/recovery operation holds .operation-lock.' >&2
    echo 'Check its owner file and running process before removing a stale lock.' >&2
    return 1
  fi
  # Lưu ai giữ khóa và lúc bắt đầu, giúp phân biệt script đang chạy với khóa bỏ sót.
  printf 'pid=%s\noperation=%s\nstarted=%s\n' "$$" "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > .operation-lock/owner
}
# Chỉ gọi sau khi script này giành khóa thành công. Xóa owner rồi xóa thư mục rỗng;
# rmdir sẽ báo lỗi nếu có nội dung bất thường thay vì xóa cả cây thư mục.
release_operation_lock() {
  rm -f .operation-lock/owner
  rmdir .operation-lock
}
