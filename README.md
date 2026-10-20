# CrossZ YouTube Enhancer

Extension Chrome/Edge tích hợp Ambient light, khuếch đại âm thanh đến 500%, hỗ trợ chặn quảng cáo YouTube và thử nghiệm AI nâng video SDR 720p/1080p lên 4K trong máy. Bản `0.2.0` dành cho thử nghiệm bằng **Load unpacked**, chưa phát hành lên Chrome Web Store.

**Trạng thái:** build và các kiểm tra thành phần đã chạy. Đã render một khung AI 3840×2160 trên GPU phần mềm; chưa đo tốc độ trên RTX 3050. Chromium của môi trường cloud chặn cài extension bằng chính sách quản trị; việc nạp extension, thu âm tab, toàn màn hình khi capture và DNR trên mạng thật **chưa được xác minh**. Xem [báo cáo kiểm chứng 0.2.0](docs/validation-0.2.0.md).

## Cài bản dùng thử

1. [Tải ZIP bản cài 0.2.0](https://github.com/CrossZEvolt/Extension/raw/refs/heads/main/downloads/crossz-youtube-enhancer-0.2.0.zip), rồi giải nén vào một thư mục cố định trên máy. Nếu trình duyệt mở trang GitHub, bấm **Download raw file** để tải. Bạn cũng có thể mở [file trong thư mục downloads](downloads/crossz-youtube-enhancer-0.2.0.zip).
2. Mở `edge://extensions` trên Edge hoặc `chrome://extensions` trên Chrome, bật **Developer mode**, chọn **Load unpacked**.
3. Chọn thư mục vừa giải nén, nơi có `manifest.json`. Khi build từ source, chọn thư mục `dist/`.
4. Tắt bản Ambient light gốc nếu đang cài để tránh hai renderer chạy đồng thời, rồi tải lại các tab YouTube.
5. Mở một video và bấm biểu tượng **CrossZ** trên thanh công cụ Chrome.

Gói cài đã được build sẵn, không cần Node hoặc chạy lệnh. Nút **Code → Download ZIP** trên GitHub tải mã nguồn; để cài trực tiếp, dùng ZIP trong `downloads/` ở bước 1. [SHA256SUMS](downloads/SHA256SUMS) chứa checksum của gói cài. Khi tự build, `npm run package` tạo gói mới trong `artifacts/`.

Chrome/Edge dùng Chromium từ phiên bản 121. Trình duyệt có chính sách cấm extension cần quản trị viên cho phép cài; không thay đổi hoặc vượt chính sách để thử bản này.

### Nâng cấp từ bản cũ

Giải nén bản 0.2.0 rồi chép toàn bộ nội dung vào thư mục đang được **Load unpacked** sử dụng. Vào `edge://extensions` hoặc `chrome://extensions`, bấm **Reload / Tải lại** trên thẻ CrossZ. Sau đó tải lại các tab YouTube và kiểm tra popup hiển thị **0.2.0**. Unpacked không tự cập nhật khi có commit mới trên GitHub; bấm Reload mà vẫn giữ file cũ sẽ tiếp tục chạy bản cũ.

Nếu dùng một thư mục mới, gỡ bản cũ rồi Load unpacked thư mục mới; thao tác gỡ có thể làm mất cài đặt đã lưu.

## Sử dụng

- **Chặn quảng cáo:** bật mặc định. Từ 0.1.1, chạy riêng ngay đầu trang và loại các trường quảng cáo đã nhận diện trong cấu hình/response player, bên cạnh lọc host quảng cáo, ẩn vùng quảng cáo và bấm nút bỏ qua hợp lệ. Không chặn chung host video hoặc tua video chính. Xem [cơ chế và giới hạn](docs/ad-blocking.md); chưa bảo đảm loại bỏ mọi quảng cáo YouTube thực tế. Không loại bỏ nội dung tài trợ đọc trong video.
- **AI nâng hình lên 4K — thử nghiệm:** trên trang xem video thông thường, chọn nguồn SDR 1280×720 hoặc 1920×1080 rồi bật công tắc AI. Mạng FSRCNN-small đóng gói sẵn chạy bằng WebGPU để tạo khung 3840×2160; popup chỉ báo hoạt động sau khi render được khung hợp lệ và hiển thị FPS xử lý đo được. Mặc định tắt; khi GPU quá chậm/lỗi hoặc đổi nguồn/tab bị ẩn, trả về hình gốc. Chưa xác minh tốc độ trên RTX 3050; đầu ra 4K không bảo đảm chi tiết như video quay 4K. Xem [cách dùng và giới hạn](docs/ai-4k.md).
- **Âm lượng:** mặc định 100%, không thu âm tab. Bật công tắc để bắt đầu ở 150%, kéo đến tối đa 500%. Bấm **Về 100%** hoặc tắt để dừng capture và trả âm thanh gốc. Khi đóng popup, khuếch đại vẫn tiếp tục; khi đóng tab/rời YouTube, module dọn phiên đó. Mở tab hoặc khởi động lại trình duyệt cần bật lại bằng thao tác người dùng.
- Capture xử lý **mọi âm thanh của tab**, không dùng micro và không đổi âm lượng hệ điều hành. 500% nghĩa là gain tối đa 5× trước bộ giảm đỉnh; âm lượng cảm nhận và méo tiếng phụ thuộc nguồn.
- **Ánh sáng Ambient:** công tắc bật/tắt chung; nút **Cài đặt ánh sáng nâng cao** mở menu trong player. Giữ các tùy chọn màu, viền/crop, bố cục, hiệu năng, thống kê, phím tắt và nhập/xuất của engine gốc. Bảng **CrossZ Light Studio** có giao diện tím–xanh dương, nhóm điều khiển và tên tùy chỉnh tiếng Việt; một số mô tả kỹ thuật chuyên sâu giữ tiếng Anh. Xem [giao diện mới](docs/ambient-interface.md).
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

Trước khi gọi bản này hoàn thiện, kiểm tra theo [checklist](docs/validation.md): nạp extension không lỗi; video thường/playlist/livestream; bật/tắt 150–500%; âm thanh phục hồi khi về 100%; hai tab độc lập; chuyển trang; toàn màn hình khi capture; quảng cáo quan sát được và các tùy chỉnh Ambient nâng cao. Với AI, thử riêng nguồn 720p/1080p, tua/dừng/đổi video, fullscreen, bật đồng thời Ambient và ghi FPS xử lý trên GPU thật. Ghi lại phiên bản Chrome/Edge và trường hợp lỗi, không suy ra chặn quảng cáo thành công chỉ vì một video không có quảng cáo.

## Nguồn và giấy phép

Ambient engine: [WesselKroos/youtube-ambilight](https://github.com/WesselKroos/youtube-ambilight), MIT, commit `18d17188e5562e5ee913f005192d30c9a60be078`. Giữ bản quyền tác giả; xem [UPSTREAM.md](UPSTREAM.md), [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) và [quyền riêng tư](PRIVACY-POLICY.md).

Trọng số AI: [Saafke/FSRCNN_Tensorflow](https://github.com/Saafke/FSRCNN_Tensorflow), Apache-2.0, commit `6a4812c4ef1c4f5947d79beafa32a05a6eb4a94d`. Xem [nguồn, chuyển đổi và phép tính](docs/ai-models.md); bản giấy phép đi kèm ZIP trong `models/LICENSE-FSRCNN.txt`.
