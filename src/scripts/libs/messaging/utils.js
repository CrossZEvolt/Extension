export const origin = 'https://www.youtube.com';
export const extensionId = 'crossz-youtube-extension';

export const isSameWindowMessage = (event) =>
  event.source === window && event.origin === origin;
