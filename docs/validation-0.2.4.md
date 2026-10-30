# Báo cáo kiểm chứng — CrossZ 0.2.4

Ngày kiểm tra: 2026-10-30. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64.

| Kiểm tra sau thay đổi cuối | Kết quả |
| --- | --- |
| `npm run build` | Đạt; tạo mới `dist/` |
| `npm run verify:build` | Đạt; manifest và tài nguyên đầy đủ |
| `npm test` — unit | 31/31 đạt |
| `npm test` — browser | 95 đạt, 1 SKIP do policy cấm cài unpacked |

Tổng **126 đạt, 1 SKIP**, không có test thất bại. Không thêm quyền/dependency hoặc đổi trọng số mô hình. ZIP được đóng gói từ đúng `dist/` đã kiểm tra; checksum nằm trong `downloads/SHA256SUMS`.

## Lỗi báo GPU không phản hồi

Ngưỡng cũ dừng mọi frame vượt 500 ms. Probe độc lập dùng engine hoàn thành bình thường sau 650 ms đã tái hiện đúng thông báo người dùng: controller hủy engine ở 500 ms, rồi engine mới hoàn tất. Đây là lỗi phân loại bằng thời gian toàn khung, chưa chứng minh card bị treo. Lần đầu còn bao gồm cấp phát texture/bind group và gửi lệnh; pipeline đã được tạo trước đó.

Bản mới có ngân sách 15 giây cho làm nóng hoặc khung đang tạm dừng, 5 giây cho khung đang phát sau làm nóng. Tiến độ từng nhóm GPU được xác nhận qua fence; không có tiến độ mới trong 3 giây là trường hợp riêng. Hết thời gian xử lý, tiến độ dừng và device lost có thông báo riêng. Làm nóng không bị tính vào ba khung xử lý chậm liên tiếp.

Canvas hết hạn theo vị trí video và tốc độ phát; kết quả quá cũ không che video đang chạy. Tạm dừng vô hiệu khung cũ đang xử lý và yêu cầu một khung tĩnh mới. Nhịp xử lý thích nghi, tối đa 30 FPS. Popup báo giai đoạn, tiến độ, ms/khung và nhãn adapter cục bộ; GPU phần mềm được ghi rõ.

## GPU và kết quả hình

Shader xử lý bốn kênh đầu ra một lượt, căn trọng số/bias/PReLU float32 thành vec4, giữ layout activation và giá trị model. Gửi tối đa bốn tile mỗi nhóm, chờ fence rồi báo tiến độ; dừng gửi nhóm tiếp theo nếu đã hủy. Texture kết quả bền được sao chép sang canvas sau suy luận, tránh giữ texture swapchain trong cả quá trình dài. Texture 4K thêm khoảng 31,6 MiB GPU; bộ nhớ activation vẫn khoảng 16,8 MiB, chưa tính canvas/driver.

Chín test WebGPU đạt, gồm mô hình x2/x3 so với phép tính CPU độc lập (sai số kênh tối đa 0/255 trên ảnh kiểm tra), đường ghép tile/biên, resize/device lost, hủy sau nhóm đầu và canvas ẩn rồi hiện. Không đọc pixel về CPU trong đường chạy sản phẩm.

Benchmark cùng trình duyệt SwiftShader, nguồn 720p và model x3 thật: engine cũ **10.283,4 ms**, engine mới **5.644,7 ms**, nhanh hơn khoảng **1,82×**, cùng checksum ảnh 3840×2160. Tiến độ lần lượt 4/8/12/15 tile tại khoảng 1.352/2.672/4.473/5.622 ms. Đây là số đo GPU phần mềm, không phải RTX 3050 hoặc tốc độ phát thời gian thực.

## Kiểm tra toàn luồng video

Test mới dùng clip VP8 1280×720 được mã hóa sẵn, controller thật và mô hình WebGPU thật. Lần chạy cuối tạo và hiển thị khung 3840×2160 trong **5.331,4 ms** khi video tạm dừng. Pixel nguồn và canvas trước/sau khi ẩn riêng video gốc đều là RGBA **[226,125,36,255]** tại vị trí kiểm tra; nhờ đó video gốc không thể che một canvas đen và làm test đạt giả.

Fixture CanvasCaptureStream ban đầu cho pixel đen ngay ở video nguồn dưới cấu hình Vulkan/SwiftShader, nên đã thay bằng video mã hóa có kiểm tra màu trước khi bật AI. Một probe riêng giữ canvas ẩn suốt hơn 6 giây rồi hiện cũng hiển thị đúng màu. Không sửa API trình bày theo giả thuyết ảnh đen khi đầu vào chưa hợp lệ.

37 test vòng đời đạt, gồm làm nóng 650 ms, thời gian chờ hữu hạn, tiến độ ngừng, khung quá cũ, pause/seek, tốc độ phát 0,5×/2×, khung tĩnh tiếp theo vượt 5 giây, watchdog cũ và dọn tài nguyên. Engine được giả lập ở những test này để kiểm soát thời gian; test video WebGPU ở trên là kiểm tra riêng không giả lập engine. Hai test popup kiểm tra xác nhận trạng thái và tiến độ làm nóng. Review độc lập không tìm thấy lỗi quan trọng còn lại trong packing, cleanup, deadline và độ mới của khung.

## Giới hạn

Chưa chạy trên RTX 3050 của người dùng hoặc cài extension thật trên Chrome/Edge: policy cloud vẫn chặn unpacked. GPU phần mềm chỉ chứng minh xử lý đúng và không bị cắt sai ở 500 ms; vẫn rất chậm cho video đang phát. Trên GPU không đủ nhanh, bản này giữ hình gốc và báo hiệu năng thay vì hiển thị ảnh AI cũ.

Cần thử nguồn SDR 720p/1080p trên máy thật. Không cam kết 30/60 FPS hoặc chi tiết như nguồn quay 4K. Các giới hạn YouTube thật, HDR, DRM, VR và PiP trong [hướng dẫn AI](ai-4k.md) vẫn áp dụng.
