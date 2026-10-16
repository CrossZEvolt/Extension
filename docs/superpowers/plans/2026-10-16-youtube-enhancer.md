# CrossZ YouTube Enhancer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tạo bản Chrome Load unpacked có đầy đủ chức năng Ambient của baseline, khuếch đại âm thanh tối đa 500% và chặn quảng cáo theo phạm vi đã công bố.

**Architecture:** Fork có truy vết từ upstream MV3, giữ renderer và giao diện Ambient nâng cao. Các module Ambient adapter, âm thanh và quảng cáo có hợp đồng riêng; service worker điều phối, offscreen document giữ audio graph, popup tiếng Việt dùng chung trạng thái đã xác nhận.

**Tech Stack:** JavaScript ESM, Chrome Manifest V3, Web Audio, tabCapture/offscreen, Declarative Net Request, Rollup/Babel/Sass, Node test runner, Playwright `1.57.0`.

**Spec:** [Đặc tả đã duyệt](../specs/2026-10-16-youtube-enhancer-design.md). Người dùng đã duyệt ngày 2026-10-16; đọc cả đặc tả và kế hoạch trước khi thực hiện.

**Status:** Đã triển khai Native sau khi người dùng đồng ý. Xem `docs/validation.md` để phân biệt kiểm tra đạt và nghiệm thu trình duyệt đang bị chặn.

## Global Constraints

- Làm việc trực tiếp tại `/workspace/Extension`; cloud task đã được cô lập, không tạo Git worktree.
- Baseline: commit `18d17188e5562e5ee913f005192d30c9a60be078` trên nhánh `develop`, package version `2.38.17` của `WesselKroos/youtube-ambilight`.
- Manifest V3, yêu cầu Chrome từ 121 theo manifest nguồn. Dùng Node `22.5.1` theo pin của baseline ở giai đoạn tích hợp để tái hiện build.
- Mặc định 100%, không capture. Công tắc khuếch đại tắt. Lần đầu bật dùng 150%; khoảng 100–500%, gain 1–5.
- Chặn quảng cáo mặc định bật; giữ cài đặt Ambient gốc, trong đó `enabled` mặc định `true`.
- Bảng điều khiển mới dùng tiếng Việt. Các màn hình Ambient nâng cao giữ giao diện và ngôn ngữ hiện có của upstream trong bản đầu tiên.
- Giữ MIT và ghi công; không gửi dữ liệu đến Sentry/biểu mẫu gỡ cài đặt của upstream. Không backend, tài khoản hoặc khóa API.
- Mọi JavaScript và tài nguyên thực thi phải nằm trong gói build; không CDN script, remote import hoặc thực thi chuỗi code.
- Không yêu cầu `<all_urls>`, quyền micro hoặc camera. Quyền dự kiến: `storage`, `tabCapture`, `offscreen`, `declarativeNetRequest`, `activeTab`.
- Giữ dữ liệu/commit sẵn có; import có chọn lọc, không chép `.git`, `.env*`, workflow phát hành hoặc thông tin xác thực upstream.
- Mỗi task có commit riêng sau kiểm chứng. Không push, nộp hoặc xuất bản lên Chrome Web Store trong mốc này.

## Review Focus

1. Người dùng bấm tắt khi capture còn đang khởi tạo: stream đến muộn phải bị dừng, không tự bật lại — Task 3.
2. Nhiều tab và service worker ngủ/khởi động lại: gain độc lập, không tạo capture trùng, snapshot phản ánh offscreen — Task 3.
3. Video thường có phần tử giống nút quảng cáo: không click, ẩn hoặc tua video chính — Task 4.
4. Popup mở khi video chưa sẵn sàng hoặc điều hướng SPA liên tiếp: báo chưa sẵn sàng, không chờ vô hạn hay gắn listener trùng — Tasks 2, 5.
5. Cấu hình nhập có khóa lạ, giá trị sai hoặc trạng thái capture cũ: từ chối phần không hợp lệ và không tự capture — Tasks 2, 5.

## File Map and Interfaces

