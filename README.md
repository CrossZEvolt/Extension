# CrossZ YouTube Enhancer

Extension Chrome tích hợp Ambient light, khuếch đại âm thanh đến 500% và hỗ trợ chặn quảng cáo YouTube. Bản `0.1.0` dành cho thử nghiệm bằng **Load unpacked**, chưa phát hành lên Chrome Web Store.

**Trạng thái:** build và các kiểm tra thành phần đã chạy. Chromium của môi trường cloud chặn cài extension bằng chính sách quản trị; việc nạp extension, thu âm tab, toàn màn hình khi capture và DNR trên mạng thật **chưa được xác minh**. Xem [báo cáo kiểm chứng](docs/validation.md).

## Cài bản dùng thử

1. Tải `artifacts/crossz-youtube-enhancer-0.1.0.zip` và giải nén vào một thư mục cố định trên máy.
2. Mở `chrome://extensions`, bật **Developer mode**, chọn **Load unpacked**.
3. Chọn thư mục vừa giải nén, nơi có `manifest.json`. Khi build từ source, chọn thư mục `dist/`.
4. Tắt bản Ambient light gốc nếu đang cài để tránh hai renderer chạy đồng thời, rồi tải lại các tab YouTube.
5. Mở một video và bấm biểu tượng **CrossZ** trên thanh công cụ Chrome.

Chrome từ phiên bản 121. Trình duyệt có chính sách cấm extension cần quản trị viên cho phép cài; không thay đổi hoặc vượt chính sách để thử bản này.

## Sử dụng

- **Chặn quảng cáo:** bật mặc định. Lọc các host quảng cáo đã đóng gói, ẩn vùng quảng cáo và bấm nút bỏ qua hợp lệ khi xuất hiện. Không bảo đảm chặn được mọi quảng cáo, đặc biệt quảng cáo phía máy chủ hoặc không có nút skip. Không loại bỏ nội dung tài trợ đọc trong video.
- **Âm lượng:** mặc định 100%, không thu âm tab. Bật công tắc để bắt đầu ở 150%, kéo đến tối đa 500%. Bấm **Về 100%** hoặc tắt để dừng capture và trả âm thanh gốc. Khi đóng popup, khuếch đại vẫn tiếp tục; khi đóng tab/rời YouTube, module dọn phiên đó. Mở tab hoặc khởi động lại trình duyệt cần bật lại bằng thao tác người dùng.
- Capture xử lý **mọi âm thanh của tab**, không dùng micro và không đổi âm lượng hệ điều hành. 500% nghĩa là gain tối đa 5× trước bộ giảm đỉnh; âm lượng cảm nhận và méo tiếng phụ thuộc nguồn.
- **Ánh sáng Ambient:** công tắc bật/tắt chung; nút **Cài đặt ánh sáng nâng cao** mở menu trong player. Giữ các tùy chọn màu, viền/crop, bố cục, hiệu năng, thống kê, phím tắt và nhập/xuất của engine gốc. Các nhãn nâng cao giữ ngôn ngữ upstream.
- **Cấu hình & chẩn đoán:** nhập/xuất Ambient và cấu hình CrossZ riêng. File nhập không thể tự bật capture. Lỗi lưu cục bộ có thể xuất để kiểm tra; không gửi tự động đến máy chủ tác giả gốc.

## Phát triển

Repository cloud ở `/workspace/Extension`; dùng checkout sẵn có, không tạo worktree cho task này.

```bash
cd /workspace/Extension
bash tools/bootstrap-node.sh
export PATH=/workspace/.tools/node-v22.5.1-linux-x64/bin:$PATH
npm ci
npm run build
npm run verify:build
npm test
npm run package
```

Bootstrap kiểm tra checksum Node `22.5.1` từ nguồn HTTPS chính thức trước khi cài. ARM64 dùng đường dẫn `node-v22.5.1-linux-arm64/bin`. Trên máy riêng có thể dùng trình quản lý Node với `.nvmrc`; cần các tiện ích `zip`/`unzip` cho đóng gói và kiểm tra archive.

Browser tests dùng Playwright `1.57.0`, mặc định binary Chromium `/usr/lib/chromium/chromium` có sẵn trong cloud. Máy khác đặt `CHROMIUM_EXECUTABLE` tới Chromium đã được cài và cho phép thử extension. Test thành phần chạy production bundles với adapter Chrome API; test cài extension tách riêng và ghi SKIP nếu chính sách quản trị chặn. Các kiểm tra đó không chứng minh quyền `tabCapture` thực tế.

Build làm mới `dist/`; `npm run package` build, verify rồi tạo ZIP mới với manifest ở gốc. Không đưa source map, `.env`, Git metadata hoặc dependency phát triển vào gói.

## Kiểm tra bắt buộc trên Chrome thực tế

Trước khi gọi bản này hoàn thiện, kiểm tra theo [checklist](docs/validation.md): nạp extension không lỗi; video thường/playlist/livestream; bật/tắt 150–500%; âm thanh phục hồi khi về 100%; hai tab độc lập; chuyển trang; toàn màn hình khi capture; quảng cáo quan sát được và các tùy chỉnh Ambient nâng cao. Ghi lại phiên bản Chrome và trường hợp lỗi, không suy ra chặn quảng cáo thành công chỉ vì một video không có quảng cáo.

## Nguồn và giấy phép

Ambient engine: [WesselKroos/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight), MIT, commit `18d17188e5562e5ee913f005192d30c9a60be078`. Giữ bản quyền tác giả; xem [UPSTREAM.md](UPSTREAM.md), [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) và [quyền riêng tư](PRIVACY-POLICY.md).
