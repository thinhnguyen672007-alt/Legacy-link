---
{
  "name": "Legacy-link — Sổ vận hành",
  "description": "Giao diện vận hành nền sáng, điều hướng chàm và trạng thái có kiểm chứng.",
  "colors": {
    "accent": "#3446a8",
    "nav": "#253582",
    "ink": "#172033",
    "muted": "#526074",
    "line": "#d7dee7",
    "canvas": "#f5f6f8",
    "surface": "#ffffff",
    "ok": "#147d64",
    "warn": "#9a6700",
    "bad": "#b42318",
    "brand-mark": "#a9efae",
    "field-border": "#bbc5d3",
    "hover": "#edf0f7",
    "table-background": "#fafbfc",
    "disabled-text": "#647084",
    "disabled-background": "#edf0f4"
  },
  "typography": {
    "display": {
      "fontFamily": "\"Be Vietnam Pro\", sans-serif",
      "fontSize": "clamp(32px, 3.6vw, 52px)",
      "fontWeight": 600,
      "lineHeight": 1.35,
      "letterSpacing": "-0.035em"
    },
    "headline": {
      "fontFamily": "\"Be Vietnam Pro\", sans-serif",
      "fontSize": "30px",
      "fontWeight": 600,
      "lineHeight": 1.3,
      "letterSpacing": "-0.025em"
    },
    "title": {
      "fontFamily": "\"Be Vietnam Pro\", sans-serif",
      "fontSize": "19px",
      "fontWeight": 600,
      "lineHeight": 1.45
    },
    "body": {
      "fontFamily": "\"Be Vietnam Pro\", sans-serif",
      "fontSize": "14px",
      "fontWeight": 400,
      "lineHeight": 1.65
    },
    "label": {
      "fontFamily": "\"Be Vietnam Pro\", sans-serif",
      "fontSize": "12px",
      "fontWeight": 500,
      "lineHeight": 1.65
    },
    "badge": {
      "fontFamily": "\"Be Vietnam Pro\", sans-serif",
      "fontSize": "11px",
      "fontWeight": 500,
      "lineHeight": 1.5
    },
    "mono": {
      "fontFamily": "\"IBM Plex Mono\", monospace",
      "fontSize": "0.9em"
    }
  },
  "rounded": {
    "field": "6px",
    "control": "7px",
    "status-strip": "10px",
    "radius": "12px"
  },
  "spacing": {
    "px-6": "6px",
    "px-8": "8px",
    "px-12": "12px",
    "px-16": "16px",
    "px-20": "20px",
    "px-24": "24px",
    "px-28": "28px",
    "px-36": "36px",
    "px-48": "48px"
  },
  "components": {
    "button-primary": {
      "backgroundColor": "{colors.accent}",
      "textColor": "{colors.surface}",
      "rounded": "{rounded.control}",
      "padding": "9px 14px"
    },
    "button-primary-hover": {
      "backgroundColor": "{colors.nav}",
      "textColor": "{colors.surface}"
    },
    "button-secondary": {
      "backgroundColor": "{colors.surface}",
      "textColor": "{colors.ink}",
      "rounded": "{rounded.control}",
      "padding": "9px 14px"
    },
    "button-quiet": {
      "backgroundColor": "transparent",
      "textColor": "{colors.ink}",
      "rounded": "{rounded.control}",
      "padding": "9px 14px"
    },
    "field": {
      "backgroundColor": "{colors.surface}",
      "textColor": "{colors.ink}",
      "rounded": "{rounded.field}",
      "padding": "9px 11px",
      "width": "100%"
    },
    "navigation-item": {
      "rounded": "{rounded.control}",
      "padding": "12px 15px"
    },
    "navigation-active": {
      "backgroundColor": "{colors.surface}",
      "textColor": "{colors.nav}",
      "rounded": "{rounded.control}",
      "padding": "12px 15px"
    },
    "status-ok": {
      "textColor": "{colors.ok}",
      "typography": "{typography.badge}"
    },
    "surface": {
      "backgroundColor": "{colors.surface}",
      "rounded": "{rounded.radius}"
    },
    "dialog": {
      "backgroundColor": "{colors.surface}",
      "rounded": "{rounded.radius}",
      "padding": "30px",
      "width": "min(580px, calc(100vw - 32px))"
    }
  }
}
---

