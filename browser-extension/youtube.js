/* global chrome */
(() => {
  function safeImage(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && /(^|\.)(ytimg\.com|ggpht\.com|googleusercontent\.com)$/.test(url.hostname) ? url.href : ''; } catch { return ''; }
  }
  function collect(action, currentId) {
    const scope = action === 'home' ? document.querySelector('ytd-browse[page-subtype="home"]') : document.querySelector('#related');
    if (!scope) return [];
    const cards = scope.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, yt-lockup-view-model');
    const found = new Map();
    for (const card of cards) {
      if (card.closest('ytd-ad-slot-renderer, ytd-rich-section-renderer') || card.querySelector('ytd-ad-slot-renderer, ytd-display-ad-renderer')) continue;
      const link = [...card.querySelectorAll('a[href]')].find(a => { try { const u = new URL(a.href); return u.hostname === 'www.youtube.com' && u.pathname === '/watch' && /^[\w-]{11}$/.test(u.searchParams.get('v') || ''); } catch { return false; } });
      if (!link) continue;
      const id = new URL(link.href).searchParams.get('v');
      if (id === currentId || found.has(id)) continue;
      const title = card.querySelector('#video-title, .yt-lockup-metadata-view-model__title')?.textContent.trim() || link.getAttribute('aria-label') || link.getAttribute('title');
      if (!title) continue;
      const channel = card.querySelector('ytd-channel-name a, #channel-name a, a[href^="/@"], a[href^="/channel/"]');
      const avatar = card.querySelector('yt-img-shadow#avatar img, #avatar img, .yt-spec-avatar-shape__image, ytd-channel-thumbnail-with-link-renderer img');
      const thumbnail = [...card.querySelectorAll('img')].find(img => /(^|\.)i[0-9]*\.ytimg\.com$/.test((() => { try { return new URL(img.currentSrc || img.src).hostname; } catch { return ''; } })()));
      const meta = [...card.querySelectorAll('#metadata-line span, .yt-content-metadata-view-model__metadata-text')].map(e => e.textContent.trim()).filter(Boolean);
      const channelPath = channel?.getAttribute('href') || '';
      found.set(id, { id: `yt-${id}`, title, creator: channel?.textContent.trim() || meta[0] || 'YouTube', channelId: channelPath.startsWith('/channel/') ? channelPath.split('/')[2] : '', channelAvatar: safeImage(avatar?.currentSrc || avatar?.src), platform: 'YouTube', category: '', views: meta.slice(-2, -1)[0] || '', age: meta.at(-1) || '', duration: card.querySelector('ytd-thumbnail-overlay-time-status-renderer, .yt-badge-shape__text')?.textContent.trim() || '', image: safeImage(thumbnail?.currentSrc || thumbnail?.src) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}` });
    }
    return [...found.values()];
  }
  async function read(message) {
    const url = new URL(location.href);
    if (message.action === 'home' ? url.pathname !== '/' : url.pathname !== '/watch' || url.searchParams.get('v') !== message.videoId) return { error: 'Страница YouTube изменилась. Открой нужную главную или видео и повтори импорт.' };
    const exclude = new Set(Array.isArray(message.exclude) ? message.exclude : []);
    let items = collect(message.action, message.videoId).filter(v => !exclude.has(v.id));
    // Scroll the real YouTube continuation, never replay a generic search as a personal feed.
    if (message.next || !items.length) {
      for (let attempt = 0; attempt < 4; attempt++) {
        const scope = message.action === 'home' ? document.querySelector('ytd-browse[page-subtype="home"]') : document.querySelector('#related');
        const end = scope?.querySelector('ytd-continuation-item-renderer') || scope?.lastElementChild;
        end?.scrollIntoView({ block: 'end' });
        await new Promise(resolve => setTimeout(resolve, 1200));
        items = collect(message.action, message.videoId).filter(v => !exclude.has(v.id));
        if (items.length) break;
      }
    }
    if (!items.length) return { items: [], hasMore: false, message: 'YouTube пока не показал новых рекомендаций. Можно повторить загрузку.' };
    return { items, hasMore: true, importedAt: Date.now() };
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.source !== 'streamly-read-youtube') return;
    read(message).then(respond, () => respond({ error: 'Не удалось прочитать карточки YouTube. Обнови вкладку и повтори импорт.' }));
    return true;
  });
  // Expose no session tokens, internal YouTube API keys, cookies, or HTML.
})();
