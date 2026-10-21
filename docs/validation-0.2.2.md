# Báo cáo kiểm chứng — CrossZ 0.2.2

Ngày kiểm tra: 2026-10-21. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64.

| Kiểm tra cuối sau sửa lỗi hủy tải | Kết quả |
| --- | --- |
| `npm run build` | Đạt; tạo mới toàn bộ `dist/`, gồm entry bật/tắt bộ lọc |
| `npm run verify:build` | Đạt; manifest, tài nguyên tĩnh và hai entry đăng ký động đầy đủ |
| `npm test` — unit | 31/31 đạt |
| `npm test` — browser | 79 đạt, 1 SKIP do policy cấm cài unpacked |

Tổng **110 đạt, 1 SKIP**, không có test thất bại. Lần chạy cuối dùng bundle đã build cho cả 22 test player; các thử nghiệm source trước đó không cộng thêm vào số lượng này. Không thêm dependency npm hoặc đổi mô hình AI. Có thêm quyền `scripting` và host `https://www.youtube.com/*` để đăng ký bộ lọc trước code trang.

## Nguyên nhân đã tái hiện

Người dùng xác nhận bản 0.2.1 còn quảng cáo trên Chrome và Edge. Hai lỗ hổng được tái hiện độc lập: cài đặt xác nhận trễ hơn lần player tiêu thụ dữ liệu ban đầu; response đi qua `body.getReader`, `arrayBuffer`, các envelope array hoặc endpoint chưa chọn vẫn giữ dữ liệu quảng cáo. Các test cũ chỉ phản hồi trạng thái bật đồng bộ trước khi tạo payload nên không phơi bày race ban đầu.

## Khởi động và trạng thái

11 unit test mới kiểm tra đăng ký MAIN bền vững theo cài đặt bật/tắt, sửa đăng ký cũ, tính lặp lại của reconcile, giữ đăng ký module khác, lưu đồng bộ với DNR, khôi phục khi đăng ký/lưu thất bại, kiểm tra lại đăng ký và báo lỗi an toàn. Đây là adapter Chrome API có trạng thái; không chứng minh trình duyệt thật đã thực thi đăng ký.

Worker và popup có test riêng cho trạng thái chuẩn bị, lỗi, sẵn sàng và tắt. Trạng thái công tắc khác với trạng thái đăng ký. Popup giữ hướng dẫn tải lại YouTube; đăng ký sẵn sàng không xác nhận hook đã chạy trong tab trước cập nhật hoặc quyền trang đã được cấp. [Ảnh popup](images/popup-0.2.2.png) chụp từ giao diện production trong fixture, rộng 360px và cao 835px; popup thấp hơn cần cuộn.

## Player nhận dữ liệu sau khi lọc

11 test mới dùng các entry bật/tắt đóng gói sẵn tại `document_start`. Test đầu phục vụ HTML chứa `var ytInitialPlayerResponse` trong script trang, tiêu thụ dữ liệu ngay và không gửi sự kiện xác nhận cài đặt; dữ liệu tiêu thụ không còn ba trường quảng cáo.

Các test khác dùng fetch/Response/stream thực với network route fixture để kiểm tra byte, blob, reader, body chuyển sang Response khác, clone, envelope array, `/get_watch`, playlist và sequence Shorts đã đánh dấu ad. Dữ liệu chính/object không liên quan, trạng thái tắt, URL rỗng ở Response tự tạo, dữ liệu lỗi và endpoint khác được giữ nguyên theo phạm vi bộ lọc. Status/header/URL/type/redirected được so với response mạng của fixture và qua chuỗi clone; không tuyên bố đã thử một redirect mạng thật thành công.

Review phát hiện bản response dựng lại làm mất hủy tải sau khi fetch trả về. Đã thêm test thất bại trước sửa, rồi kiểm chứng hủy bằng init signal/Request signal/signal ghi đè, clone chưa đọc sau khi clone khác đã đọc, body reader và ưu tiên TypeError của body đã dùng/khóa. Byte của các clone được tách riêng để thay đổi một chunk không làm hỏng clone khác. Bộ test và probe review độc lập xác nhận các trường hợp này sau sửa.

22 test player đạt trong lần cuối; các test hiện có về Ambient, âm lượng, AI và DOM cũng đạt. Không chặn chung host video hoặc thêm cơ chế che video để biến một quảng cáo đã hiện thành thành công.

## Phạm vi chưa được xác minh

Kết nối mới tới YouTube vẫn bị proxy trả `403 CONNECT`; Chromium vẫn chặn cài unpacked bằng policy. Không thay đổi hoặc vượt các chính sách đó. Chưa xác minh quảng cáo không xuất hiện trên YouTube thật của Chrome/Edge. Không thể suy ra chặn 100% từ kết quả fixture.

API lấy từ iframe sạch/realm khác, worker, XHR nhị phân, schema/endpoint mới và quảng cáo ghép vào media có thể vượt bộ lọc. Response dựng lại có header guard khác response mạng gốc. Xem [cơ chế và giới hạn](ad-blocking.md). Các giới hạn tabCapture, fullscreen và tốc độ RTX 3050 trong [báo cáo AI](validation-0.2.0.md) vẫn còn.

Sau khi cập nhật đúng 0.2.2, cấp quyền truy cập YouTube nếu được hỏi, đợi popup hết chuẩn bị rồi tải lại các tab YouTube. Nếu quảng cáo còn xuất hiện, kể cả chốc lát, ghi nhận đó là trường hợp bộ lọc chưa đạt mục tiêu; không chỉ đánh giá bằng việc nút Skip đã được bấm.