# Design System: Legacy-link — Sổ vận hành

## Overview

**Creative North Star: "Sổ vận hành"**

Sổ vận hành là một giao diện sáng, gọn và có mật độ phù hợp để đọc dữ liệu thiết bị. Chàm tạo vùng định hướng; nền trắng, đường kẻ mảnh và chữ tối giúp đọc liên tục giữa danh sách, chi tiết và biểu mẫu.

Tiếng Việt là ngôn ngữ chính. Dữ liệu, thời điểm cập nhật và kết quả thao tác được đặt trong cùng ngữ cảnh; trạng thái dùng chữ và biểu tượng SVG. Giao diện dùng CSS và SVG, không có raster thuộc bản phát hành.

**Key Characteristics:**

- Nền sáng trung tính, vùng điều hướng chàm, bề mặt trắng có viền mảnh.
- Be Vietnam Pro cho nội dung; IBM Plex Mono cho mã và định danh.
- Trạng thái có chữ và biểu tượng; số liệu trong bảng dùng chữ số có độ rộng bằng nhau.
- Bố cục thu gọn theo chiều rộng; ưu tiên đường kẻ và màu nền để chia vùng.

## Colors

Chàm định hướng thao tác, nền sáng giữ bảng dễ đọc; màu trạng thái có vai trò ngữ nghĩa riêng. Giá trị chuẩn nằm trong frontmatter.

### Primary

- **Chàm thao tác — accent:** nút chính, liên kết, tab đang chọn và đường biểu đồ.
- **Chàm điều hướng — nav:** sidebar, phần giới thiệu kết nối và nền hover của nút chính.

### Secondary

- **Xanh xác nhận — ok, hổ phách — warn, đỏ lỗi — bad:** nhãn trạng thái và tình trạng API; các khối thông báo có tông nền/viền riêng ghi trong CSS của sidecar.
- **Xanh nhận diện — brand-mark:** biểu tượng nhãn hiệu. Xanh nhận diện sáng tách biệt với xanh trầm của trạng thái tích cực; không dùng xanh trạng thái làm màu trang trí.

### Neutral

- **Mực — ink, chữ phụ — muted:** nội dung chính và chú thích.
- **Nền trang — canvas, bề mặt — surface:** phân biệt vùng làm việc và khối nội dung.
- **Đường phân chia — line, viền trường — field-border:** cấu trúc bảng và điều khiển.
- **Nền hover — hover, nền bảng — table-background:** phản hồi thao tác và đầu bảng.
- **Chữ/nền vô hiệu — disabled-text, disabled-background:** nút tạm không thao tác được, cùng opacity trong CSS.

**The Trạng thái có chữ Rule.** Màu trạng thái đi cùng nhãn tiếng Việt và biểu tượng; màu xanh không tự chứng minh kết quả của một thao tác.

## Typography

**Display Font / Body Font:** Be Vietnam Pro, dự phòng sans-serif.
**Label/Mono Font:** IBM Plex Mono, dự phòng monospace, dành cho mã và định danh.

**Character:** Kiểu chữ hỗ trợ tiếng Việt; tiêu đề vừa phải, nội dung nhỏ nhưng thoáng dòng. Phông được đóng gói bằng Fontsource trong `src/main.tsx`, gồm Be Vietnam Pro 400/500/600/700 và IBM Plex Mono 400.

### Hierarchy

- **Display:** tiêu đề giới thiệu trang kết nối; dùng vai trò display trong frontmatter, chuyển thành 30px ở màn hình nhỏ.
- **Headline:** tiêu đề trang; chuyển thành 26px ở màn hình nhỏ.
- **Title:** tiêu đề khối; tiêu đề cấp ba dùng 15px/600. Trang kết nối có tiêu đề form 27px, thành 23px trên điện thoại.
- **Body:** nội dung mặc định; đoạn văn tối đa 75ch, bảng dùng 13px, chú thích 12px.
- **Label:** nhãn trong lưới biểu mẫu; nhãn ở trang kết nối dùng 13px. Badge dùng vai trò riêng, không viết hoa hàng loạt.
- **Mono:** cỡ tương đối với vùng chứa; cho phép ngắt mã dài. Các ô số dùng `tabular-nums`; số đo lớn dùng 29px/500, thành 26px trên điện thoại.

