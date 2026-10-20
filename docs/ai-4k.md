# AI nâng hình ảnh lên 4K — bản thử nghiệm 0.2.0

CrossZ chạy mô hình học máy FSRCNN-small bằng WebGPU ngay trong tab, dùng trọng số được đóng gói sẵn. Với video SDR 1920×1080, mô hình x2 tạo đầu ra 3840×2160; với 1280×720, mô hình x3 tạo cùng kích thước. Đây là nâng cấp hình ảnh bằng mạng nơ-ron, không phải chọn luồng 2160p trên YouTube hoặc chỉ kéo giãn phần tử video.

Mô hình suy luận chi tiết ở độ sáng; màu nguồn được nội suy rồi kết hợp với độ sáng mới. Trọng số có nguồn và giấy phép Apache-2.0 trong [hồ sơ mô hình](ai-models.md). Đây là mô hình ảnh theo từng khung, chưa có xử lý chuyển động nhiều khung; có thể xuất hiện nhấp nháy chi tiết hoặc hình ảnh không đẹp hơn nguồn. Đầu ra 4K không bảo đảm chi tiết tương đương video gốc quay 4K.

## Dùng trên Edge với RTX 3050

1. Cập nhật toàn bộ file extension lên 0.2.0, Reload tại `edge://extensions` và tải lại tab YouTube.
2. Mở video thông thường, chọn chất lượng nguồn 720p hoặc 1080p trong YouTube và chờ hình ảnh sẵn sàng. Bản đầu chỉ nhận đúng 1280×720 hoặc 1920×1080, không hỗ trợ Shorts/khung dọc hoặc độ phân giải thích ứng khác.
3. Mở popup CrossZ và bật **AI nâng hình lên 4K**. Mặc định luôn tắt; không tự bật GPU sau khi mở tab/trình duyệt.
4. Đợi trạng thái **Đang xử lý 4K bằng AI**. Popup báo kích thước nguồn/đầu ra và FPS xử lý đo được. Bật công tắc mà chưa có khung hợp lệ không được coi là AI đang hoạt động.
5. Tắt công tắc để trở về hình gốc. Khi đổi video/nguồn, tab bị ẩn hoặc có lỗi, tính năng dừng và cần người dùng bật lại.

Edge cần WebGPU và tăng tốc đồ họa hoạt động. RTX 3050 là phần cứng mục tiêu người dùng cung cấp; chưa có số đo trên chính GPU đó. Không cần bật flag thử nghiệm hoặc thay chính sách quản trị để dùng extension. Nếu trình duyệt không cấp GPU, extension báo lỗi và giữ video gốc.

## Vòng đời và hiệu năng

Âm thanh, thời gian phát, nút điều khiển và phụ đề vẫn do video gốc đảm nhiệm. Canvas AI nằm trong player để đi theo bố cục; chưa xác minh fullscreen trên Edge thật. Overlay đồng bộ video của Ambient tạm ẩn bằng attribute do AI sở hữu, rồi được khôi phục khi dừng; không ghi đè cài đặt Ambient.

Chỉ có một khung xử lý đang chạy. Tua hoặc thay nguồn làm khung cũ không còn hợp lệ; canvas ẩn cho tới khi có khung đúng vị trí mới. GPU mất kết nối, lỗi đọc ảnh hoặc xử lý quá chậm khiến AI được gỡ để lộ lại video gốc; không tự lặp khởi tạo. Không lưu khung hình, gửi video tới máy chủ hoặc tải mô hình/mã thực thi từ mạng khi xem.

Bản đầu không xử lý HDR, VR/360, video được bảo vệ DRM hoặc PiP gốc. PiP dùng video gốc. Mô hình SDR không được gắn nhãn là bảo toàn HDR. Tốc độ thực tế phụ thuộc GPU được Edge chọn, giải mã video, tải GPU khác và hiệu ứng Ambient. Cần thử thực tế trên RTX 3050 trước khi gọi đây là nâng cấp 4K thời gian thực đã được xác minh.

## Triển khai

Hai bộ trọng số x2/x3 được chuyển đổi nguyên giá trị float32 từ nguồn đã ghim commit và checksum. WebGPU chạy năm lớp convolution/PReLU, pixel shuffle và kết hợp màu bằng shader đóng gói. Tiling với halo 3 pixel giới hạn bộ nhớ; toàn bộ bước xử lý khung nằm trên GPU, không readback pixel qua CPU trong đường chạy sản phẩm.

Các shader được kiểm tra với phép tính tham chiếu độc lập và mô hình đã huấn luyện. Kiểm tra cloud dùng GPU phần mềm, không đại diện tốc độ RTX. Xem [báo cáo kiểm chứng 0.2.0](validation-0.2.0.md) để phân biệt phép tính, khung render thực, lifecycle dùng adapter và các kiểm tra còn thiếu.
