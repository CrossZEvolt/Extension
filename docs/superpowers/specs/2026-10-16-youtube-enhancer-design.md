# Đặc tả CrossZ YouTube Enhancer

Ngày: 2026-10-16

Trạng thái: Thiết kế hội thoại đã được đồng ý; đặc tả này chờ người dùng duyệt.

Mốc đầu tiên: Chrome desktop, cài bằng **Load unpacked**.

## 1. Mục tiêu đã thống nhất

Tạo một extension tích hợp ba nhóm chức năng trên YouTube:

1. Chặn quảng cáo trong phạm vi kỹ thuật cho phép.
2. Khuếch đại âm thanh của tab YouTube lên tối đa 500%.
3. Giữ các chức năng Ambient light của dự án nguồn đã chọn, thay vì viết lại một hiệu ứng đơn giản.

Người dùng sẽ thử bản Load unpacked trước. Sau khi chức năng ổn định mới chuẩn bị phát hành Chrome Web Store. Việc tạo tài khoản nhà phát triển, nộp bản phát hành và được Store chấp thuận không thuộc mốc đầu tiên.

Tên làm việc là **CrossZ YouTube Enhancer**; có thể đổi tên mà không thay đổi kiến trúc. Bảng điều khiển mới dùng tiếng Việt. Các màn hình Ambient nâng cao giữ giao diện và ngôn ngữ hiện có của upstream trong bản đầu tiên.

Không cần tài khoản ứng dụng, backend hoặc khóa API. Các giới hạn dưới đây là hành vi cần thể hiện rõ trong giao diện và tài liệu, không phải những kết quả đã được kiểm thử.

## 2. Nguồn Ambient light và phạm vi giữ lại

Nguồn: <https://github.com/WesselKroos/youtube-ambilight>.

- Chrome Store ID được đối chiếu qua README: `paponcgjfojgemddooebbgniglhkajkj`.
- Baseline: commit `18d17188e5562e5ee913f005192d30c9a60be078` trên nhánh `develop`, package version `2.38.17`.
- Manifest V3, yêu cầu Chrome từ 121 theo manifest nguồn.
- `master` và tag số `2.38.17` vẫn dùng Manifest V2; không dùng hai bản đó làm nền cho Chrome hiện hành.
- Baseline đã được kiểm tra mã nguồn; chưa xác nhận độ ổn định hoặc sự tương đương hoàn toàn với bản đang phát hành trên Store.
- Giấy phép `LICENSE` là MIT. Giữ nguyên thông báo bản quyền và giấy phép; sửa metadata package đang ghi ISC khi tích hợp, ghi nguồn và SHA trong `UPSTREAM.md` cùng thông báo bên thứ ba.

Tích hợp toàn bộ cây mã nguồn cần thiết của baseline vào dự án, giữ cấu trúc renderer và cài đặt để giảm nguy cơ mất chức năng. Những thay đổi của sản phẩm mới nằm trong các module riêng và adapter nhỏ. Không tải mã nguồn upstream lúc extension đang chạy.

Các nhóm tính năng cần giữ:

| Nhóm | Phạm vi |
| --- | --- |
| Ánh sáng | WebGL/Canvas, độ mờ, độ lan, các cạnh, chuyển tiếp, giảm nhấp nháy, trộn khung hình và giảm dải màu |
| Màu và hình ảnh | Độ sáng, tương phản, saturation, vibrance và các tùy chọn HDR có sẵn |
| Khung video | Nhận diện viền đen hoặc có màu theo chiều ngang/dọc, cắt thủ công, lấp đầy và thu phóng theo bố cục |
| Trang YouTube | Bóng và độ trong suốt của trang/header/video, theme, theater mở rộng và thanh cuộn |
| Chế độ hiển thị | Video thường, theater, toàn màn hình, PiP, embed và VR/360 theo khả năng baseline |
| Hiệu năng | Độ phân giải, giới hạn FPS, đồng bộ khung hình, tiết kiệm năng lượng và các tùy chọn cải thiện độ phản hồi |
| Cấu hình và chẩn đoán | Cài đặt nâng cao trong player, phím tắt, đặt lại, nhập/xuất cấu hình, đồng bộ cài đặt và thống kê |

Danh mục chính xác lấy từ `src/scripts/libs/settings-config.js` và giao diện options tại SHA nêu trên. Khi tích hợp, lưu bản kiểm kê tên cài đặt để phát hiện thiếu sót; chỉ giữ tên cài đặt không đủ chứng minh chức năng hoạt động.