**The Mã có kiểu chữ riêng Rule.** Dùng IBM Plex Mono cho mã và định danh; giữ nội dung hướng dẫn ở Be Vietnam Pro.

## Layout

- Khung desktop gồm sidebar 224px và phần nội dung co giãn, sidebar sticky cao 100vh. Nội dung chính tối đa 1600px, căn giữa, padding 38px 36px 56px; topbar cao tối thiểu 76px.
- Ở chiều rộng từ 1600px, padding ngang nội dung tăng thành 48px.
- Ở chiều rộng không quá 1200px, sidebar còn 194px; nội dung dùng padding 28px 24px; bảng giảm padding ô; bộ lọc từ bốn cột thành hai. Vùng cấu hình chính thành một cột và hai khối bên cạnh nằm cạnh nhau, không còn sticky.
- Ở chiều rộng không quá 760px, điều hướng chuyển thành dải ngang trên đầu, sidebar bỏ sticky và ẩn phần chú thích/phần đáy. Nội dung dùng padding 26px 18px 38px; tiêu đề/thao tác xếp dọc.
- Bảng thiết bị trên điện thoại trở thành từng nhóm có nhãn lấy từ `data-label`, ẩn đầu bảng. Các bảng khác giữ vùng cuộn ngang; không suy ra rằng mọi bảng đều đổi thành thẻ.
- Form thông thường và bộ lọc còn hai cột trên điện thoại; khối phụ của cấu hình, phần giải thích và trang kết nối chuyển một cột. Trang kết nối desktop dùng hai cột bằng nhau, form tối đa 420px.
- Bề mặt có phần nội dung padding 24px, giảm còn 18px trên điện thoại; toolbar 20px, giảm còn 16px. Khoảng cách dùng các giá trị thực trong spacing, không áp một lưới khoảng cách cố định cho tất cả thành phần.

## Elevation & Depth

Bề mặt thông thường không có bóng. Nền, viền mảnh và khoảng cách chia vùng; hộp thoại là lớp nổi có lớp phủ và bóng khuếch tán. Tab chọn có vạch dưới được triển khai bằng box-shadow, không phải độ cao.

### Shadow Vocabulary

- **Hộp thoại:** `0 16px 64px #10182e33`; lớp phủ `#10182e80`, z-index lớp phủ/nội dung 30/31.
- **Tab hiện tại:** `0 2px 0 var(--accent)`.

**The Phẳng khi nghỉ Rule.** Bề mặt nội dung dựa vào viền và nền; bóng khuếch tán dành cho hộp thoại, vạch tab biểu thị mục đang chọn.

## Shapes

Bề mặt và hộp thoại dùng radius; trường dùng field, nút/điều hướng/thông báo dùng control. Dải trạng thái có góc riêng status-strip. Viền chủ yếu 1px; số thứ tự bước là hình tròn 28px. Badge trạng thái là chữ kèm biểu tượng, không có viên nền bo tròn.

## Components

### Buttons

Nút phẳng, nhãn rõ, SVG đặt cạnh chữ. Cao tối thiểu 42px, gap 8px; nút chính dùng accent, hover dùng nav. Nút phụ nền trắng; nút nhẹ nền/viền trong suốt, dùng cùng phản hồi hover. Disabled dùng con trỏ không cho phép và opacity 0.75. Vòng focus toàn cục 3px màu `#7389ed`, cách 3px; topbar mobile có nút cao tối thiểu 34px.

### Inputs / Fields

Nhãn hiển thị, trường cao tối thiểu 43px, width 100%, caret chàm. Nhãn và trường cách nhau 6px. Search bọc SVG và input chung viền; placeholder dùng disabled-text. Checkbox native 17px, accent chàm. Không có kiểu lỗi viền trường riêng: lỗi hiện qua khối thông báo.

