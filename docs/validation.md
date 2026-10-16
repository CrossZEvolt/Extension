# Báo cáo kiểm chứng — CrossZ 0.1.0

Đây là kết quả của bản 0.1.0. Bản sửa quảng cáo mới nhất có [báo cáo 0.1.1](validation-0.1.1.md).

Ngày kiểm tra: 2026-10-16. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64.

## Kết quả chạy trong cloud

| Kiểm tra | Kết quả |
| --- | --- |
| Node bootstrap | Tarball từ nodejs.org khớp SHASUMS256; chạy lại dùng toolchain đã cài |
| `npm ci` | Đạt với lockfile, không thay khóa dependency khi cài |
| `npm run build` và `npm run verify:build` | Đạt; manifest V3/version 0.1.0 và tài nguyên hợp lệ |
| `npm run test:unit` | 15/15 đạt |
| `npm run test:browser` | 9 đạt, 1 SKIP vì chính sách cấm cài extension |
| `npm run package` | Đạt; ZIP mới, manifest ở gốc, có MIT/notices, không có source map hoặc file phát triển |
| Kiểm tra popup | Đã xem screenshot `artifacts/popup.png`, giao diện tiếng Việt |

Các kiểm tra đã thực hiện:

- Renderer Ambient production vẽ khung hình video thật trong fixture, chuyển màu đỏ sang xanh; menu gốc mở được.
- Thay đổi enabled giữa hai trang đang mở, bật/tắt, thay phần tử video và sự kiện điều hướng SPA không tạo renderer trùng. Đổi cài đặt trước khi có video hoặc trong khi khởi tạo được giữ đúng sau khi player sẵn sàng; rời trang video không báo mở menu thành công giả.
- Production audio graph với OfflineAudioContext đo được tỉ lệ RMS 1×, 1.5× và 5× ở tín hiệu nhỏ; bộ giảm đỉnh tác động lên tín hiệu lớn.
- Session manager dừng stream đến muộn sau khi hủy, tách gain giữa hai tab và dọn track khi tạo context lỗi.
- Coordinator dùng lại trạng thái offscreen sau worker restart và xử lý yêu cầu bắt đầu trùng/hủy khi chưa nhận stream ID bằng adapter API.
- Controller quảng cáo chỉ bấm nút skip hợp lệ trong trạng thái quảng cáo, không bấm nút đối chứng ở video thường; gỡ thay đổi do mình tạo khi tắt.
- Quy tắc DNR giới hạn initiator YouTube/host quảng cáo; lỗi cập nhật DNR không được ghi thành công vào preferences.
- Sender từ trang web không được gọi lệnh đặc quyền; options chỉ được nhập cài đặt quảng cáo, không được bắt đầu capture.
- Popup áp dụng trạng thái đã xác nhận, về 100% và khôi phục control khi API trả lỗi capture.
- Kiểm tra ZIP dùng build được chọn, thay thế archive cũ và từ chối `.env`.
- Phím tắt dùng metadata `defaultKey` nên round-trip qua hàm nhập/xuất chung được giữ đúng; giá trị enum lẻ như `frameSync=1.5` bị từ chối, số thập phân theo step hợp lệ vẫn được nhận.

Review độc lập toàn branch tìm 4 lỗi Important, không có lỗi Critical hoặc Minor. Cả 4 đã được tái hiện RED rồi sửa GREEN: cache enabled trước/trong khởi tạo, menu trên player đã rời trang, metadata phím tắt và validation step. Suite đầy đủ sau sửa: **24 đạt, 1 SKIP**, không có test thất bại. Không có hạng mục Minor hoãn xử lý.

## Cấu hình môi trường đã lưu

