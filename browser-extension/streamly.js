/* global chrome */
// Only the local Streamly origin can ask the extension for YouTube cards.
(() => {
  if (!['http://localhost:3000', 'http://127.0.0.1:3000'].includes(location.origin)) return;
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'streamly-youtube-request') return;
    const { id, action, videoId, exclude, next } = event.data;
    if (typeof id !== 'string' || !['ping', 'home', 'related'].includes(action)) return;
    try {
      const result = action === 'ping' ? { installed: true } : await chrome.runtime.sendMessage({ action, videoId, exclude, next });
      window.postMessage({ source: 'streamly-youtube-response', id, ...result }, location.origin);
    } catch { window.postMessage({ source: 'streamly-youtube-response', id, error: 'Расширение обновилось. Перезагрузи вкладки Streamly и YouTube.' }, location.origin); }
  });
})();
