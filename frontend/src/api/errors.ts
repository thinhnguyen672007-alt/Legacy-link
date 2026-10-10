export function explainError(detail: string) {
  const known: Record<string, string> = {
    "Authentication required":
      "Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.",
    "Change your temporary password first":
      "Cần đổi mật khẩu tạm trước khi sử dụng hệ thống. Mở mục Đổi mật khẩu.",
    "Administrator permission required":
      "Thao tác này cần tài khoản Admin. Liên hệ quản trị viên nếu cần thay đổi tài khoản.",
    "Write permission required":
      "Thao tác này cần quyền Technician hoặc Admin. Tài khoản Viewer chỉ được xem dữ liệu.",
    "Device ID đã thuộc gateway khác; cần quy trình chuyển thiết bị riêng":
      "Mã thiết bị đã thuộc gateway khác. Chọn mã mới để đăng ký máy mới; không dùng lại mã này để chuyển gateway.",
    "HTTP server is disconnected from MQTT":
      "Backend đang mất kết nối với broker. Kiểm tra dịch vụ broker rồi thử lại sau khi kết nối phục hồi.",
    "Operation capacity reached; retry later":
      "Hệ thống đang xử lý quá nhiều thao tác. Chờ các thao tác hiện tại kết thúc rồi thử lại.",
    "Invalid gateway ID":
      "Mã gateway không hợp lệ. Chọn gateway từ danh sách đang kết nối.",
    "Invalid credentials":
      "Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản đã bị khóa. Kiểm tra lại hoặc liên hệ quản trị viên.",
    "Current password is incorrect":
      "Mật khẩu hiện tại không đúng. Nhập lại mật khẩu đang dùng để đăng nhập.",
    "Username already exists":
      "Tên đăng nhập đã tồn tại. Chọn tên khác hoặc đặt lại mật khẩu cho tài khoản đó.",
    "Password must contain at least 12 characters and at most 256 UTF-8 bytes":
      "Mật khẩu cần ít nhất 12 ký tự và tối đa 256 byte. Ký tự có dấu có thể chiếm nhiều byte.",
    "Username must contain 3–48 letters, digits, dots, underscores or hyphens":
      "Tên đăng nhập cần 3–48 ký tự: chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang; bắt đầu bằng chữ hoặc số.",
    "Use 1–31 letters, digits, hyphens or underscores for device ID":
      "Mã thiết bị cần 1–31 ký tự: chữ không dấu, số, gạch ngang hoặc gạch dưới.",
    "Machine name is required (maximum 47 UTF-8 bytes)":
      "Tên thiết bị không được trống và tối đa 47 byte. Tên có dấu có thể chiếm nhiều byte; hãy rút ngắn tên.",
    "Invalid Modbus communication settings":
      "Thông số Modbus không hợp lệ. Kiểm tra slave (1–247), baud rate, parity, stop bits (1 hoặc 2) và chu kỳ đọc (100–86400000 ms).",
    "Provide 1–16 registers": "Cấu hình cần từ 1 đến 16 thông số cần đọc.",
    "Choose distinct valid metric keys":
      "Tên Metric phải khác nhau, bắt đầu bằng chữ không dấu và chỉ chứa chữ, số hoặc gạch dưới; tối đa 19 ký tự.",
    "Configuration exceeds the ESP32 4095-byte limit":
      "Cấu hình quá lớn cho ESP32. Giảm số thông số hoặc rút ngắn tên rồi kiểm tra lại.",
    "Gateway is not reporting. Connect the updated ESP32 firmware first.":
      "Gateway chưa gửi trạng thái mới. Kiểm tra nguồn ESP32, Wi-Fi và kết nối broker rồi đọc thử lại.",
    "This gateway is busy with another operation":
      "Gateway đang xử lý thao tác khác. Đọc lịch sử gateway và chờ thao tác đó kết thúc.",
    "Another gateway reports this machine ID. Choose a unique machine ID.":
      "Mã thiết bị này đang được gateway khác sử dụng. Chọn mã máy khác để đăng ký máy mới.",
    "Read this exact configuration again before applying it":
      "Kết quả đọc thử đã hết hạn, cấu hình đã đổi hoặc gateway đã restart. Kiểm tra và đọc thử lại trước khi áp dụng.",
    "Resolve failed register reads before applying":
      "Có thanh ghi không đọc được. Sửa thông số báo lỗi và đọc thử lại trước khi áp dụng.",
    "Confirm the out-of-range readings before applying":
      "Có số đo ngoài khoảng dự kiến. Đối chiếu số đo rồi xác nhận cảnh báo trước khi áp dụng.",
    "Operation not found or expired; inspect the gateway state":
      "Không tìm thấy thao tác hoặc thao tác đã hết hạn. Đọc lịch sử và trạng thái gateway để đối chiếu trước khi gửi lại.",
    "ESP32 did not finish the test read in time.":
      "ESP32 không hoàn tất đọc thử trong thời gian chờ. Kiểm tra kết nối và lịch sử gateway trước khi thử lại.",
    "No final acknowledgement. Application outcome is unknown; check gateway state before retrying.":
      "Chưa nhận được xác nhận áp dụng cuối cùng. Cấu hình có thể đã thay đổi; đối chiếu trạng thái và lịch sử gateway trước khi gửi lại.",
    "Applied in RAM, but ESP32 flash storage failed. It may be lost after restart.":
      "Cấu hình đã chạy nhưng chưa lưu được vào flash. Có thể mất sau restart; kiểm tra thiết bị trước khi tiếp tục.",
    "ESP32 applied; catalog could not be saved safely. Inspect gateway and probe again.":
      "ESP32 đã áp dụng nhưng backend chưa lưu được cấu hình. Đối chiếu gateway và lịch sử thao tác trước khi đọc thử lại.",
    "MQTT publication failed; check gateway state before retrying":
      "Không xác nhận được việc gửi lệnh qua broker. Kiểm tra trạng thái và lịch sử gateway trước khi gửi lại.",
  };
  if (Object.hasOwn(known, detail)) return known[detail];
  const invalidRegister = /^Invalid register settings for (.+)$/.exec(detail);
  if (invalidRegister)
    return `Thông số ${invalidRegister[1]}: kiểm tra địa chỉ thanh ghi, kiểu dữ liệu, hệ số scale, đơn vị và hàm đọc.`;
  const match = /^([^:]+): (.+)$/.exec(detail);
  if (!match) return undefined;
  const fixes: Record<string, string> = {
    "invalid alarm":
      "Ngưỡng cảnh báo không hợp lệ. Kiểm tra ngưỡng cao, độ trễ tái báo không âm, mã và mức cảnh báo.",
    "invalid low alarm":
      "Ngưỡng nhiệt độ thấp không hợp lệ. Kiểm tra ngưỡng thấp, độ trễ tái báo không âm và mức cảnh báo.",
    "invalid metric type":
      "Loại số đo không hợp lệ. Chọn Nhiệt độ hoặc Số đo khác.",
    "minimum exceeds maximum":
      "“Giá trị nhỏ nhất dự kiến” đang lớn hơn “Giá trị lớn nhất dự kiến”. Sửa để giá trị nhỏ nhất không vượt giá trị lớn nhất.",
    "expected range must contain finite numbers":
      "Khoảng dự kiến phải là các số hợp lệ. Kiểm tra lại giá trị nhỏ nhất và lớn nhất.",
    "invalid critical alarm threshold":
      "Ngưỡng nghiêm trọng phải lớn hơn ngưỡng cao và chỉ dùng với mức cảnh báo high.",
    "low threshold must be below high threshold":
      "Ngưỡng cảnh báo thấp phải nhỏ hơn ngưỡng cảnh báo cao.",
    "UNDERHEAT requires a temperature unit":
      "Cảnh báo nhiệt độ thấp cần đơn vị nhiệt độ như C, F hoặc K.",
  };
  return Object.hasOwn(fixes, match[2])
    ? `Thông số ${match[1]}: ${fixes[match[2]]}`
    : undefined;
}