Giữ cây `src/` của baseline. Các file mới dưới đây dùng import có đuôi `.js` để kiểm thử ESM bằng Node; không tái cấu trúc các file renderer lớn chỉ để đổi phong cách.

| File/nhóm | Trách nhiệm |
| --- | --- |
| `tools/bootstrap-node.sh`, `.gitignore`, `package.json`, `package-lock.json` | Toolchain có checksum, dependency/build/test tái lập |
| `UPSTREAM.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `docs/upstream/ambient-settings.json` | Nguồn, giấy phép và danh mục tính năng baseline |
| `src/scripts/features/shared/{protocol,preferences}.js` | Kiểm tra lệnh, kiểu dữ liệu, cấu hình sản phẩm và import/export |
| `src/scripts/features/ambient/adapter.js` | Điều khiển live renderer và mở menu gốc |
| `src/scripts/features/audio/{graph,sessions,coordinator}.js`, `src/scripts/offscreen.js`, `src/offscreen.html` | Đồ thị âm thanh, tài nguyên theo tab, cầu nối Chrome API |
| `src/scripts/features/ads/{controller,rules}.js`, `src/rules/youtube-ads.json` | Observer quảng cáo và bật/tắt static DNR ruleset |
| `src/scripts/features/worker.js` | Router lệnh có kiểm tra sender; được import bởi entry background |
| `src/popup.html`, `src/styles/popup.css`, `src/scripts/popup.js` | UI tiếng Việt, trạng thái và lỗi theo tab |
| `src/scripts/libs/errors/local-reporter.js` | Lỗi cục bộ; giữ shim API tương thích ở đường dẫn reporter cũ |
| `tests/unit/`, `tests/browser/`, `tests/helpers/`, `tests/fixtures/` | Kiểm tra hành vi, browser context cô lập và nội dung giả lập |
| `tools/{verify-build,package}.js`, `README.md`, `PRIVACY-POLICY.md`, `docs/validation.md` | Kiểm chứng bản build, ZIP và hướng dẫn dùng thử |

Hợp đồng dùng chung, định nghĩa bằng JSDoc tại `protocol.js`:

- `AudioState = {state:'inactive'|'starting'|'active'|'stopping'|'error', percent:number, error?:{code:string,message:string}}`.
- `Snapshot = {tabId:number|null,isYouTube:boolean,ambientEnabled:boolean,adBlockingEnabled:boolean,audio:AudioState}`.
- `Reply<T> = {ok:true,data:T} | {ok:false,error:{code:string,message:string}}`.
- Lệnh popup: `GET_SNAPSHOT`, `AMBIENT_SET_ENABLED {enabled:boolean}`, `AMBIENT_OPEN_SETTINGS`, `AD_SET_ENABLED {enabled:boolean}`, `AUDIO_SET_GAIN {percent:number}`, `AUDIO_STOP`; lệnh theo tab có `tabId:number`.
- Thông điệp có `channel:'crossz-worker'|'crossz-audio'|'crossz-content'`. Kiểm tra channel/type/payload và sender thực; không coi trường `channel` do bên gửi khai báo là quyền truy cập.
- Âm lượng chỉ nhận số nguyên hữu hạn từ 100 đến 500. Không tự chuyển chuỗi, NaN hoặc số ngoài khoảng thành lệnh hợp lệ.

## Sequence and Verification

Task 1 → Task 2 → Tasks 3/4 → Task 5 → Task 6. Tasks 3 và 4 có thể thực hiện độc lập sau hợp đồng Task 2; việc sửa manifest/build chung phải do một người tích hợp để tránh ghi đè.

Unit tests dùng `node --test`. Browser tests dùng Node test runner và Playwright persistent context trong thư mục `/tmp` riêng, với `/usr/bin/chromium` trong cloud; máy khác có thể chỉ định `CHROMIUM_EXECUTABLE`. Bỏ default flag `--disable-extensions` khi load extension. Test server chỉ bind loopback và tự dọn khi kết thúc; không tạo preview công khai.

Hiện có Chromium `154.0.8037.57`; chưa có bằng chứng tự động hóa được thao tác toolbar cấp quyền tabCapture. Mở `popup.html` như trang web thông thường không thay thế thao tác đó. Không đánh dấu kiểm tra capture thực tế là đạt từ mock/OfflineAudioContext. Thử runtime trình duyệt được hỗ trợ nếu có; nếu vẫn thiếu khả năng, hoàn tất kiểm tra độc lập và ghi chính xác kiểm tra Chrome cục bộ còn thiếu.

### Task 1: Bản Ambient MV3 có thể build và nạp độc lập

**Files:** Create/import cây `src/`, các file build và lockfile của baseline; create `tools/bootstrap-node.sh`, `tools/verify-build.js`, `tests/browser/baseline.test.js`, `tests/unit/local-reporter.test.js`, `tests/helpers/browser.js`, `tests/fixtures/player.html`, `UPSTREAM.md`, `THIRD_PARTY_NOTICES.md`, `docs/upstream/ambient-settings.json`; modify `package.json`, `rollup.config.js`, `manifest-copy.js`, `.gitignore`, `src/manifest.json`, `src/scripts/background.js`, `src/scripts/libs/errors/sentry-reporter.js`, `src/scripts/libs/storage.js`, `src/scripts/options.js`, `src/options.html`, `src/scripts/libs/messaging/{content,injected,utils}.js`; create `src/scripts/libs/errors/local-reporter.js`.

**Interfaces:** Produces `dist/` MV3 with working Ambient/options; `verifyBuild(distDir:string):Promise<void>` rejects missing manifest resources, remote executable assets or wrong version; `recordLocalError(error:Error):Promise<void>` and `exportLocalErrors():Promise<string>`. Preserve reporter exports `parseSettingsToSentry`, `setVersion`, mutable `crashOptions`, `setCrashOptions`, default class with static `captureException(ex):Promise<void>` as local-only shim. Browser helpers tại `tests/helpers/browser.js`: `launchExtension(distDir:string):Promise<{context,extensionId,worker,page,close}>`, `ambientCanvasUpdatesWithVideo(page:Page):Promise<boolean>`, `canOpenOriginalSettings(page:Page):Promise<boolean>`; `close():Promise<void>` dọn context/profile/server. Fixture tạo clip đỏ/xanh cùng origin bằng Canvas captureStream/MediaRecorder rồi phát qua video thật.

- [ ] **Step 1: Chuẩn bị toolchain và test harness cần cho deliverable này.** Viết bootstrap cài Node vào `/workspace/.tools/` từ nodejs.org, kiểm tra tarball với `SHASUMS256.txt` qua HTTPS trước khi giải nén. Xác nhận `node --version` là `v22.5.1`. Khởi tạo package/lockfile/build tooling từ đúng SHA, chưa import source sản phẩm; thêm Playwright `1.57.0` và scripts `test:unit` = `node --test tests/unit/*.test.js`, `test:browser` = `node --test --test-concurrency=1 tests/browser/*.test.js`, `test` chạy lần lượt hai suite, `verify:build` gọi tool verify. Cài theo lockfile, ghi thay đổi lockfile có chủ đích. Không chép `.env*` upstream hoặc gọi upload sourcemap.
- [ ] **Step 2: Viết smoke test trước khi import sản phẩm.** Test `baseline renders video-dependent ambient and opens its menu` trong `baseline.test.js` dùng fixture có player DOM/API tối thiểu và `ytd-app`/`ytd-watch-flexy`; assertion thực: `assert.equal(workerErrors.length,0)`, `assert.equal(await ambientCanvasUpdatesWithVideo(page),true)`, `assert.equal(await canOpenOriginalSettings(page),true)`. Helper phải quan sát canvas/menu thật, không thay renderer bằng stub. `verify-build` duyệt manifest, HTML/script/resource references và kiểm tra đủ tài nguyên.
- [ ] **Step 3: Chạy để thấy thất bại đúng nguyên nhân.** `node --test tests/browser/baseline.test.js` chưa thể đạt vì chưa có source/build; lưu lỗi cụ thể. Sau khi harness có thể chạy, chứng minh smoke assertion thất bại khi không nạp extension.
- [ ] **Step 4: Import và điều chỉnh baseline.** Lấy đúng SHA qua HTTPS Git proxy, kiểm tra HEAD rồi chép có chọn lọc source/assets cần thiết, không thay metadata Git dự án và không ghi đè script/dependency test đã thêm. Đặt tên riêng/version `0.1.0`, giữ minimum Chrome `121`, sửa metadata MIT, tạo icon riêng bằng SVG và công cụ chuyển PNG có sẵn; giữ giấy phép. Đổi namespace bridge và các DOM ID cố định có thể xung đột; không cần đảm bảo hai renderer chạy đồng thời. Snapshot tên setting từ source baseline và giữ nguyên các tùy chọn. Loại Sentry/dotenv/upload khỏi build/runtime; thay reporter bằng chẩn đoán lưu tại storage.local, serialize ghi để giữ tối đa 100 lỗi gần nhất, lọc URL video và stream ID khỏi nội dung. Giữ đường chuyển lỗi injected → isolated content sẵn có; options đọc cùng kho để export. Bỏ donation và URL gỡ cài đặt của tác giả gốc, sửa UI options cho đúng hành vi cục bộ. Rollup giữ entry gốc; worker entry không phụ thuộc DOM/window.
- [ ] **Step 5: Kiểm chứng và commit.** Chạy `npm ci`, `npm run build`, `npm run verify:build`, browser smoke và unit tests của local reporter (ghi quá 100 lỗi chỉ giữ 100; export không có URL/stream ID). Theo dõi request để khẳng định không gửi tới endpoint Sentry/feedback upstream. Bản này phải hoạt động như Ambient độc lập trước khi thêm module khác. Commit `feat: establish attributed MV3 ambient baseline`.

### Task 2: Hợp đồng lệnh, cấu hình và Ambient adapter

**Files:** Create `src/scripts/features/shared/{protocol,preferences}.js`, `src/scripts/features/ambient/adapter.js`, `src/scripts/features/worker.js`, `tests/unit/{protocol,preferences,ambient-adapter}.test.js`, `tests/browser/ambient-lifecycle.test.js`; modify `src/scripts/{background,content,content-main,options}.js` và cầu nối options cần thiết.

**Interfaces:** `parsePopupCommand(message:unknown,sender:MessageSender,extensionOrigin:string):Command|null`; `readPreferences():Promise<{schemaVersion:1,adBlockingEnabled:boolean}>`; `writePreferences(next):Promise<void>`; `parseImportedPreferences(json:string):{schemaVersion:1,adBlockingEnabled:boolean}`; `createAmbientAdapter(getInstance:()=>Ambientlight|null):{setEnabled(boolean):Promise<void>,openSettings():Promise<void>,getEnabled():boolean|null}`; `getSnapshot(tabId:number|null):Promise<Snapshot>`. Các lệnh audio/ads chưa triển khai trả `NOT_AVAILABLE`, không báo thành công giả.

- [ ] **Step 1: Viết kiểm thử ranh giới và vòng đời.** Các test `rejects untrusted sender`, `rejects invalid import without partial writes`, `settings before initialization returns PLAYER_NOT_READY`, `enabled changes both live tabs` phải có assertion: `assert.equal(parsePopupCommand(pageSpoof,pageSender,origin),null)`; `assert.throws(()=>parseImportedPreferences('{"schemaVersion":1,"adBlockingEnabled":"yes"}'))`; từ chối khóa lạ, `__proto__`, dữ liệu capture và version không hỗ trợ; `assert.rejects(adapter.openSettings(),{code:'PLAYER_NOT_READY'})` khi chưa có instance. Import hợp lệ không gọi API capture. Browser test hai tab: đổi enabled và kiểm tra cả hai renderer dừng/chạy, điều hướng SPA nhiều lần không thêm renderer/listener trùng.
- [ ] **Step 2: Chạy test để xác nhận RED.** `node --test tests/unit/protocol.test.js tests/unit/preferences.test.js tests/unit/ambient-adapter.test.js`; ghi lỗi thiếu API/hành vi, không chấp nhận thất bại vì cấu hình runner.
- [ ] **Step 3: Implement các interface.** Dữ liệu sản phẩm ở key `crossz-preferences-v1`, tách khỏi khóa Ambient `setting-*`; đọc enabled từ `setting-enabled`, mặc định true. Gọi `ambientlight.toggleEnabled(value)` để đổi live renderer, không chỉ ghi storage; bổ sung xử lý `setting-enabled` thay đổi cho các tab và tránh lặp ghi. Chỉ mở `ambientlight.settings.onSettingsBtnClicked()` khi instance đã initialized và menu sẵn sàng; trả `PLAYER_NOT_READY` ngay khi chưa có. Popup sender phải là URL popup của chính extension; DOM không được chuyển tiếp lệnh đặc quyền. Options giữ import/export Ambient với kiểm tra schema/kiểu/khoảng của SettingsConfig, tách import/export preferences mới; lỗi validation không được ghi một phần. Capture không nằm trong dữ liệu export.
- [ ] **Step 4: Chạy kiểm chứng và commit.** Unit tests trên, build và `node --test tests/browser/ambient-lifecycle.test.js` đều đạt; menu mở được và đổi setting có tác dụng thực trên canvas. Commit `feat: add validated settings and live ambient controls`.

### Task 3: Khuếch đại âm thanh theo tab và vòng đời capture

**Files:** Create `src/scripts/features/audio/{graph,sessions,coordinator}.js`, `src/scripts/offscreen.js`, `src/offscreen.html`, `tests/unit/audio-sessions.test.js`, `tests/unit/audio-coordinator.test.js`, `tests/browser/audio-graph.test.js`; modify `src/scripts/features/worker.js`, `src/scripts/background.js`, `src/manifest.json`, `rollup.config.js`, `package.json` cho tài nguyên offscreen.

**Interfaces:** Consumes `Command`, `AudioState`, `Reply` của Task 2. `createAudioGraph({context:BaseAudioContext,source:AudioNode,percent:number}):{setPercent(number):void,dispose():void}`; `createSessionManager({getStream,createContext}):{start(tabId:number,streamId:string,percent:number):Promise<AudioState>,setPercent(tabId:number,percent:number):Promise<AudioState>,stop(tabId:number):Promise<AudioState>,snapshot():Record<number,AudioState>}`; `createAudioCoordinator(chromeApi):{setGain(tabId:number,percent:number):Promise<AudioState>,stop(tabId:number):Promise<AudioState>,snapshot(tabId:number):Promise<AudioState>}`.

- [ ] **Step 1: Viết RED tests cho tín hiệu và tài nguyên.** Test `measures unclipped gain and reduces loud peaks` dùng production graph và OfflineAudioContext: tín hiệu mức `0.01` ở gain 100/150/500 cho RMS tương ứng theo tỉ lệ `1/1.5/5`, sai số 2%; tín hiệu lớn có đỉnh thấp hơn đường không nén. Tests `stops a late stream after cancellation`, `isolates two tab sessions`, `rehydrates without recapture` kiểm tra hai tab khác gain; stop tab A không stop track B; stop khi `getStream()` còn pending rồi resolve phải dừng stream mới và vẫn inactive; tạo context lỗi phải stop mọi track đã cấp. Coordinator tests worker tái tạo hỏi offscreen trước khi capture, double-click không tạo stream trùng, tab rời YouTube/URL không đọc được phải stop. Input `99`, `501`, `NaN`, chuỗi và số lẻ đều bị từ chối.
- [ ] **Step 2: Xác nhận RED.** `node --test tests/unit/audio-sessions.test.js tests/unit/audio-coordinator.test.js tests/browser/audio-graph.test.js`; phân biệt lỗi test/harness với API chưa có.
- [ ] **Step 3: Implement graph và session manager.** Gain có ramp 20ms; DynamicsCompressor giảm đỉnh với threshold `-3dB`, knee `0`, ratio `20`, attack `0.003s`, release `0.1s`; không gọi đây là giới hạn đỉnh tuyệt đối. Offscreen giữ Map theo tab, dọn ended tracks, dùng generation/cancellation để vô hiệu hóa kết quả khởi tạo đã bị hủy. Stop idempotent, stop track/close context và không bỏ sót graph dở dang. Không dùng MediaElementAudioSource để dự phòng.
- [ ] **Step 4: Implement Chrome coordinator và router.** Thêm `tabCapture`, `offscreen`, `activeTab`; tạo duy nhất offscreen document với reason `USER_MEDIA`, kiểm tra API schema thực tế. Stream ID chỉ truyền từ worker sang offscreen, không lưu vào storage/log/DOM. Serialize lệnh theo tab, rehydrate từ offscreen sau worker restart. `percent=100` tương đương stop; mức trên 100 chỉ bắt đầu từ lệnh popup hợp lệ ở tab `https://www.youtube.com/`. Chuyển video/SPA giữ capture; điều hướng top-level không xác minh được origin phải dừng. Lỗi trả `Reply` và trạng thái thực, không retry capture tự động. Đóng offscreen khi không còn session hoặc việc đang khởi tạo.
- [ ] **Step 5: Kiểm chứng và commit.** Chạy unit tests, OfflineAudioContext browser test và build. Thử toolbar capture thực tế nếu runtime hỗ trợ; ghi riêng kiểm tra chưa chạy nếu thiếu thao tác cấp quyền. Không coi graph/mocks là bằng chứng tabCapture hoạt động. Commit `feat: add per-tab audio boost with offscreen lifecycle`.

### Task 4: Lọc quảng cáo có phạm vi và không phá player

**Files:** Create `src/scripts/features/ads/{controller,rules}.js`, `src/rules/youtube-ads.json`, `tests/unit/ad-rules.test.js`, `tests/browser/ads.test.js`, `tests/fixtures/ads.html`; modify `src/scripts/features/worker.js`, `src/scripts/content-main.js`, `src/manifest.json`, `package.json` và style content cho lớp ẩn sở hữu bởi module.

**Interfaces:** Consumes preferences Task 2. `createAdController({document,requestFrame,cancelFrame}):{start():void,stop():void}`; `setAdRulesEnabled(enabled:boolean):Promise<void>`. Static ruleset ID `youtube_ads`; worker chỉ persist preferences sau khi Chrome xác nhận thay đổi ruleset thành công.

- [ ] **Step 1: Viết negative/positive tests.** Fixture có nút skip thật trong player `ad-showing`, nút disabled/ẩn và nút tương tự trong video thường. Assertion: skip hợp lệ được click một lần; các nút đối chứng không click; `video.currentTime` không đổi. Toggle off khôi phục vùng chỉ do module ẩn, giữ nguyên style/hidden có từ trước; start/stop/start không nhân observer. Test quy tắc bằng request thật qua browser route có gắn origin YouTube: request ad-only bị chặn, request media `googlevideo.com` và request từ initiator ngoài YouTube vẫn đi qua; khi tắt, request tiếp theo đi qua. DNR lỗi không persist trạng thái thành công.
- [ ] **Step 2: Xác nhận RED.** `node --test tests/unit/ad-rules.test.js tests/browser/ads.test.js`; response/request đối chứng phải hoàn tất trong harness, không quy mọi lỗi mạng thành chặn thành công.
- [ ] **Step 3: Implement rules và controller.** Đóng gói quy tắc block cho `doubleclick.net`, `pagead2.googlesyndication.com` với `initiatorDomains:["youtube.com"]`; không block chung googlevideo/player API. Controller chỉ scan container quảng cáo cụ thể (`ytd-ad-slot-renderer`, `ytd-display-ad-renderer`, `ytd-promoted-sparkles-web-renderer`, overlay quảng cáo), đặt attribute `data-crossz-ad-hidden` thay vì ghi đè inline style. Skip chỉ trong player `ad-showing`/`ad-interrupting` với button hiện và enabled; hỗ trợ các selector skip đã kiểm tra trong fixture. Coalesce mutation scans trong một animation frame; stop disconnect observer/cancel frame/gỡ attribute sở hữu. Không seek, reload hoặc sửa response player. Thêm DNR permission, static ruleset và copy JSON vào dist.
- [ ] **Step 4: Kiểm chứng và commit.** Chạy tests, build, browser test toggle/global storage hai tab và kiểm tra requests được chọn. Thử YouTube thật nếu truy cập được; ghi rõ quảng cáo chưa quan sát hoặc chưa bị chặn. Commit `feat: add scoped YouTube ad filtering and skip controls`.

### Task 5: Popup tiếng Việt và tương tác ba module

**Files:** Create `src/popup.html`, `src/styles/popup.css`, `src/scripts/popup.js`, `tests/browser/popup.test.js`, `tests/browser/integration.test.js`; modify manifest action popup, Rollup entries, build assets và worker snapshot.

**Interfaces:** Consumes `Snapshot`, `Reply` và các lệnh Task 2; worker nối kết quả audio Task 3, rules Task 4 và live Ambient. `loadPopupState(tabId:number|null):Promise<Snapshot>`; `renderPopupState(snapshot:Snapshot):void`; mỗi thao tác UI gọi lệnh đã định nghĩa, không gọi riêng renderer hoặc capture API.

- [ ] **Step 1: Viết browser RED tests.** Có đúng ba vùng theo thứ tự quảng cáo → âm lượng → Ambient, toàn bộ nhãn mới tiếng Việt; slider min `100`, max `500`, step `1`, giá trị mặc định `100`. Nút bật lần đầu gửi `150`, về `100` gửi stop. Pending UI không cho gửi lệnh trùng; chỉ phản ánh trạng thái sau reply; lỗi rules/capture giữ trạng thái cũ hoặc inactive thực. Ngoài YouTube vô hiệu hóa khuếch đại, cài đặt chung vẫn thay đổi được. Kiểm tra focus/keyboard, menu Ambient chưa sẵn sàng và import hợp lệ không tự capture. Integration test chạy các module cùng video fixture, SPA đổi video, toggle liên tiếp, fullscreen event/resize; không nhân canvas hoặc mất chức năng player.
- [ ] **Step 2: Xác nhận RED.** `node --test tests/browser/popup.test.js tests/browser/integration.test.js`; không dùng phần mở popup URL để đánh dấu quyền capture là đã cấp.
- [ ] **Step 3: Implement UI và entry wiring.** Dùng label/fieldset, trạng thái chữ và focus rõ; slider hiển thị phần trăm. Popup lấy tab sau thao tác extension action qua activeTab, GET_SNAPSHOT và cập nhật reply. Bật/tắt quảng cáo/Ambient là cài đặt chung; audio theo tab. Mở Ambient qua adapter, hiển thị hướng dẫn khi nhận `PLAYER_NOT_READY`. Giữ options gốc riêng để nhập/xuất và chẩn đoán. Không thêm bộ đếm quảng cáo suy đoán, telemetry hoặc nguồn code ngoài.
- [ ] **Step 4: Kiểm chứng và commit.** Chạy build, toàn bộ unit/browser suites một lần sau tích hợp; kiểm tra screenshot popup bằng công cụ xem ảnh. Nếu có failure, chẩn đoán và chạy lại check liên quan. Commit `feat: integrate Vietnamese controls for YouTube enhancements`.

### Task 6: Bản Load unpacked, báo cáo và môi trường tái sử dụng

**Files:** Create `tools/package.js`, `tests/unit/package.test.js`, `README.md`, `docs/validation.md`; modify `PRIVACY-POLICY.md`, package scripts và build notice-copy. Save cloud configuration bằng công cụ, không ghi credential hoặc metadata nội bộ vào repository.

**Interfaces:** Consumes `verifyBuild()` Task 1 và `dist/`; `packageExtension({distDir:string,outputFile:string}):Promise<void>` tạo `artifacts/crossz-youtube-enhancer-0.1.0.zip` với manifest ở gốc và MIT/notices được build vào gói. `npm run package` phải build/verify trước khi ZIP, không đóng gói build cũ.

- [ ] **Step 1: Viết RED test nội dung ZIP.** `package.test.js` kiểm tra entry names, manifest ở gốc, references có tài nguyên, MIT/notices có mặt; không có `.env*`, Git metadata, node_modules, tests hoặc file tạm. Test phải kiểm tra ZIP được tạo trong chính lần chạy và từ đúng dist được chọn.
- [ ] **Step 2: Xác nhận RED rồi implement packager.** `node --test tests/unit/package.test.js` phải thất bại khi chưa có packager; implement bằng thư viện chuẩn hoặc `zip` có sẵn, bảo toàn exit code và validate nội dung sau tạo. Ghi scripts `test:unit`, `test:browser`, `test`, `build`, `verify:build`, `package` đúng lệnh thực tế.
- [ ] **Step 3: Chạy acceptance và báo cáo bằng chứng.** `npm ci`, `npm run test:unit`, `npm run build`, `npm run verify:build`, `npm run test:browser`, `npm run package`; ghi số test, exit code, browser/version và artifact của lần chạy. Kiểm tra Ambient thường/theater/fullscreen, màu/viền/FPS/import/export; ghi riêng HDR/VR/PiP/embed hoặc GPU chưa thử. Thực hiện toolbar capture trên Chrome thật nếu có công cụ: bật 150/500, đóng popup, hai tab, về 100/tắt, chuyển video/trang, tab đóng và fullscreen. Nếu thiếu, ghi rõ chưa kiểm chứng đường capture thật; không gọi hoàn thiện/sẵn sàng dùng chỉ vì mock và audio graph đạt. Thử request YouTube thật; khi có chặn mạng, kiểm tra cấu hình hiện có và lưu chính xác domain cần thêm qua draft mà không thay danh sách chưa biết.
- [ ] **Step 4: Viết hướng dẫn và lưu cấu hình đã thử.** README tiếng Việt giải thích Load unpacked chọn dist, cấp quyền/bật khuếch đại, capture là toàn bộ âm thanh tab, giới hạn quảng cáo và âm lượng. Privacy policy nêu local diagnostics, browser sync và storyboard requests YouTube. Lưu install_script hoàn chỉnh với working directory, kích hoạt Node, `npm ci`/build; lưu start_skill có kích hoạt toolchain, bước build/test, không tạo worktree và không dựa vào tiến trình cũ. Không cần server chạy thường trực. Draft save phải xác nhận thành công, không tự publish; nếu bị chặn hoặc persistence chưa rõ thì báo đúng trạng thái. Exercise lại setup theo hướng dẫn; không chạy lại suites đã đạt nếu không có thay đổi liên quan.
- [ ] **Step 5: Commit và review cuối.** `git diff --check`, xem status/files sinh ra và notices, commit `chore: package unpacked release and document verified setup`. Review toàn branch theo phương thức thực thi người dùng chọn, xử lý các phát hiện có cơ sở rồi chạy lại checks bị ảnh hưởng. Báo rõ code/artifact đã tạo, khả năng đã kiểm chứng, lỗi hoặc kiểm tra còn thiếu và cấu hình draft đã lưu; không push hay publish.

## Coverage and Handoff

Spec §§1–3: Tasks 1/2/5; §4: Task 3; §5: Task 4; §§6–7: Tasks 1/2/5; §§8–10: Tasks 1/6; căn cứ §11 được xác minh qua browser/API trong các task liên quan. Review Focus được gắn với các test cụ thể phía trên.

Tại thời điểm viết kế hoạch, các task chưa chạy; trạng thái hiện tại được ghi riêng trong báo cáo kiểm chứng. Các lựa chọn được đưa ra khi bàn giao kế hoạch:

- **Native — đề xuất:** agent chính thực hiện từng task trong phiên này, có reviewer độc lập toàn branch ở cuối. Phù hợp vì task dùng chung manifest, build và protocol; ít chi phí context hơn.
- **Subagent-driven:** mỗi task có implementer và reviewer mới trước khi sang task kế tiếp, rồi review toàn branch. Nhiều lần kiểm tra độc lập hơn, tốn thêm context và thời gian.