Nhận diện sản phẩm và các dịch vụ của tác giả gốc được tách khỏi chức năng Ambient: dùng tên/icon riêng, giữ ghi công, không gửi lỗi tới Sentry hoặc biểu mẫu gỡ cài đặt của tác giả gốc. Giữ chẩn đoán cục bộ và khả năng xuất thông tin lỗi. Tính năng tiết kiệm năng lượng có thể yêu cầu storyboard từ YouTube; tài liệu quyền riêng tư phải phản ánh điều này.

## 3. Kiến trúc

Giữ pipeline build Rollup/Babel/Sass của upstream. Manifest và tài nguyên được build vào `dist/`; đây là thư mục người dùng chọn khi Load unpacked.

| Thành phần | Trách nhiệm |
| --- | --- |
| Popup tiếng Việt | Công tắc quảng cáo và Ambient, trạng thái tab, thanh âm lượng 100–500%, nút về 100% và mở cài đặt Ambient |
| Service worker | Định tuyến lệnh từ popup, quản lý quy tắc quảng cáo, xin stream cho tab sau thao tác người dùng và phối hợp vòng đời capture |
| Offscreen document | Giữ AudioContext và đồ thị âm thanh của từng tab, tiếp tục hoạt động khi popup đóng hoặc service worker ngủ |
| Content controller | Theo dõi YouTube SPA, điều khiển quảng cáo trên trang, đồng bộ bật/tắt Ambient và mở cài đặt nâng cao |
| Ambient adapter | Kết nối công tắc mới với renderer/cài đặt sẵn có, không gắn logic âm thanh hoặc quảng cáo vào vòng lặp render |
| Storage adapter | Phân biệt cài đặt Ambient, cài đặt sản phẩm và trạng thái khuếch đại theo tab |
| DNR ruleset | Quy tắc chặn quảng cáo được đóng gói cùng extension, có thể bật/tắt |

Các entry upstream `content`, `content-main`, `injected`, `live-chat`, `options` và `background` được giữ hoặc điều chỉnh có chủ đích. Thêm entry popup/offscreen và các module tính năng; không viết lại renderer.

Bridge giữa page world và isolated world phải đổi namespace `ytal-message` và `youtube-ambient-light-extension` sang định danh riêng của sản phẩm. DOM phía trang không có quyền yêu cầu capture, gọi API đặc quyền hoặc sửa quy tắc mạng. Chỉ chấp nhận các loại thông điệp đã khai báo, kiểm tra dữ liệu và nguồn gửi trước khi thực hiện.

## 4. Hành vi âm thanh

### 4.1. Cách hoạt động

- Mặc định 100%, không capture. Công tắc khuếch đại tắt.
- Người dùng mở popup tại tab YouTube và chủ động bật khuếch đại; lần đầu dùng mức 150% để việc bật có tác dụng rõ ràng.
- Dùng `chrome.tabCapture.getMediaStreamId()` qua service worker, chuyển stream ID cho offscreen document.
- Đồ thị: tab stream → MediaStreamAudioSourceNode → GainNode → bộ giảm đỉnh → AudioContext destination.
- Chặn dữ liệu đầu vào ngoài khoảng 100–500%; hệ số gain nằm trong khoảng 1–5. Tăng/giảm gain có chuyển tiếp ngắn để tránh tiếng nổ khi kéo thanh.
- “500%” là tối đa năm lần biên độ tín hiệu đầu vào, không phải cam kết cảm nhận âm lượng lớn gấp năm. Bộ giảm đỉnh có thể giảm mức tín hiệu ở đoạn lớn.
- Capture lấy toàn bộ âm thanh của tab đó, bao gồm âm thanh khác trong cùng tab. Không thay đổi âm lượng hệ điều hành.
- Không dùng `createMediaElementSource(video)` làm đường dự phòng: media khác origin có thể bị im tiếng và việc gắn vào video làm thay đổi đường âm thanh gốc.

### 4.2. Vòng đời

Mỗi tab có trạng thái `inactive`, `starting`, `active`, `stopping` hoặc `error`. Popup hiển thị trạng thái thực do offscreen xác nhận; không suy ra capture đang chạy chỉ từ tùy chọn đã lưu.

