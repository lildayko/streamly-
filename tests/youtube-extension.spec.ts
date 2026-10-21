import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
// The managed Chromium policy blocks extension installation. Exercise the actual
// three scripts against a controlled DOM, replacing only Chrome's messaging API.
test('скрипты расширения передают карточки между вкладками и загружают продолжение DOM', async ({ context, page: streamly }) => {
  await context.route('https://**/*', route => route.abort());
  await context.route('https://yt3.ggpht.com/avatar', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0i8AAAAASUVORK5CYII=', 'base64') }));
  await context.route('https://www.youtube.com/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><body><ytd-browse page-subtype="home"><ytd-rich-item-renderer><a id="video-title" href="/watch?v=abcdefghijk">Из моей главной</a><ytd-channel-name><a href="/channel/UCtest">Мой канал</a></ytd-channel-name><yt-img-shadow id="avatar"><img src="https://yt3.ggpht.com/avatar"></yt-img-shadow><img src="https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"><div id="metadata-line"><span>500 просмотров</span><span>сегодня</span></div></ytd-rich-item-renderer><ytd-continuation-item-renderer style="display:block;margin-top:3000px;height:20px"></ytd-continuation-item-renderer></ytd-browse><script>window.addEventListener('scroll', () => {if(document.querySelector('#more'))return;const card=document.createElement('ytd-rich-item-renderer');card.id='more';card.innerHTML='<a id="video-title" href="/watch?v=lmnopqrstuv">Следующая из моей главной</a>';document.querySelector('ytd-browse').append(card);});</script></body></html>` }));
  await context.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: {} }));
  await context.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await context.route('**/api/youtube/avatars*', route => route.fulfill({ json: { avatars: {} } }));
  const youtube = await context.newPage();
  await youtube.addInitScript(() => {
    const runtime = { id: 'test-extension', onMessage: { addListener: (listener: unknown) => { Object.assign(window, { youtubeListener: listener }); } } };
    Object.assign(window, { chrome: { runtime } });
  });
  await youtube.goto('https://www.youtube.com/');
  await youtube.addScriptTag({ path: 'browser-extension/youtube.js' });
  type Message = Record<string, unknown>;
  let backgroundListener: (message: Message, sender: Message, respond: (result: unknown) => void) => void;
  const chrome = {
    runtime: { onMessage: { addListener: (listener: typeof backgroundListener) => { backgroundListener = listener; } } },
    tabs: {
      query: async () => [{ id: 1, url: 'https://www.youtube.com/' }],
      sendMessage: async (_tabId: number, message: Message) => youtube.evaluate(message => new Promise(resolve => {
        const target = window as unknown as { youtubeListener: (message: unknown, sender: unknown, respond: (value: unknown) => void) => void };
        target.youtubeListener(message, { id: 'test-extension' }, resolve);
      }), message),
    },
  };
  vm.runInNewContext(await readFile('browser-extension/background.js', 'utf8'), { chrome, URL, setTimeout });
  let unauthorized = false;
  backgroundListener!({ action: 'home' }, { tab: { id: 99 }, url: 'https://untrusted.example/' }, () => { unauthorized = true; });
  expect(unauthorized).toBe(false);
  await streamly.exposeBinding('streamlyRuntime', async (_source, message: Message) => new Promise(resolve => backgroundListener(message, { tab: { id: 2 }, url: 'http://127.0.0.1:3000/' }, resolve)));
  await streamly.addInitScript(() => {
    const target = window as unknown as { streamlyRuntime: (message: unknown) => Promise<unknown> };
    Object.assign(window, { chrome: { runtime: { sendMessage: (message: unknown) => target.streamlyRuntime(message) } } });
  });
  await streamly.goto('/');
  await streamly.addScriptTag({ path: 'browser-extension/streamly.js' });
  await streamly.getByRole('button', { name: 'Импортировать мою ленту' }).click();
  await expect(streamly.locator('.video-title', { hasText: 'Из моей главной' })).toBeVisible();
  await expect(streamly.locator('.creator-avatar img').first()).toHaveAttribute('src', 'https://yt3.ggpht.com/avatar');
  if (await streamly.getByTestId('youtube-home-end').count()) await streamly.getByTestId('youtube-home-end').scrollIntoViewIfNeeded();
  await expect(streamly.locator('.video-title', { hasText: 'Следующая из моей главной' })).toBeVisible({ timeout: 10000 });
});
