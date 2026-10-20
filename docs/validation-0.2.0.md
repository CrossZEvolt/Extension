# Báo cáo kiểm chứng — CrossZ 0.2.0

Ngày kiểm tra: 2026-10-20. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64.

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run build` | Đạt; tạo bundle AI, CSS, manifest và trọng số đóng gói |
| `npm run verify:build` | Đạt; manifest 0.2.0 và tài nguyên hợp lệ |
| `npm test` — unit | 19/19 đạt |
| `npm test` — browser | 62 đạt, 1 SKIP do policy cấm cài unpacked |
| `node tools/package.js` sau build/test | ZIP được tạo từ đúng `dist/` đã kiểm tra; xem checksum trong `downloads/SHA256SUMS` |

Tổng bộ `npm test`: **81 đạt, 1 SKIP**, không có test thất bại. Không thêm dependency npm, quyền extension hoặc dịch vụ suy luận từ xa. Package/lockfile chỉ đổi version project và lệnh build; phiên bản dependency được giữ nguyên.

## Phép tính AI và hiển thị thực

Bảy test WebGPU chạy shader production trên GPU phần mềm SwiftShader. Kết quả x2/x3 được so với phép tính CPU độc lập, gồm convolution HWIO, PReLU, biên thật, đường ghép tile, pixel shuffle, độ sáng và màu. Với hai mô hình đã huấn luyện, sai số kênh màu tối đa trên ảnh nhỏ là **0/255**, đồng thời kết quả khác nội suy bilinear. Test canvas gắn vào trang dùng ảnh chụp màn hình để kiểm tra các pixel được trình bày thực.

Một lần chạy riêng dùng trọng số x3 thật đã tạo khung **1280×720 → 3840×2160** và hiển thị được ảnh gradient đục, xác nhận bằng ảnh chụp. Mất **10.736,8 ms trên GPU phần mềm**; đây là bằng chứng render một khung, không phải tốc độ thời gian thực hoặc số đo RTX 3050. Canvas 4K được thu nhỏ để xem trong ảnh chụp. Đọc lại canvas WebGPU đã được trình bày bằng `drawImage` có thể trả ảnh rỗng trong môi trường thử; ảnh chụp và test hiển thị thực xác nhận đầu ra vẫn hiện đúng. Đường chạy sản phẩm không đọc pixel về CPU.

Converter Python được kiểm tra riêng: bảy bài kiểm tra đạt, gồm 12 biến thể graph sai, tái tạo byte giống hệt, checksum nguồn, giá trị float32 và giấy phép Apache-2.0 nguyên bản. Các kiểm tra converter này không cộng vào số lượng `npm test`. Xem [hồ sơ mô hình](ai-models.md) để tái tạo tài sản.

## Tích hợp và vòng đời

26 test controller dùng engine giả để kiểm tra nguồn 720p/1080p, trạng thái sau khung hợp lệ, đầu ra đúng 3840×2160, bật/tắt, khởi tạo bị hủy, một khung đang xử lý, tua/dừng, quảng cáo, đổi nguồn/video, điều hướng, tab ẩn, HDR/DRM/VR/PiP, mất GPU và dọn tài nguyên. GPU xử lý quá chậm hoặc không hoàn thành khiến canvas bị gỡ để trả hình gốc; timer cũ không được dừng phiên mới. Đây là kiểm tra lifecycle, không đo tốc độ GPU thật.

Test popup kiểm tra chờ xác nhận, kích thước nguồn/đầu ra, tắt và phục hồi công tắc khi GPU báo lỗi. Test worker kiểm tra sender, tab đích và phản ánh trạng thái content script. Những kiểm tra này dùng adapter Chrome API. [Ảnh popup 0.2.0](images/popup-0.2.0.png) chụp giao diện production ở chiều rộng 360px; nội dung cao 804px và cần cuộn trong popup thấp hơn.

Review độc lập đã kiểm tra toán học, màu, tiling, cleanup, quyền gửi lệnh và tính chính xác của trạng thái. Các lỗi HDR độc lập với Ambient, cập nhật khung khi pause/seek, xác nhận kích thước và timeout khung bị treo đã được sửa và có kiểm tra hồi quy.

## Chưa xác minh

- Cài unpacked thực bị chính sách quản trị Chromium chặn, nên bài đó ghi SKIP; không thay đổi hoặc vượt chính sách.
- Mạng cloud không truy cập được YouTube thực. Chưa xác minh quảng cáo, DNR, tabCapture, fullscreen và kết hợp Ambient/AI trên Edge với video thật.
- Chưa chạy trên RTX 3050 của người dùng, chưa đo FPS/chất lượng hình chuyển động thực tế. FSRCNN-small là mô hình ảnh từng khung; có thể nhấp nháy hoặc không đẹp hơn nguồn, không bảo đảm chi tiết như video quay 4K.

Thử theo [hướng dẫn AI](ai-4k.md) trên Edge trước khi chuẩn bị phát hành Chrome Web Store.