- Đóng popup: âm thanh đang khuếch đại tiếp tục chạy.
- Service worker khởi động lại: hỏi offscreen để khôi phục trạng thái, không tạo graph trùng.
- Chuyển video trong cùng trang YouTube: giữ graph của tab; thay video element không tạo capture mới.
- Bấm tắt hoặc về 100%: đưa gain về 1, dừng track và đóng graph của tab, trả âm thanh về đường gốc.
- Đóng tab, stream kết thúc hoặc chuyển top-level tab ra ngoài `https://www.youtube.com/`: dừng capture và dọn tài nguyên của tab đó. Khi điều hướng làm mất khả năng xác minh URL của tab, dừng capture thay vì yêu cầu quyền đọc mọi tab.
- Nhiều tab: graph và gain độc lập; dừng một tab không ảnh hưởng tab khác.
- Khởi động lại trình duyệt hoặc mở tab mới: không tự capture. Cần thao tác bật lại của người dùng.
- Nếu bị từ chối hoặc stream/AudioContext lỗi: dọn stream dở dang, hiển thị thông báo cụ thể và trở về trạng thái không khuếch đại. Không tự lặp việc xin capture.

Chỉ bật khuếch đại từ popup ở tab YouTube top-level. Ambient trong iframe embed vẫn giữ khả năng của upstream; không tự capture các website khác có video nhúng.

## 5. Hành vi chặn quảng cáo

Mặc định bật cho các trang YouTube được hỗ trợ, có công tắc tắt độc lập với Ambient và âm thanh.

Hai lớp xử lý:

1. **Lọc mạng:** static DNR ruleset chặn những đường dẫn hoặc host chỉ phục vụ quảng cáo đã xác định, giới hạn initiator thuộc YouTube. Không chặn chung host phân phối video như `googlevideo.com`, vì có thể làm hỏng video chính.
2. **Xử lý trang:** ẩn vùng quảng cáo đã nhận diện và kích hoạt nút bỏ qua quảng cáo khi nút đó thực sự xuất hiện, khả dụng và nằm trong trạng thái quảng cáo. MutationObserver và sự kiện điều hướng SPA phải được giới hạn công việc, có teardown khi tắt.

Không dùng thao tác tua video chính, sửa chất lượng phát hoặc vòng lặp reload để giả lập chặn quảng cáo. Bản đầu tiên không sửa response video/player, không tải script hay logic lọc từ máy chủ khác.

Giới hạn được công bố rõ: DNR không tách được quảng cáo và nội dung dùng chung một request; quảng cáo phía máy chủ và các thử nghiệm giao diện YouTube có thể không bị chặn. Quảng cáo đọc trực tiếp trong nội dung video không thuộc lớp quảng cáo này. Không hiển thị số lượng quảng cáo đã chặn nếu không có phép đo đáng tin cậy.

Khi không nhận diện được quảng cáo, giữ hành vi player gốc. Khi tắt: dừng observer, khôi phục các phần tử chỉ do module này ẩn và vô hiệu hóa ruleset; request đã bị chặn trước đó không thể được khôi phục ngược thời gian. Popup chỉ cập nhật trạng thái sau khi thay đổi quy tắc thành công.

## 6. Giao diện và lưu cài đặt

Popup có ba khu vực theo thứ tự: chặn quảng cáo, âm lượng, Ambient light. Mỗi khu vực hiển thị trạng thái bằng chữ cùng control, có nhãn truy cập bàn phím và focus rõ ràng. Thanh âm lượng hiển thị giá trị phần trăm hiện tại.

- Ở trang ngoài YouTube: giải thích cần mở YouTube, vô hiệu hóa nút bật khuếch đại của tab hiện tại. Cài đặt chung vẫn có thể xem và thay đổi.
- Nút cài đặt Ambient đưa người dùng tới cài đặt sẵn có của player trên tab YouTube; khi player chưa sẵn sàng, hiển thị hướng dẫn thay vì báo đã mở.
- Giữ trang options hỗ trợ các chức năng nâng cao, nhập/xuất và chẩn đoán cục bộ của baseline.
- Ambient và công tắc chặn quảng cáo là cài đặt chung; đồng bộ thay đổi đến các tab đang mở.
- Trạng thái capture và gain đang áp dụng là dữ liệu phiên theo tab. Không đồng bộ trạng thái chạy qua browser storage sync.
- Cấu hình nhập vào phải kiểm tra schema, kiểu và khoảng giá trị. Nhập cấu hình không khởi chạy capture, không cấp quyền và không thay đổi namespace truyền thông.
- Nhập/xuất cài đặt Ambient gốc tiếp tục hoạt động. Cấu hình của các module mới có schema/version riêng, không làm hỏng các khóa cũ.

