# Bộ chặn quảng cáo 0.1.1

Người dùng báo cả quảng cáo video và banner còn xuất hiện trên Microsoft Edge với 0.1.0. Bản đó chỉ có hai quy tắc host quảng cáo và thao tác Skip khi nút xuất hiện; không xử lý metadata mà player dùng để xếp quảng cáo. Đây là thiếu sót về phạm vi của bản đầu, ngoài hai lỗi race cài đặt được tái hiện trong kiểm tra.

## Các lớp xử lý

- Static DNR chặn hai host quảng cáo đã xác định, giới hạn initiator YouTube. Không chặn `googlevideo.com`, `videoplayback` hoặc toàn bộ API player.
- `ads-content.js` và `ads.css` được khai báo riêng tại `document_start`, không chờ CSS/renderer Ambient. Script đọc cài đặt đã lưu, nhận thay đổi mới nhất, ẩn container quảng cáo và bấm nút Skip khả dụng trong player đang phát quảng cáo.
- `ads-main.js` chạy trong MAIN world tại `document_start`. Nó đợi script isolated xác nhận công tắc trước khi lọc. Cầu nối chỉ mang boolean, không chuyển lệnh trang web sang API đặc quyền của extension.
- Khi bật, lớp MAIN loại các trường `playerAds`, `adPlacements`, `adSlots` ở cấu hình `ytInitialPlayerResponse`/`playerResponse` và JSON/text nhận qua fetch hoặc XHR tại đúng endpoint `https://www.youtube.com/youtubei/v1/player`. Giữ `streamingData`, URL video, chi tiết video và các trường khác. Không thay `JSON.parse` hoặc tua phần tử video.
- Khi tắt, response sau đó được giữ nguyên và DOM được khôi phục. Dữ liệu/request đã lọc không thể khôi phục ngược; tải lại trang nếu cần đối chiếu với bộ chặn tắt.

## Phạm vi và bằng chứng

Tên các trường được đối chiếu với [bộ lọc YouTube của uAssets](https://github.com/uBlockOrigin/uAssets/blob/master/filters/filters.txt) ngày 2026-10-16. Phần triển khai JavaScript trong repository này được viết riêng; không đóng gói hoặc tải code/filter list của uBlock.

Kiểm tra trình duyệt dùng API fetch/Response/XHR thực trên fixture, không phải YouTube đang chạy. Việc extension được cài trên Edge, DNR chặn request thật và tỷ lệ quảng cáo biến mất phải được kiểm tra trên máy người dùng. Cloud hiện cấm cài unpacked bằng policy và không truy cập được YouTube thật.

Lớp MAIN không đọc/chuyển dữ liệu mạng ra máy chủ khác. Nó không xử lý media quảng cáo được ghép trực tiếp phía máy chủ, dữ liệu fetch đọc qua streaming body reader, API/schema khác hoặc các thử nghiệm YouTube chưa nhận diện. Xác nhận cài đặt bất đồng bộ cũng có thể đến sau khi player đã tiêu thụ dữ liệu ban đầu. Không tự reload, che thông báo lỗi player hoặc tuyên bố chặn thành công khi chưa quan sát được quảng cáo.

## Thử trên Microsoft Edge

1. Cài file của 0.1.1, bấm Reload tại `edge://extensions`, rồi tải lại toàn bộ tab YouTube. Popup phải hiển thị 0.1.1.
2. Bật bộ chặn, kiểm tra trang chủ và trang xem video. Thử nhiều video và chuyển video bằng liên kết trong trang để kiểm tra điều hướng SPA.
3. Kiểm tra video chính vẫn phát, tua và đổi chất lượng bình thường. Thử Ambient và âm lượng đồng thời.
4. Tắt bộ chặn và tải lại trang để đối chiếu. Với quảng cáo còn xuất hiện, ghi phiên bản Edge, loại quảng cáo, có nút Skip hay không, URL video và lỗi tại thẻ extension nếu có. Một lần không thấy quảng cáo chưa chứng minh bộ chặn hoạt động.
