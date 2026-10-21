export type ImportedVideo = { id: string; title: string; creator: string; channelId?: string; channelAvatar?: string; platform: 'YouTube'; category: string; views: string; age: string; duration: string; image: string; url: string };
type BridgeResult = { installed?: boolean; items?: ImportedVideo[]; hasMore?: boolean; error?: string; message?: string };
export function youtubeBridge(action: 'ping' | 'home' | 'related', options: { videoId?: string; exclude?: (string | number)[]; next?: boolean } = {}): Promise<BridgeResult> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error(action === 'ping' ? 'Расширение не установлено.' : 'Нет ответа расширения. Установи его, обнови вкладки Streamly и YouTube и повтори импорт.')); }, action === 'ping' ? 1000 : 20000);
    function cleanup() { clearTimeout(timeout); window.removeEventListener('message', onMessage); }
    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== 'streamly-youtube-response' || event.data.id !== id) return;
      cleanup();
      if (event.data.error) reject(new Error(String(event.data.error)));
      else resolve({ installed: Boolean(event.data.installed), items: validateImported(event.data.items), hasMore: Boolean(event.data.hasMore), message: typeof event.data.message === 'string' ? event.data.message : '' });
    }
    window.addEventListener('message', onMessage);
    window.postMessage({ source: 'streamly-youtube-request', id, action, ...options }, location.origin);
  });
}
function image(value: unknown) {
  if (typeof value !== 'string') return '';
  try { const url = new URL(value); return url.protocol === 'https:' && /(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$/.test(url.hostname) ? url.href : ''; } catch { return ''; }
}
export function validateImported(value: unknown): ImportedVideo[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(row => {
    if (!row || typeof row.id !== 'string' || !/^yt-[\w-]{11}$/.test(row.id) || typeof row.title !== 'string' || typeof row.creator !== 'string') return [];
    const text = (key: string) => typeof row[key] === 'string' ? row[key].slice(0, 1000) : '';
    return [{ id: row.id, title: text('title'), creator: text('creator'), channelId: text('channelId'), channelAvatar: image(row.channelAvatar), platform: 'YouTube' as const, category: '', views: text('views'), age: text('age'), duration: text('duration'), image: image(row.image), url: `https://www.youtube.com/watch?v=${row.id.slice(3)}` }];
  });
}