## 7. Quyền và dữ liệu

Quyền dự kiến: `storage`, `tabCapture`, `offscreen`, `declarativeNetRequest` và `activeTab` để popup xác định tab hiện tại sau thao tác người dùng. Không dùng quyền `tabs` rộng chỉ để lấy URL của tab được kích hoạt. Nếu triển khai cho thấy quyền dự kiến dư thừa, loại bỏ trước khi đóng gói.

Phạm vi script và tài nguyên truy cập được theo các URL YouTube mà baseline hỗ trợ. Không yêu cầu `<all_urls>`, quyền micro hoặc camera. Không gửi URL video, âm thanh hoặc lịch sử xem tới máy chủ của sản phẩm. Browser storage sync tiếp tục dùng cho các cài đặt Ambient có hỗ trợ đồng bộ.

Mọi JavaScript và tài nguyên thực thi phải nằm trong gói build; không CDN script, remote import hoặc thực thi chuỗi code. Phiên bản Load unpacked dùng cùng kiến trúc Manifest V3 dự kiến cho Store. Việc này không bảo đảm Store sẽ chấp thuận phát hành.

## 8. Công cụ phát triển và môi trường

- Làm việc trực tiếp tại `/workspace/Extension`; cloud task đã được cô lập, không tạo Git worktree.
- Dùng Node `22.5.1` theo pin của baseline ở giai đoạn tích hợp để tái hiện build. Nếu cần nâng phiên bản vì tính tương thích hoặc bảo mật, ghi rõ thay đổi và chạy lại các kiểm tra liên quan.
- Giữ pipeline build được hỗ trợ; cập nhật package/lockfile có chủ đích khi thêm test và module mới. Cài dependency theo lockfile.
- Build tạo `dist/`, ZIP phát hành tạo từ nội dung `dist/`, không đóng gói source, thông tin bí mật hoặc dependency phát triển.
- Thêm kiểm thử logic bằng test runner phù hợp và kiểm thử extension trong Chromium. Kiểm thử trên Chrome desktop thực tế là một mốc riêng.
- Không cần dịch vụ nền của ứng dụng hoặc biến môi trường bí mật. Không cần chạy HTTP server để cài extension.
- Sau khi các lệnh setup/build/test đã chạy thành công, lưu `install_script` và hướng dẫn sử dụng môi trường có thể tái sử dụng bằng công cụ cấu hình cloud. Không mô tả lệnh chưa chạy là đã được xác minh.

## 9. Kế hoạch kiểm chứng và tiêu chí nghiệm thu

Kiểm thử phải phân biệt build thành công, hành vi trong fixture và hành vi trên YouTube thật. Không lấy fixture hoặc một lần không thấy quảng cáo làm bằng chứng chặn được mọi quảng cáo.