### Navigation

Liên kết sidebar cao tối thiểu 48px, icon 18px; mục chọn nền trắng/chữ nav/weight 600. Hover mục chưa chọn dùng `#34479b`. Mobile giảm chiều cao tối thiểu 42px. Tab chi tiết dùng `aria-current`, chữ accent và vạch dưới; không xem đây là pill button.

### Chips / Status

Badge là SVG 14px và nhãn tiếng Việt, gap 6px. Tích cực dùng ok, chờ/cũ dùng warn, lỗi dùng bad, chưa rõ/mất liên lạc dùng muted. Badge không tương tác nên không có hover/focus giả. API state cũng có chữ và icon.

### Cards / Containers

Bề mặt trắng, viền line, bo radius, ẩn phần tràn ở khung ngoài. Bảng bên trong có vùng cuộn riêng; hover hàng đổi nền `#fafbff`. Trạng thái rỗng có SVG, tiêu đề và câu hướng dẫn; lỗi tải vẫn nói rõ khi đang giữ bản dữ liệu gần nhất.

### Notices

Khối thông báo có icon 18px, padding 13px 15px, viền 1px, chữ 12px; ba tông info, bad và ok. Tông bad có `role="alert"`; loading dùng `role="status"`. CSS đầy đủ của mẫu info nằm trong sidecar; các tông còn lại được định nghĩa tại `src/styles.css`.

### Dialog / Review

Hộp thoại xác nhận cấu hình dùng Radix Dialog, rộng `min(580px, calc(100vw - 32px))`, cao tối đa 85vh và cuộn dọc. Nội dung đặt giữa màn hình; padding 30px, trên điện thoại 24px 20px. Nút quay lại, xác nhận và đóng có tên rõ; không coi bản HTML minh họa sidecar là thay thế hành vi focus của Radix.

Chuyển màu nền/chữ của nút và liên kết kéo dài 0.15s, chỉ khi người dùng không yêu cầu giảm chuyển động. Hộp thoại hiện không chạy animation; keyframes không dùng không phải token hệ thống.

## Do's and Don'ts

### Do:

- Do giữ trạng thái có chữ kèm SVG và giải thích dữ liệu cũ ngay cạnh dữ liệu đang hiển thị.
- Do giữ nhãn trường, vòng focus khi dùng bàn phím và tên truy cập cho nút chỉ có biểu tượng.
- Do dùng các giá trị thực trong frontmatter; đối chiếu nguồn CSS trước khi thêm biến thể.
- Do giữ nhãn dữ liệu khi bảng thiết bị chuyển thành từng hàng trên điện thoại.

### Don't:

- Don't dùng riêng màu để diễn đạt trạng thái.
- Don't dùng biểu tượng ký tự thay cho SVG hiện có.
- Don't đưa bóng hộp thoại vào mọi bảng và khối nội dung.
- Don't biến bảng dữ liệu vận hành thành tường KPI trang trí.

Nguồn thực thi: `src/styles.css`, `src/main.tsx`, `src/components/ui.tsx`, `src/App.tsx` và `src/pages/`. Hướng đã duyệt: `docs/surface-brief.md`; ràng buộc sản phẩm: `PRODUCT.md`. Sidecar giữ source pointers tới selector/thành phần và metadata mở rộng.

Không có lỗi còn tồn tại được chuẩn hóa thành quy tắc trong lượt tài liệu này. Tham chiếu nền chưa định nghĩa của bản chụp cấu hình đã được gỡ khỏi implementation trước khi ghi tài liệu.

## AI Investigation workspace
The existing DENSO Copilot palette is retained intentionally: dark purple #19162e, deep navy #111c35/#12162a, neon green #00ed48 and electric blue #66e1ff/#44d9ff, with foreground #f5f7ff and secondary #bdc9e0. The expanded workspace uses columns at desktop width, a single mobile column, locally scrolling history tables, evidence anchors and actual point charts. Model interpretation and database facts are separately labeled. Verdict: ready for demo, browser verified at 1440×1000 and 390×844; no exported raster assets added. Detector found no non-advisory failures; palette advisories document this intentional dark section within the existing light app.
