# Quyền riêng tư — CrossZ YouTube Enhancer 0.1.2

CrossZ không có backend, không yêu cầu tài khoản và không gửi âm thanh, URL video hoặc lịch sử xem tới máy chủ của sản phẩm. Không có Sentry hoặc báo lỗi gửi tự động đến tác giả gốc.

- Cài đặt Ambient và CrossZ lưu tại `chrome.storage.local`. Tùy chọn xuất/nhập qua tài khoản trình duyệt dùng `chrome.storage.sync`; việc đồng bộ do trình duyệt quản lý.
- Âm thanh được capture sau thao tác bật của người dùng trên tab YouTube, xử lý cục bộ trong offscreen document và phát lại qua thiết bị âm thanh. Stream không được lưu thành bản ghi hoặc gửi qua mạng. Capture bao gồm toàn bộ âm thanh của tab, không dùng micro/camera. Trạng thái capture không nằm trong file cấu hình xuất ra.
- Lỗi gần nhất được giới hạn 100 mục, lọc URL trong thông báo và lưu cục bộ. Người dùng có thể chủ động tải file chẩn đoán. Gỡ extension sẽ xóa dữ liệu local của extension theo cơ chế Chrome.
- Ambient có thể yêu cầu storyboard từ YouTube khi bật tính năng tiết kiệm năng lượng. Đây là truy cập nội dung YouTube, không phải báo cáo xem video về CrossZ.
- Lọc quảng cáo dùng quy tắc và mã đóng gói. Từ 0.1.1, script trên trang xử lý cục bộ các trường quảng cáo trong cấu hình và response player YouTube; không lưu hoặc gửi response đó tới máy chủ khác. Không tải mã thực thi từ dịch vụ khác. Các liên kết hỗ trợ chỉ mở khi người dùng chọn.

Quyền `storage` lưu cài đặt, `activeTab` nhận diện tab được người dùng kích hoạt, `tabCapture` thu âm thanh tab sau thao tác người dùng, `offscreen` giữ bộ xử lý âm thanh và `declarativeNetRequest` lọc các yêu cầu quảng cáo thuộc phạm vi YouTube. Script tác động lên trang YouTube và iframe YouTube được khai báo trong manifest; không yêu cầu `<all_urls>`.
