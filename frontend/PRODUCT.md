# Legacy-link
<!-- impeccable:product-schema 1 -->
## Platform
web
## Stack
React, TypeScript, Vite; hướng A và P0 được người dùng duyệt 10/10/2026.
## Users
Người vận hành kiểm tra thiết bị, số đo và cảnh báo; kỹ thuật viên cấu hình gateway.
## Product Purpose
Quan sát dữ liệu máy cũ qua ESP32 và đọc thử cấu hình trước khi áp dụng.
## Operating Context
Demo khoảng 20/10/2026 trên máy backend chạy Docker Compose. Chưa chốt URL thực tế; mặc định localhost:3000. Bằng chứng phần cứng hiện có là ESP32 + simulator, không phải CNC/RS-485 công nghiệp.
## Capabilities and Constraints
HTTP bearer token đọc/ghi, không có tài khoản; token chỉ trong bộ nhớ. Queue RAM mất mẫu khi mất điện. 202 chưa hoàn tất; persisted và restoredAfterRestart là bằng chứng riêng. Không mock tự động, không sửa backend/firmware/infra, không push/merge khi chưa yêu cầu.
## Brand Commitments
Tiếng Việt, hướng Sổ vận hành nền sáng/chàm đã duyệt. Dễ đọc, trạng thái có chữ + icon. Không phải sản phẩm DENSO chính thức.
## Accessibility & Inclusion
Keyboard/focus, form có label, reduced motion, desktop/laptop/mobile.
