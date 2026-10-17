# Báo cáo kiểm chứng — CrossZ 0.1.2

Ngày kiểm tra: 2026-10-17. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64.

| Kiểm tra sau thay đổi cuối | Kết quả |
| --- | --- |
| `npm run build` | Đạt; bundle và SCSS mới được tạo đầy đủ |
| `npm run verify:build` | Đạt; manifest 0.1.2 và tài nguyên hợp lệ |
| `npm test` — unit | 17/17 đạt |
| `npm test` — browser | 28 đạt, 1 SKIP do policy cấm cài unpacked |
| `node tools/package.js` sau build/test | Đạt; ZIP 0.1.2 từ đúng dist vừa kiểm tra |

Tổng cộng **45 đạt, 1 SKIP**, không có test thất bại. Không thêm dependency, quyền, font hoặc dịch vụ mạng. Package/lockfile chỉ tăng version của project, không thay phiên bản các dependency.

## Kiểm tra giao diện

Năm test browser mới kiểm tra điều hướng Light Studio, thanh trượt tác động lên renderer, checkbox/nhóm bằng bàn phím, Escape/close/focus, giữ tùy chỉnh nâng cao khi mở lại, các ID không trùng, cặp section-content liền nhau và panel nằm trong player hẹp. Escape trong editor phím tắt vẫn xóa phím tắt; Escape trong ô số hủy phần nhập chưa áp dụng rồi đóng panel.

Ảnh giao diện được xem trực quan trong fixture bằng bundle/CSS production:

- Player rộng 1066px: panel client 388 × 516px, không tràn ngang.
- Player hẹp 360px, có cả class big/modern: panel client 334 × 354px, không tràn ngang.
- [Ảnh Light Studio](images/ambient-light-studio.png) được chụp từ giao diện render thực trong fixture.

Review độc lập xác nhận right-click reset, HDR reveal trong fixture, bật/tắt renderer bằng Space/Enter, số control ổn định khi mở lại và các khóa/giá trị cài đặt không đổi. Reviewer phát hiện một lỗi Escape ở ô nhập số; đã tái hiện bằng test thất bại, sửa và kiểm chứng lại độc lập. Không còn lỗi chặn hoàn thành nào được tìm thấy trong review đó.

## Giới hạn

Fixture cung cấp adapter Chrome API và player mẫu; hình ảnh và kiểm tra không phải YouTube đang chạy. Policy Chromium vẫn cấm cài unpacked nên kiểm tra cài thật ghi SKIP. Chưa xác minh giao diện trên Edge/YouTube thật, fullscreen hoặc embed thực. Các giới hạn DNR, chặn quảng cáo, tabCapture và GPU đã ghi trong [0.1.1](validation-0.1.1.md) vẫn còn.

Bản này thay giao diện và thao tác của bảng Ambient, không chứng minh mức độ chặn quảng cáo thực tế tốt hơn. Cần người dùng thử bản 0.1.2 trên Edge trước khi chuẩn bị phát hành Chrome Web Store.
