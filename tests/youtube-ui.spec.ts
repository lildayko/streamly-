import { test, expect, Page } from '@playwright/test';
const video = (n: number) => ({ id: `yt-${String(n).padStart(11, 'a')}`, title: `Моя рекомендация ${n}`, creator: 'Мой автор', channelAvatar: 'https://yt3.ggpht.com/avatar', image: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', duration: '12:00', platform: 'YouTube', views: '1 тыс.', age: 'сегодня', category: '' });
async function setup(page: Page) {
  await page.route('https://**/*', route => route.abort());
  await page.route('https://yt3.ggpht.com/avatar', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0i8AAAAASUVORK5CYII=', 'base64') }));
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/youtube/avatars*', route => route.fulfill({ json: { avatars: {} } }));
  await page.addInitScript(() => {
    window.addEventListener('message', event => {
      if (event.data?.source !== 'streamly-youtube-request') return;
      const { id, action, next } = event.data;
      const video = (n: number) => ({ id: `yt-${String(n).padStart(11, 'a')}`, title: `Моя рекомендация ${n}`, creator: 'Мой автор', channelAvatar: 'https://yt3.ggpht.com/avatar', image: 'https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg', duration: '12:00', platform: 'YouTube', views: '1 тыс.', age: 'сегодня', category: '' });
      const body = localStorage.getItem('test-bridge-error') ? { error: 'Открой YouTube' } : action === 'ping' ? { installed: true } : { items: Array.from({ length: next ? 3 : 24 }, (_, i) => video((action === 'related' ? 100 : 0) + (next ? 24 : 0) + i)), hasMore: !next };
      window.postMessage({ source: 'streamly-youtube-response', id, ...body }, location.origin);
    });
  });
  await page.goto('/');
}
test('импорт главной показывает мои карточки и автоматически загружает следующую страницу', async ({ page }) => {
  let genericSearches = 0;
  await page.route('**/api/search?**', route => { genericSearches++; return route.fulfill({ json: { items: [] } }); });
  await setup(page);
  await page.getByRole('button', { name: 'Импортировать мою ленту' }).click();
  await expect(page.locator('.video-card')).toHaveCount(24);
  await page.getByTestId('youtube-home-end').scrollIntoViewIfNeeded();
  await expect(page.locator('.video-card')).toHaveCount(27);
  expect(genericSearches).toBe(0);
  await page.reload();
  await expect(page.locator('.video-title', { hasText: 'Моя рекомендация 26' })).toBeVisible();
});
test('плеер показывает персональные рекомендации, комментарии и ответы с независимой пагинацией', async ({ page }) => {
  await setup(page);
  await page.route('**/api/youtube/comments?**', route => {
    const params = new URL(route.request().url()).searchParams;
    const reply = params.has('parentId'), next = params.has('cursor');
    return route.fulfill({ json: { items: [{ id: next ? 'next-comment' : reply ? 'reply' : 'first-comment', author: 'Комментатор', avatar: '', text: next ? 'Следующая страница' : reply ? 'Ответ автора' : '<img src=x onerror=alert(1)>', publishedAt: '2026-10-21T00:00:00Z', likes: 12, replies: reply ? 0 : 1 }], nextCursor: !reply && !next ? 'next' : '' } });
  });
  await page.getByRole('button', { name: 'Импортировать мою ленту' }).click();
  await page.locator('.video-title').first().click();
  await expect(page.getByRole('heading', { name: 'Твои рекомендации YouTube' })).toBeVisible();
  await expect(page.locator('.recommendation')).toHaveCount(24);
  await expect(page.locator('.player-channel-identity img')).toHaveAttribute('src', 'https://yt3.ggpht.com/avatar');
  await expect(page.getByText('<img src=x onerror=alert(1)>', { exact: true })).toBeVisible();
  await expect(page.locator('.comment-body img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ответы (1)' }).first().click();
  await expect(page.getByText('Ответ автора', { exact: true })).toBeVisible();
  if (await page.getByTestId('comments-end').count()) await page.getByTestId('comments-end').scrollIntoViewIfNeeded();
  await expect(page.getByText('Следующая страница', { exact: true })).toBeVisible();
  await page.getByTestId('player-end').scrollIntoViewIfNeeded();
  await expect(page.locator('.recommendation')).toHaveCount(27);
});
test('отказ расширения сохраняет старую ленту и показывает возможность повтора', async ({ page }) => {
  await page.addInitScript(video => localStorage.setItem('streamly-youtube-home', JSON.stringify({ items: [video], importedAt: 1 })), video(5));
  await setup(page);
  await page.evaluate(() => localStorage.setItem('test-bridge-error', '1'));
  await page.getByRole('button', { name: 'Обновить мою ленту' }).click();
  await expect(page.locator('.youtube-import-feed [role=alert]')).toContainText('Открой YouTube');
  await expect(page.locator('.video-title', { hasText: 'Моя рекомендация 5' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить мою ленту' })).toBeEnabled();
});

test('на телефоне импортированная лента и комментарии помещаются по ширине', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.route('**/api/youtube/comments?**', route => route.fulfill({ status: 403, json: { reason: 'commentsDisabled', message: 'Автор отключил комментарии к этому видео.' } }));
  await page.getByRole('button', { name: 'Импортировать мою ленту' }).click();
  await expect(page.locator('.video-card')).toHaveCount(24);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('.video-title').first().click();
  await expect(page.locator('.youtube-comments [role=alert]')).toContainText('Автор отключил');
  expect(await page.locator('.player-modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
