# AI nâng hình ảnh lên 4K — bản thử nghiệm 0.2.4

CrossZ chạy mô hình học máy FSRCNN-small bằng WebGPU ngay trong tab, dùng trọng số được đóng gói sẵn. Với video SDR 1920×1080, mô hình x2 tạo đầu ra 3840×2160; với 1280×720, mô hình x3 tạo cùng kích thước. Đây là nâng cấp hình ảnh bằng mạng nơ-ron, không phải chọn luồng 2160p trên YouTube hoặc chỉ kéo giãn phần tử video.

Mô hình suy luận chi tiết ở độ sáng; màu nguồn được nội suy rồi kết hợp với độ sáng mới. Trọng số có nguồn và giấy phép Apache-2.0 trong [hồ sơ mô hình](ai-models.md). Đây là mô hình ảnh theo từng khung, chưa có xử lý chuyển động nhiều khung; có thể xuất hiện nhấp nháy chi tiết hoặc hình ảnh không đẹp hơn nguồn. Đầu ra 4K không bảo đảm chi tiết tương đương video gốc quay 4K.

## Dùng trên Edge với RTX 3050

1. Cập nhật toàn bộ file extension lên 0.2.4, Reload tại `edge://extensions` và tải lại tab YouTube.
2. Mở video thông thường, chọn chất lượng nguồn 720p hoặc 1080p trong YouTube và chờ hình ảnh sẵn sàng. Bản đầu chỉ nhận đúng 1280×720 hoặc 1920×1080, không hỗ trợ Shorts/khung dọc hoặc độ phân giải thích ứng khác.
3. Mở popup CrossZ và bật **AI nâng hình lên 4K**. Mặc định luôn tắt; không tự bật GPU sau khi mở tab/trình duyệt.
4. Khi bật, popup báo tải mô hình, khởi tạo GPU rồi xử lý khung 4K đầu tiên, có phần trăm tiến độ khi các nhóm việc GPU hoàn tất. Hình gốc vẫn được giữ trong lúc chờ. Chỉ sau một khung hợp lệ mới báo **Đang xử lý 4K bằng AI**, kèm kích thước nguồn/đầu ra, FPS xử lý, ms/khung và nhãn GPU nếu trình duyệt cung cấp. Khi tạm dừng, FPS bằng 0 vẫn có thể là một khung tĩnh 4K đã sẵn sàng.
5. Tắt công tắc để trở về hình gốc. Khi đổi video/nguồn, tab bị ẩn hoặc có lỗi, tính năng dừng và cần người dùng bật lại.

Edge cần WebGPU và tăng tốc đồ họa hoạt động. RTX 3050 là phần cứng mục tiêu người dùng cung cấp; chưa có số đo trên chính GPU đó. Không cần bật flag thử nghiệm hoặc thay chính sách quản trị để dùng extension. Nếu trình duyệt không cấp GPU, extension báo lỗi và giữ video gốc.

## Vòng đời và hiệu năng

Âm thanh, thời gian phát, nút điều khiển và phụ đề vẫn do video gốc đảm nhiệm. Canvas AI nằm trong player để đi theo bố cục; chưa xác minh fullscreen trên Edge thật. Overlay đồng bộ video của Ambient tạm ẩn bằng attribute do AI sở hữu, rồi được khôi phục khi dừng; không ghi đè cài đặt Ambient.

Chỉ có một khung xử lý đang chạy. Tua hoặc thay nguồn làm khung cũ không còn hợp lệ; canvas ẩn cho tới khi có khung đúng vị trí mới. Khung đang phát quá cũ được bỏ qua và overlay hết hạn theo vị trí video để hình cũ không che video đang chạy. Tạm dừng làm khung đang xử lý không còn hợp lệ và yêu cầu một khung tĩnh mới. GPU mất kết nối, lỗi đọc ảnh hoặc xử lý quá chậm khiến AI được gỡ để lộ lại video gốc; không tự lặp khởi tạo. Không lưu khung hình, gửi video tới máy chủ hoặc tải mô hình/mã thực thi từ mạng khi xem.

Bản đầu không xử lý HDR, VR/360, video được bảo vệ DRM hoặc PiP gốc. PiP dùng video gốc. Mô hình SDR không được gắn nhãn là bảo toàn HDR. Tốc độ thực tế phụ thuộc GPU được Edge chọn, giải mã video, tải GPU khác và hiệu ứng Ambient. Cần thử thực tế trên RTX 3050 trước khi gọi đây là nâng cấp 4K thời gian thực đã được xác minh.

## Triển khai

Hai bộ trọng số x2/x3 được chuyển đổi nguyên giá trị float32 từ nguồn đã ghim commit và checksum. WebGPU chạy năm lớp convolution/PReLU, pixel shuffle và kết hợp màu bằng shader đóng gói. Tiling với halo 3 pixel giới hạn bộ nhớ; toàn bộ bước xử lý khung nằm trên GPU, không readback pixel qua CPU trong đường chạy sản phẩm. Từ 0.2.4, shader tính bốn kênh đầu ra một lượt với trọng số float32 được căn hàng, chia việc thành nhóm tối đa bốn tile, báo tiến độ sau fence GPU, rồi sao chép kết quả từ texture bền sang canvas khi hoàn tất.

Các shader được kiểm tra với phép tính tham chiếu độc lập và mô hình đã huấn luyện. Kiểm tra cloud dùng GPU phần mềm, không đại diện tốc độ RTX. Xem [báo cáo kiểm chứng 0.2.4](validation-0.2.4.md) để phân biệt phép tính, khung render thực, lifecycle dùng adapter và các kiểm tra còn thiếu.

## Sửa báo GPU không phản hồi trong 0.2.4

Ngưỡng cũ hủy mọi khung vượt 500 ms, bao gồm cả khung đầu có cấp phát texture/bind group và GPU vẫn làm việc. 0.2.4 cho khung đầu và khung đang tạm dừng tối đa 15 giây; khung đang phát tiếp theo tối đa 5 giây. Sau khi có tiến độ đầu tiên, khoảng ngừng báo tiến độ 3 giây được kiểm tra riêng; khung đang phát sau làm nóng áp dụng kiểm tra này ngay từ đầu. Hết ngân sách xử lý và mất kết nối GPU có thông báo riêng. Làm nóng không bị tính vào ba khung liên tiếp xử lý chậm.

Không hiển thị một khung đang phát nếu độ trễ so với vị trí video vượt khoảng 120 ms theo tốc độ phát; khung đang hiện được ẩn khi tuổi đạt khoảng 100 ms. FPS và nhịp xử lý thích nghi với thời gian thực, tối đa 30 khung/giây. Bản này không bảo đảm phát AI thời gian thực trên mọi máy; GPU quá chậm vẫn cần trả hình gốc thay vì giữ ảnh cũ.

Nếu popup báo **GPU phần mềm**, kiểm tra tăng tốc đồ họa trong Cài đặt → Hệ thống của Chrome hoặc Hệ thống và hiệu suất của Edge, rồi khởi động lại trình duyệt nếu thay đổi. Trên Windows có nhiều GPU, có thể chọn Chrome/Edge ở Cài đặt → Hệ thống → Màn hình → Đồ họa và chọn GPU hiệu năng cao RTX 3050. Extension chỉ yêu cầu adapter hiệu năng cao, không thể ép trình duyệt dùng card cụ thể. Nên thử video SDR 720p trước; model x3 vẫn tạo đầu ra 3840×2160 nhưng xử lý ít pixel nguồn hơn 1080p.