export function modbusReadError(code: number) {
  const messages: Record<number, string> = {
    1: "Thiết bị không hỗ trợ hàm đọc này. Kiểm tra lựa chọn 03/04 theo tài liệu thiết bị.",
    2: "Thiết bị từ chối địa chỉ hoặc số thanh ghi cần đọc. Kiểm tra địa chỉ thô, hàm đọc 03/04 và số thanh ghi theo kiểu dữ liệu trong tài liệu thiết bị hoặc simulator.",
    3: "Thiết bị từ chối tham số yêu cầu đọc. Kiểm tra hàm đọc và kiểu dữ liệu.",
    4: "Thiết bị báo không xử lý được yêu cầu đọc. Kiểm tra trạng thái thiết bị rồi đọc thử lại.",
    224: "Địa chỉ slave trong phản hồi không khớp. Kiểm tra địa chỉ slave đã chọn.",
    225: "Hàm đọc trong phản hồi không khớp yêu cầu. Kiểm tra cấu hình Modbus và thiết bị đang kết nối.",
    226: "Không nhận đủ phản hồi trong thời gian chờ. Kiểm tra nguồn thiết bị, dây kết nối, địa chỉ slave, baud rate và parity.",
    227: "Phản hồi bị lỗi kiểm tra dữ liệu (CRC). Kiểm tra dây kết nối, nhiễu và thông số truyền thông Modbus.",
  };
  return (
    messages[code] ??
    "Chưa có mô tả cho mã lỗi này. Đối chiếu mã với log gateway và tài liệu Modbus của thiết bị."
  );
}
