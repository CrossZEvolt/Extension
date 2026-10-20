# Báo cáo kiểm chứng — CrossZ 0.2.1

Ngày kiểm tra: 2026-10-20. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64.

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run build` | Đạt; build mới từ source 0.2.1 |
| `npm run verify:build` | Đạt; manifest và tài nguyên hợp lệ |
| `npm test` — unit | 19/19 đạt |
| `npm test` — browser | 67 đạt, 1 SKIP do policy cấm cài unpacked |
| ESLint hai file production thay đổi | Đạt |

Tổng **86 đạt, 1 SKIP**, không có test thất bại. Không thêm quyền hoặc dependency, không thay đổi mô hình AI. ZIP được đóng gói từ `dist/` vừa build và kiểm tra; checksum nằm trong `downloads/SHA256SUMS`.

## Lỗi XHR trong ảnh người dùng

Đã tái hiện đúng `Cannot read properties of undefined (reading 'get')` khi `XMLHttpRequest` là lớp con có getter kế thừa. Mã cũ chỉ tìm descriptor trực tiếp trên prototype nên không tìm thấy getter và dừng trước khi kết nối trạng thái bật/tắt.

Mã mới tìm descriptor qua chuỗi prototype, kiểm tra getter/method trước khi bọc và giữ thuộc tính không thể thay đổi nguyên trạng. Một lỗi tương tự với method `Response` kế thừa cũng được xử lý; trường hợp đó bọc method tại nơi khai báo để response từ `fetch` gốc vẫn được lọc. Không thay constructor XHR hoặc Response.

Ba test mới kiểm tra XHR kế thừa với response text/JSON, endpoint khác và trạng thái tắt; Response kế thừa với `fetch` thực trong fixture, body đã tiêu thụ và constructor; cùng getter XHR bị khóa nhưng các bộ lọc khác và cầu nối cài đặt vẫn hoạt động. Đã quan sát các lỗi trước sửa, rồi kiểm tra lại 11/11 test bộ lọc player đạt sau sửa.

## Cảnh báo tải CSS Ambient

CSS đã có trong `web_accessible_resources`; không xác định đây là lỗi thiếu quyền. Đường cũ thêm `<link>` trỏ tới stylesheet extension trong trang và dừng khởi tạo Ambient nếu tải thất bại. Khi lỗi, chẩn đoán còn thử đọc cùng URL bằng XHR.

Bản 0.2.1 khai báo CSS trong hai entry content script Ambient cho trang thường và embed, giữ nguyên phạm vi URL/frame. Trình duyệt chịu trách nhiệm chèn CSS; mã không còn tạo link hoặc chờ request CSS từ trang.

Hai test hồi quy mới đã thất bại trước sửa và đạt sau sửa: manifest phải khai báo stylesheet cho cả hai entry; Ambient vẫn khởi tạo, áp dụng style và vẽ canvas khi request CSS từ trang bị chặn. Không còn link hoặc request tới `content.css` do trang tạo. Fixture mô phỏng đúng CSS được khai báo trong manifest theo URL/frame; không cài extension thật. Cả bốn test integration đạt, gồm bộ lọc quảng cáo vẫn hoạt động khi CSS Ambient không có.

## Giới hạn và thử lại trên máy người dùng

Chưa tái hiện được chính xác thông báo từ chối URL của Cốc Cốc hoặc xác minh bản sửa bằng cài extension thật: policy cloud vẫn chặn unpacked. Không thay đổi hoặc vượt policy. Kiểm tra này xác nhận lỗi XHR đã tái hiện được và đường tải CSS gây cảnh báo đã được thay thế; không bảo đảm mọi lỗi trên trình duyệt người dùng đều đã hết.

Sau khi chép toàn bộ file 0.2.1, bấm Reload trong trang quản lý extension, tải lại các tab YouTube và kiểm tra popup hiện 0.2.1. Xóa danh sách lỗi cũ trước khi thử lại để phân biệt lỗi được lưu từ bản trước. Các giới hạn YouTube thật, tabCapture, quảng cáo và tốc độ RTX 3050 trong [báo cáo 0.2.0](validation-0.2.0.md) vẫn còn.
