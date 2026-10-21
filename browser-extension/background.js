/* global chrome */
const inFlight = new Map();
async function read(message) {
  const videoId = typeof message.videoId === 'string' ? message.videoId : '';
  if (message.action === 'related' && !/^[\w-]{11}$/.test(videoId)) throw new Error('Некорректный адрес видео.');
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  let tab = tabs.find(tab => {
    const url = new URL(tab.url);
    return message.action === 'home' ? url.pathname === '/' : url.pathname === '/watch' && url.searchParams.get('v') === videoId;
  });
  if (!tab) {
    tab = await chrome.tabs.create({ url: message.action === 'home' ? 'https://www.youtube.com/' : `https://www.youtube.com/watch?v=${videoId}`, active: message.action === 'home' });
    if (message.action === 'home') throw new Error('Открыта главная YouTube. Дождись загрузки, выбери нужный аккаунт и повтори импорт в Streamly. Оставь вкладку открытой для подгрузки.');
    await chrome.tabs.update(tab.id, { muted: true });
    // Wait for the content script in the new watch tab. No navigation or cookies are proxied through Streamly.
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try { return await chrome.tabs.sendMessage(tab.id, { ...message, source: 'streamly-read-youtube' }); } catch { /* The watch page is still loading. */ }
    }
    throw new Error('Вкладка видео YouTube ещё загружается. Повтори импорт рекомендаций.');
  }
  if (inFlight.has(tab.id)) throw new Error('Предыдущая страница YouTube ещё загружается. Повтори через несколько секунд.');
  inFlight.set(tab.id, true);
  try { return await chrome.tabs.sendMessage(tab.id, { ...message, source: 'streamly-read-youtube' }); }
  catch { throw new Error('Обнови вкладку YouTube после установки расширения, затем повтори импорт.'); }
  finally { inFlight.delete(tab.id); }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!sender.tab || !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(new URL(sender.url).origin) || !['home', 'related'].includes(message?.action)) return;
  read(message).then(respond, error => respond({ error: error.message }));
  return true;
});