Draft đã lưu thành công `install_script`, `start_skill` và các miền `www.youtube.com`, `i.ytimg.com`, `s.ytimg.com`, `*.googlevideo.com`, giữ các preset package-manager có sẵn. Script kích hoạt Node, cài theo lockfile, build và kiểm tra tài nguyên; không chạy dịch vụ thường trực. Draft chưa áp dụng hoặc xuất bản; cần xem/lưu trong cài đặt môi trường rồi xuất bản để kích hoạt. Việc xuất bản và khôi phục ở task mới chưa được kiểm chứng.

## Giới hạn của kết quả

Browser component tests chạy **bundle/module production với adapter Chrome API trong fixture**. Chúng không thay thế việc nạp extension, kiểm tra isolated world, quyền tabCapture hoặc DNR thực tế.

Policy `/etc/chromium/policies/managed/extensions.json` có `ExtensionInstallBlocklist: ["*"]`. Cách nạp qua CDP được hỗ trợ cũng trả: `Loading of unpacked extensions is disabled by the administrator.` Không thay đổi hoặc vượt policy này.

Request HTTPS tới `https://www.youtube.com/` bị proxy từ chối CONNECT với HTTP 403. Chưa quan sát được quảng cáo hoặc phát video từ YouTube thật trong cloud. Thay network allowlist không giải quyết policy cài extension.

Do đó **chưa xác minh**: cài Load unpacked thực tế; thu/phát âm thanh tab và trả đường âm thanh gốc; quyền qua toolbar; fullscreen trong khi capture; request bị DNR chặn trên mạng thật; tỷ lệ chặn quảng cáo; tương thích YouTube đang triển khai; hiệu năng GPU thực, HDR, VR/360, PiP, embed và livestream thực. Đây là bản thử nghiệm có các hạng mục kiểm chứng còn thiếu, chưa được gọi hoàn thiện hoặc sẵn sàng phát hành Store.

## Checklist Chrome cục bộ còn phải chạy

1. Giải nén ZIP, bật Developer mode và Load unpacked trong trình duyệt được quản trị viên cho phép. Ghi phiên bản Chrome, kiểm tra manifest/service worker/popup không lỗi.
2. Phát video thường, playlist và livestream. Bật/tắt Ambient; thử màu, blur, crop/viền, giới hạn FPS, theater và fullscreen. Mở menu nâng cao, đặt phím tắt, reset và nhập/xuất Ambient/file/browser sync.
3. Qua biểu tượng toolbar, bật âm lượng 150%, 200%, 500% trên nguồn âm nhỏ; nghe tín hiệu và méo tiếng. Đóng popup rồi mở lại; âm thanh vẫn chạy và trạng thái chính xác.
4. Bấm về 100%/tắt; kiểm tra âm thanh gốc tiếp tục, không im hoặc phát hai lần. Thử hủy ngay sau khi bật và khi quyền bị từ chối.
5. Hai tab khác mức âm lượng; tắt/đóng một tab không ảnh hưởng tab kia. Chuyển video trong tab, rời YouTube, để worker ngủ và khởi động lại trình duyệt; không capture lại khi chưa bấm bật.
6. Vào/ra fullscreen khi đang capture. Ghi khác biệt theo Chrome/OS; không suy ra từ sự kiện fullscreen giả lập.
7. Với quảng cáo thực sự xuất hiện, ghi loại quảng cáo, nút skip, trạng thái module và ảnh hưởng video chính. Tắt module và kiểm tra request tiếp theo. Không coi một lần không thấy quảng cáo là chứng minh chặn thành công.
8. Nhập cấu hình sai/version lạ phải báo lỗi; file đúng không tự capture. Xuất chẩn đoán chỉ tạo file cục bộ, không gửi báo cáo upstream.

Các lỗi thật được phát hiện ở bước này cần sửa và chạy lại kiểm tra liên quan trước khi chuẩn bị phát hành Chrome Web Store. Gói dùng cho Load unpacked được lưu trong `downloads/` cùng checksum để tải từ GitHub. Chưa xuất bản Chrome Web Store hoặc môi trường cloud.
