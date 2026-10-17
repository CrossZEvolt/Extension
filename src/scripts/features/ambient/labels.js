const labels = {
  sectionSettingsCollapsed: 'Điều khiển',
  advancedSettings: 'Tùy chỉnh nâng cao',
  sectionStatsCollapsed: 'Thống kê',
  showFPS: 'Tốc độ khung hình',
  showFrametimes: 'Biểu đồ thời gian khung hình',
  showResolutions: 'Độ phân giải và thời gian vẽ',
  showBarDetectionStats: 'Thống kê nhận diện viền',
  sectionQualityPerformanceCollapsed: 'Chất lượng và hiệu năng',
  webGL: 'Kết xuất WebGL (tiết kiệm điện)',
  resolution: 'Độ phân giải',
  framerateLimit: 'Giới hạn FPS',
  frameSync: 'Đồng bộ khung hình',
  energySaver: 'Tiết kiệm điện khi hình ảnh ít thay đổi',
  prioritizePageLoadSpeed: 'Ưu tiên tốc độ tải trang',
  layoutPerformanceImprovements: 'Cải thiện độ phản hồi của YouTube',
  debandingBlendMode: 'Tối ưu giảm dải màu cho',
  sectionOtherPageHeaderCollapsed: 'Đầu trang',
  headerShadowSize: 'Kích thước bóng đổ',
  headerShadowOpacity: 'Độ đậm bóng đổ',
  headerImagesOpacity: 'Độ rõ hình ảnh',
  headerFillOpacity: 'Độ rõ nền',
  sectionOtherPageContentCollapsed: 'Nội dung trang',
  surroundingContentShadowSize: 'Kích thước bóng đổ',
  surroundingContentShadowOpacity: 'Độ đậm bóng đổ',
  surroundingContentTextAndBtnOnly: 'Chỉ đổ bóng cho chữ và nút',
  surroundingContentImagesOpacity: 'Độ rõ hình ảnh',
  surroundingContentFillOpacity: 'Độ rõ nền của nút và khung',
  pageBackgroundGreyness: 'Độ xám nền trang',
  immersiveTheaterView: 'Ẩn nội dung khác trong chế độ rạp',
  relatedScrollbar: 'Cuộn riêng danh sách video liên quan',
  hideScrollbar: 'Ẩn thanh cuộn',
  sectionVideoResizingCollapsed: 'Video',
  'videoScale.SMALL': 'Kích thước ở chế độ thường',
  'videoScale.THEATER': 'Kích thước ở chế độ rạp',
  'videoScale.FULLSCREEN': 'Kích thước khi toàn màn hình',
  videoShadowSize: 'Kích thước bóng đổ',
  videoShadowOpacity: 'Độ đậm bóng đổ',
  videoDebandingStrength: 'Giảm dải màu bằng nhiễu',
  videoOverlayEnabled: 'Đồng bộ video với ánh sáng',
  videoOverlaySyncThreshold: 'Ngưỡng tắt đồng bộ video',
  chromiumBugVideoJitterWorkaround: 'Khắc phục rung hình video',
  chromiumDirectVideoOverlayWorkaround: 'Khắc phục lỗi hiển thị video',
  sectionHorizontalBarsCollapsed: 'Loại bỏ viền video',
  detectHorizontalBarSizeEnabled: 'Tự động loại bỏ viền đen trên và dưới',
  detectVerticalBarSizeEnabled: 'Tự động loại bỏ viền đen hai bên',
  detectColoredHorizontalBarSizeEnabled: 'Nhận diện và loại bỏ viền màu',
  detectHorizontalBarSizeOffsetPercentage: 'Điều chỉnh độ lệch nhận diện',
  barSizeDetectionAverageHistorySize: 'Số khung hình lấy trung bình',
  barSizeDetectionAllowedElementsPercentage: 'Ngưỡng nhận diện viền',
  barSizeDetectionAllowedUnevenBarsPercentage: 'Ngưỡng chênh lệch giữa các viền',
  horizontalBarsClipPercentage: 'Kích thước viền trên và dưới',
  verticalBarsClipPercentage: 'Kích thước viền hai bên',
  horizontalBarsClipPercentageReset: 'Đặt lại viền khi chuyển video',
  detectVideoFillScaleEnabled: 'Phóng video để lấp phần viền đã bỏ',
  sectionImageAdjustmentCollapsed: 'Bộ lọc màu',
  brightness: 'Độ sáng',
  contrast: 'Độ tương phản',
  vibrance: 'Độ rực màu',
  saturation: 'Độ bão hòa',
  sectionHdrImageAdjustmentCollapsed: 'Bộ lọc HDR',
  hdrBrightness: 'Độ sáng HDR',
  hdrContrast: 'Độ tương phản HDR',
  hdrSaturation: 'Độ bão hòa HDR',
  sectionDirectionsCollapsed: 'Hướng chiếu sáng',
  directionTopEnabled: 'Phía trên',
  directionRightEnabled: 'Bên phải',
  directionBottomEnabled: 'Phía dưới',
  directionLeftEnabled: 'Bên trái',
  sectionAmbientlightCollapsed: 'Ánh sáng',
  blur2: 'Độ nhòe',
  edge: 'Kích thước vùng viền',
  spread: 'Độ lan sáng',
  spreadFadeStart: 'Điểm bắt đầu mờ dần',
  spreadFadeCurve: 'Đường cong mờ dần',
  debandingStrength: 'Giảm dải màu bằng nhiễu',
  frameFading: 'Thời gian chuyển sáng',
  flickerReduction: 'Giảm nhấp nháy',
  frameBlending: 'Làm mượt chuyển động (trộn khung hình)',
  frameBlendingSmoothness: 'Mức làm mượt chuyển động',
  fixedPosition: 'Cố định vị trí ánh sáng',
  sectionViewsCollapsed: 'Chế độ hiển thị',
  enableInViews: 'Bật ánh sáng trong chế độ',
  enableInPictureInPicture: 'Video nổi (PiP)',
  enableInEmbed: 'Video nhúng',
  enableInVRVideos: 'Video VR / 360°',
  sectionGeneralCollapsed: 'Cài đặt chung',
  theme: 'Giao diện YouTube',
  enabled: 'Bật ánh sáng Ambient',
};