| Hạng mục | Kiểm tra có ý nghĩa | Kết quả cần đạt |
| --- | --- | --- |
| Build/manifest | Cài theo lockfile, build, kiểm tra tài nguyên và manifest | `dist/` đầy đủ, Manifest V3 hợp lệ, không thiếu entry hoặc tài nguyên |
| Load unpacked | Nạp extension build trong Chromium/Chrome, kiểm tra service worker, popup và options | Nạp được, control hoạt động, không có lỗi khởi động chưa giải thích |
| Ambient | Kiểm kê setting và test renderer/adapter; kiểm tra thường, theater, fullscreen, SPA và thay video element | Không bỏ cài đặt hoặc chức năng baseline; ánh sáng cập nhật theo video và công tắc có tác dụng |
| Ambient nâng cao | Kiểm tra các nhóm màu, viền/crop, FPS, thống kê, import/export; HDR/VR/PiP/embed khi có nội dung/hardware phù hợp | Ghi riêng kết quả đã thử, lỗi, bỏ qua và chưa thử; không gọi tương thích đầy đủ khi chưa đủ bằng chứng |
| Âm thanh | Dùng tín hiệu mức nhỏ để đo gain 1–5, kiểm tra giới hạn dữ liệu và bộ giảm đỉnh | Gain đúng trong vùng chưa nén; không chấp nhận giá trị ngoài khoảng; tín hiệu lớn được xử lý theo cấu hình giảm đỉnh |
| Vòng đời capture | Bật/tắt, về 100%, đóng popup/tab, đổi trang, stream lỗi, worker ngủ và hai tab | Không nhân đôi âm thanh, không để tab im tiếng sau khi tắt, không rò track/context và không tự capture lại |
| Quảng cáo fixture | Vùng quảng cáo/nút skip hợp lệ và các phần tử video thường có selector tương tự | Chỉ xử lý quảng cáo đã nhận diện; video thường không bị ẩn hoặc tua |
| Quy tắc mạng | Kiểm tra request quảng cáo được chọn và request video/nội dung đối chứng | Chặn đúng phạm vi; công tắc tắt có hiệu lực với request tiếp theo |
| Tương tác ba module | Phát video khi bật cả ba, chuyển video và đổi chế độ hiển thị | Không mất âm thanh, không render trùng, không làm hỏng thao tác player |
| YouTube thật | Video thường, playlist, livestream, chuyển video và quảng cáo quan sát được | Báo cáo điều kiện và hành vi thực tế; ghi các trường hợp chặn quảng cáo chưa hiệu quả |
| Đóng gói/quyền riêng tư | Kiểm tra ZIP, quyền manifest, mã tải từ ngoài, endpoint chẩn đoán và notice MIT | Gói tự chứa tài nguyên thực thi, không gọi dịch vụ lỗi của upstream, có ghi công đúng |

Toàn màn hình khi capture phải được thử trên Chrome thực tế vì hành vi có thể phụ thuộc phiên bản trình duyệt. HDR/VR và hiệu năng GPU cần thiết bị/nội dung phù hợp. Nếu cloud không tái hiện được, ghi rõ giới hạn và cung cấp bước kiểm tra cục bộ; không ghi các kiểm tra đó là đã đạt.

Mốc Load unpacked có thể bàn giao để dùng thử khi build, nạp extension, các luồng chính và kiểm thử hồi quy bắt buộc đã được xác minh đạt. Nếu một luồng chính còn hỏng, bàn giao báo cáo chẩn đoán và không gọi bản đó sẵn sàng sử dụng. Các kiểm tra phụ thuộc thiết bị còn thiếu phải được liệt kê trong báo cáo dùng thử. Chỉ gọi hoàn thiện trước phát hành sau khi đã xử lý các lỗi chức năng chính và hoàn tất kiểm tra thực tế còn thiếu. Chặn quảng cáo vẫn được mô tả đúng phạm vi best effort.

## 10. Bàn giao

- Mã nguồn với nguồn upstream và thay đổi tích hợp có thể truy vết.
- `dist/` dùng cho Load unpacked và ZIP cùng nội dung phục vụ chuyển giao.
- README tiếng Việt: setup, build, cách cài, cách bật khuếch đại, quyền truy cập, giới hạn và cách thu thập lỗi cục bộ.
- Báo cáo test ghi đúng lệnh, kết quả và các kiểm tra chưa chạy.
- Cấu hình setup cloud được lưu sau khi kiểm chứng, nếu workflow cần thêm hướng dẫn tái sử dụng.
- Không tự nộp hoặc xuất bản lên Chrome Web Store trong mốc này.

## 11. Căn cứ kỹ thuật

- [Manifest của baseline](https://github.com/WesselKroos/youtube-ambilight/blob/18d17188e5562e5ee913f005192d30c9a60be078/src/manifest.json)
- [Danh mục cài đặt Ambient](https://github.com/WesselKroos/youtube-ambilight/blob/18d17188e5562e5ee913f005192d30c9a60be078/src/scripts/libs/settings-config.js)
- [Giấy phép MIT](https://github.com/WesselKroos/youtube-ambilight/blob/18d17188e5562e5ee913f005192d30c9a60be078/LICENSE)
- [Chrome tabCapture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture)
- [Chrome offscreen](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome Declarative Net Request](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)
- [Chrome: remote hosted code](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)

Mã nguồn baseline đã được đọc trực tiếp. Các trang tài liệu Chrome bị proxy trả HTTP 403 trong lần nghiên cứu này; nội dung hiện tại của chúng chưa được đối chiếu. Các giả định API trong đặc tả phải được xác minh bằng schema/API có sẵn và kiểm thử trình duyệt khi triển khai.
