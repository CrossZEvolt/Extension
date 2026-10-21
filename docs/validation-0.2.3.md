# Báo cáo kiểm chứng — CrossZ 0.2.3

Ngày kiểm tra: 2026-10-21. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64.

| Kiểm tra sau thay đổi cuối | Kết quả |
| --- | --- |
| `npm run build` | Đạt; tạo mới toàn bộ `dist/` |
| `npm run verify:build` | Đạt; manifest và tài nguyên đầy đủ |
| `npm test` — unit | 31/31 đạt |
| `npm test` — browser | 80 đạt, 1 SKIP do policy cấm cài unpacked |

Tổng **111 đạt, 1 SKIP**, không có test thất bại. Không thêm quyền, dependency hoặc thay đổi mô hình AI/bộ lọc quảng cáo. Gói ZIP lấy từ đúng `dist/` đã kiểm tra; checksum nằm trong `downloads/SHA256SUMS`.

## Đường tải gây lỗi

Ảnh người dùng cho thấy trình duyệt từ chối `scripts/injected.js` và `scripts/content-main.js` từ trang YouTube. Mã cũ thêm thẻ script trỏ tới URL extension, dùng dynamic import cho core và thử đọc lại URL bằng XHR khi lỗi. Hai file đã có khai báo WAR, nên không kết luận đây là thiếu quyền; nguyên nhân trình duyệt từ chối chính xác chưa được tái hiện bằng cài extension thật.

Đã thay đường tải: manifest nạp helper `injected.js` trong MAIN tại `document_start`, nạp lần lượt bridge `content.js` và renderer `content-main.js` trong ISOLATED tại `document_idle`. Giữ nguyên phạm vi trang thường/embed, loại trừ live chat và quy tắc frame. Bridge lỗi có trước renderer; helper có trước các lệnh gọi API player. Renderer giữ quyền runtime/storage của extension, helper gọi các method thuộc trang.

Không còn thẻ script, dynamic import hoặc XHR tải lại hai file này trong loader. Xóa các khai báo WAR cho hai script và stylesheet Ambient vì trình duyệt nạp chúng trực tiếp. Các tài sản noise/model còn giữ khai báo phù hợp.

## Kiểm tra hồi quy

Test mới đã thất bại trên bản cũ khi chặn các yêu cầu tải tài nguyên từ trang: renderer không khởi tạo. Sau sửa, test chạy các bundle production theo manifest trong một trang Chromium có MAIN và CDP isolated world tách biệt. Chrome API adapter chỉ có trong isolated world; player expando method chỉ có trong MAIN.

Kiểm tra xác nhận renderer khởi tạo và vẽ pixel trong ISOLATED, MAIN không có instance renderer hoặc API extension được giả lập, không có thẻ script URL/yêu cầu tải script từ trang. RPC HDR và storyboard trả được dữ liệu từ các method mà isolated DOM wrapper không thể gọi trực tiếp.

Các fixture thành phần cũ được đổi sang chạy những file native được khai báo trong manifest, giữ API adapter hiện có. Những fixture đó vẫn chạy cùng world để kiểm tra chức năng; test mới riêng biệt kiểm chứng ranh giới world. Kiểm tra mở cài đặt, màu renderer, lưu cài đặt, khởi tạo trễ và chuyển trang đều đạt trong bộ test đầy đủ.

Review độc lập không tìm thấy lỗi quan trọng còn lại trong thứ tự nạp, phụ thuộc module hoặc phạm vi URL/frame. Dữ liệu `data-version`/`data-crash-options` của thẻ script cũ không được helper dùng; core đã tự đọc version và cấu hình lỗi bằng API trong ISOLATED.

## Giới hạn và cập nhật

CDP fixture không phải cài extension thật. Policy cloud vẫn chặn unpacked; chưa xác minh trực tiếp trên Chrome/Edge của người dùng. Các giới hạn YouTube thật và chặn quảng cáo trong [0.2.2](validation-0.2.2.md), cùng hiệu năng RTX 3050 trong [0.2.0](validation-0.2.0.md), vẫn còn.

Chép toàn bộ file 0.2.3, Reload extension, xóa danh sách lỗi cũ rồi tải lại tất cả tab YouTube. Tab trước cập nhật vẫn có thể giữ loader cũ; danh sách lỗi đã lưu không tự biến mất khi mã được sửa. Kiểm tra popup hiện 0.2.3 trước khi thử lại.
