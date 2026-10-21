# Bộ lọc quảng cáo trước khi player nhận dữ liệu — 0.2.2

Mục tiêu là quảng cáo không xuất hiện trong video. Bấm Skip sau khi quảng cáo đã hiện chỉ là dự phòng, không chứng minh mục tiêu đó đã đạt.

Người dùng xác nhận 0.2.1 vẫn có quảng cáo trên Chrome và Edge. Đã tái hiện được hai lỗ hổng của bản cũ: player có thể tiêu thụ dữ liệu ban đầu trước khi đọc xong cài đặt, và response đọc qua luồng/byte hoặc một số envelope không đi qua bộ lọc. Chưa xác định các lỗ hổng đó giải thích toàn bộ quảng cáo trên máy người dùng.

## Khởi động theo cài đặt đã lưu

Worker đăng ký một content script MAIN `document_start` được trình duyệt giữ qua các phiên. Cài đặt bật chọn `ads-main.js`, cài đặt tắt chọn `ads-main-disabled.js`; mỗi entry mang trạng thái ban đầu đồng bộ trước khi code trang đọc cấu hình player. Không còn entry MAIN tĩnh có thể chạy trước rồi chiếm singleton với trạng thái sai. Entry tắt vẫn nhận thay đổi công tắc sau đó mà không lọc dữ liệu lúc đầu.

Đăng ký script, DNR và lưu cài đặt được xếp hàng, kiểm tra lại và khôi phục trạng thái trước nếu có lỗi. Popup phân biệt trạng thái chuẩn bị, đã đăng ký và lỗi; công tắc bật không tự được coi là bộ lọc đã khởi tạo. Trạng thái đã đăng ký chưa xác nhận hook đã chạy trong tab cũ hoặc quyền truy cập trang chưa được người dùng cấp.

Quyền mới `scripting` cùng host `https://www.youtube.com/*` phục vụ đăng ký này, không mở rộng sang các website khác. Sau khi cập nhật, cho phép truy cập YouTube trong phần quyền truy cập trang của Chrome/Edge, đợi hết trạng thái chuẩn bị rồi tải lại các tab YouTube. Trang đã chạy trước khi đăng ký hoặc dữ liệu đã bị player sao chép không thể được sửa ngược bằng một lần bật công tắc.

## Dữ liệu được xử lý

- Cấu hình `ytInitialPlayerResponse` và `playerResponse`: loại các trường `playerAds`, `adPlacements`, `adSlots` trước khi được đọc khi bộ chặn đang bật.
- Các endpoint YouTube đã nhận diện gồm `/youtubei/v1/player`, `/youtubei/v1/playlist`, `/youtubei/v1/get_watch` và response JSON của trang `/playlist?list=...`. Xử lý root player, object chứa `playerResponse`, hoặc array có các phần tử chứa `playerResponse`; không tìm và xóa đệ quy mọi khóa trùng tên.
- Fetch: clone và lọc body trước khi promise trả response cho player. Vì vậy `json`, `text`, `arrayBuffer`, `blob`, `body.getReader`, response tạo từ body và clone đều nhận dữ liệu đã lọc ở những đường này. Chỉ tạo response thay thế khi JSON thật sự đổi; giữ status, statusText, URL, type, redirected và các header khác, bỏ độ dài/encoding của body cũ. Response tự tạo có header guard khác response mạng gốc.
- XHR vẫn lọc JSON/text khi hoàn thành và đúng endpoint; getter kế thừa/không thể bọc được không làm ngừng cầu nối cài đặt.
- Sequence Shorts `/youtubei/v1/reel_watch_sequence` và `/youtubei/v1/reel/reel_watch_sequence`: chỉ bỏ entry có `command.reelWatchEndpoint.adClientParams.isAd === true` ở các envelope đã nhận diện, giữ thứ tự nội dung còn lại.

Không thay `JSON.parse`, không sửa URL video, không chặn toàn bộ `googlevideo.com` hoặc `videoplayback`. Dữ liệu nguồn chính như `streamingData`, chi tiết video và object không liên quan được giữ lại. Khi tắt, dữ liệu sau đó không bị lọc; dữ liệu đã thay đổi không thể phục hồi, nên tải lại trang để đối chiếu.

Hai quy tắc DNR tiếp tục giới hạn host quảng cáo với initiator YouTube. Script isolated vẫn xử lý banner/DOM và nút Skip khả dụng độc lập với Ambient. Những lớp này không thay thế việc lọc trước player.

## Nguồn đối chiếu và giới hạn

Tên trường/envelope được đối chiếu với [uAssets filters](https://github.com/uBlockOrigin/uAssets/blob/5b924eee3f51f8293da115bd8948912a416fc3e0/filters/filters.txt) và [quick-fixes](https://github.com/uBlockOrigin/uAssets/blob/5b924eee3f51f8293da115bd8948912a416fc3e0/filters/quick-fixes.txt), ngày 2026-10-21. Triển khai trong repository này được viết riêng; không sao chép hoặc đóng gói scriptlet/filter GPL của uBlock, không tải code từ mạng khi chạy.

Các test dùng API fetch/Response/XHR và page script thật trong fixture, cùng adapter API extension. Cloud vẫn bị chặn cài unpacked bằng policy và bị proxy trả 403 khi kết nối YouTube. Vì vậy chưa thể xác nhận quảng cáo không xuất hiện trên Chrome/Edge với YouTube thực; xem [báo cáo kiểm chứng](validation-0.2.2.md).

Chưa xử lý mọi bypass qua iframe sạch/realm khác, worker, XHR nhị phân, schema/endpoint mới hoặc media quảng cáo ghép phía máy chủ. Không loại nội dung tài trợ được đọc trong video. Bộ lọc có thể không đủ với thử nghiệm YouTube hoặc cơ chế chống chặn mới; không cam kết chặn 100% từ kết quả fixture.

Thử trên Chrome và Edge: nạp đúng 0.2.2, cấp quyền YouTube, tải lại trang, kiểm tra nhiều video và điều hướng SPA. Đối chiếu nguồn chính vẫn phát, tua/đổi chất lượng, Ambient và âm lượng vẫn hoạt động. Nếu quảng cáo xuất hiện dù chỉ chốc lát, ghi nhận đó là trường hợp bộ lọc chưa đạt mục tiêu; một video không có quảng cáo cũng chưa đủ chứng minh thành công.
