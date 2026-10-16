# Báo cáo kiểm chứng — CrossZ 0.1.1

Ngày kiểm tra: 2026-10-16. Node 22.5.1, Chromium 154.0.8037.57, Playwright 1.57.0, Linux x64. Người dùng báo lỗi trên Microsoft Edge; chưa biết phiên bản Edge cụ thể và chưa chạy Edge thật trong cloud.

| Kiểm tra sau thay đổi cuối | Kết quả |
| --- | --- |
| `npm run build` | Đạt, không có lỗi lint/build |
| `npm run verify:build` | Đạt; manifest 0.1.1 và các tài nguyên tồn tại |
| `npm test` — unit | 17/17 đạt |
| `npm test` — browser | 23 đạt, 1 SKIP do policy cấm cài unpacked |
| `node tools/package.js` sau build và test | Đạt; tạo `artifacts/crossz-youtube-enhancer-0.1.1.zip` từ đúng dist vừa kiểm tra |

Tổng cộng **40 đạt, 1 SKIP**, không có test thất bại. Thay đổi dependency chỉ là version của project; không thêm package hoặc tải filter/script thực thi từ xa.

## Hồi quy được kiểm tra

- Dữ liệu player ban đầu và response fetch JSON/text, clone Response, XHR text/JSON được loại đúng các trường quảng cáo đã nhận diện; streamingData, URL video và dữ liệu không liên quan còn nguyên trong fixture.
- URL khác endpoint player, host khác, JSON lỗi, trạng thái tắt và các detail không phải boolean không bị lọc. Native bodyUsed, status, URL và response headers giữ hành vi bình thường.
- Cầu nối từ production bundle isolated đến MAIN được kiểm tra qua hai execution context Chromium riêng bằng CDP; Chrome storage dùng adapter. Test này không phải cài extension và không chứng minh thứ tự Chrome inject script tại document_start.
- Trạng thái tắt được giữ khi đọc cài đặt đến muộn; lệnh bật mới không bị snapshot khởi động worker ghi đè. Startup reconcile không ghi lại preferences.
- Bộ chặn DOM vẫn chạy khi CSS Ambient trả 404. Công tắc và điều hướng SPA phối hợp với renderer Ambient trong fixture.
- Nút Skip được tái sử dụng sau khi ẩn/disable vẫn hoạt động, không bấm lặp theo mutation không liên quan. Card quảng cáo đổi thành video thường, kể cả sau detach/reinsert, được gỡ marker ẩn và hiển thị lại.
- Các kiểm tra Ambient, audio graph/session/coordinator, popup, quyền gửi lệnh, nhập/xuất và đóng gói cũ vẫn đạt.

Các lỗi khởi động và DOM được tái hiện bằng test thất bại trước khi sửa. Review độc lập phát hiện thêm lỗi marker trên card đã detach; đã tái hiện, sửa và được reviewer kiểm chứng lại. Không còn lỗi quan trọng nào được tìm thấy trong review đó.

## Giới hạn còn lại

Policy quản trị Chromium vẫn cấm cài unpacked; test cài extension ghi SKIP. Proxy cloud từ chối truy cập YouTube thật ở lần kiểm tra đã ghi trong [báo cáo 0.1.0](validation.md); không có thay đổi quyền/mạng để vượt các hạn chế này.

Chưa xác minh trên Edge thật: cài extension, DNR chặn request mạng, tỷ lệ chặn quảng cáo YouTube và playback của player đang triển khai. Các giới hạn audio/tabCapture và GPU thực từ báo cáo 0.1.0 cũng còn nguyên.

Test cấu hình player ban đầu xác nhận bộ lọc sau khi đã nhận công tắc bật; không chứng minh callback đọc storage luôn đến trước khi YouTube tiêu thụ dữ liệu. Bộ lọc không xử lý stream body reader, schema/API khác hoặc quảng cáo ghép phía máy chủ. Xem [cơ chế, giới hạn và checklist Edge](ad-blocking.md). Đây vẫn là bản thử nghiệm cần người dùng kiểm tra thực tế; chưa đủ bằng chứng để tuyên bố chặn hết quảng cáo hay sẵn sàng phát hành Store.