const sectionDescriptions = {
  sectionSettingsCollapsed: 'Chọn mức tùy chỉnh phù hợp với bạn.',
  sectionStatsCollapsed: 'Theo dõi tốc độ và quá trình xử lý hình ảnh.',
  sectionQualityPerformanceCollapsed: 'Cân bằng độ mượt, chất lượng và điện năng.',
  sectionOtherPageHeaderCollapsed: 'Điều chỉnh nền và bóng đổ ở đầu trang.',
  sectionOtherPageContentCollapsed: 'Điều chỉnh nội dung xung quanh video.',
  sectionVideoResizingCollapsed: 'Tinh chỉnh kích thước và cách hiển thị video.',
  sectionHorizontalBarsCollapsed: 'Nhận diện và cắt viền để ánh sáng bám sát hình.',
  sectionImageAdjustmentCollapsed: 'Tinh chỉnh sắc độ của ánh sáng Ambient.',
  sectionHdrImageAdjustmentCollapsed: 'Tinh chỉnh ánh sáng khi phát video HDR.',
  sectionDirectionsCollapsed: 'Chọn các cạnh phát ánh sáng quanh video.',
  sectionAmbientlightCollapsed: 'Tạo độ lan, độ nhòe và nhịp chuyển ánh sáng.',
  sectionViewsCollapsed: 'Chọn nơi ánh sáng Ambient được bật.',
  sectionGeneralCollapsed: 'Quản lý trạng thái và giao diện YouTube.',
};

const snapLabels = {
  theme: { '-1': 'Sáng', 0: 'Mặc định', 1: 'Tối' },
  enableInViews: {
    0: 'Tất cả',
    1: 'Thường',
    2: 'Thường và rạp',
    3: 'Rạp',
    4: 'Rạp và toàn màn hình',
    5: 'Toàn màn hình',
  },
  frameSync: { 0: 'Giải mã', 1: 'Màn hình', 2: 'Video' },
};

export function getAmbientLabel(setting) {
  return Object.hasOwn(labels, setting.name)
    ? labels[setting.name]
    : setting.label;
}

export function getAmbientSectionDescription(name) {
  return Object.hasOwn(sectionDescriptions, name)
    ? sectionDescriptions[name]
    : '';
}

// Display text only: callers retain each point's original value and visibility.
export function getAmbientSnapLabel(settingName, point) {
  const translated = Object.hasOwn(snapLabels, settingName)
    ? snapLabels[settingName]
    : undefined;
  return translated && Object.hasOwn(translated, point.value)
    ? translated[point.value]
    : point.hiddenLabel || point.label;
}
