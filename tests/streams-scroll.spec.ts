import { test, expect, Page } from '@playwright/test';
const video = (id: string, title: string) => ({ id, title, duration: '12:00', creator: 'Автор', channelId: 'c', platform: 'YouTube', category: '', views: '', age: '', image: '', url: 'https://youtube.com/watch?v=abc' });
async function base(page: Page) {
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: { connected: false } }));
}
test('выбор Twitch загружает трансляции; плеер использует login и текущий parent', async ({ page }) => {
  await base(page);
  const requests: string[] = [];
  await page.route('**/api/search?**', route => {
    const url = new URL(route.request().url()); requests.push(url.toString());
    const twitch = url.searchParams.get('platform') === 'Twitch';
    return route.fulfill({ json: { items: twitch ? [{ ...video('tw-1', 'Рабочий эфир'), platform: 'Twitch', creator: 'Красивое имя', live: true, duration: 'LIVE', url: 'https://www.twitch.tv/actual_login' }] : [], nextCursor: '', statuses: { [twitch ? 'Twitch' : 'YouTube']: { configured: true, message: 'Подключено' } } } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'В эфире', exact: true }).click();
  await page.locator('.platform-row').filter({ hasText: 'Twitch' }).click();
  await expect(page.locator('.video-title', { hasText: 'Рабочий эфир' })).toBeVisible();
  expect(requests.some(url => url.includes('live=1') && url.includes('platform=Twitch'))).toBe(true);
  await expect(page.locator('.stats-row')).toHaveCount(0);
  await page.locator('.video-title').click();
  const frame = page.locator('.player-frame');
  await expect(frame).toHaveAttribute('src', /channel=actual_login&parent=127\.0\.0\.1/);
});
test('в плеере доступны все рекомендации и следующая страница при прокрутке', async ({ page }) => {
  await base(page);
  await page.route('**/api/search?**', route => {
    const url = new URL(route.request().url());
    const inPlayer = url.searchParams.has('q');
    const second = url.searchParams.has('cursor');
    return route.fulfill({ json: { items: inPlayer ? Array.from({ length: 30 }, (_, i) => video(`yt-${second ? 100 + i : i}`, `Рекомендация ${second ? 100 + i : i}`)) : [video('yt-main', 'Основное видео')], nextCursor: inPlayer && !second ? 'next' : '', statuses: {} } });
  });
  await page.goto('/');
  await page.locator('.video-title').click();
  await expect(page.locator('.recommendation')).toHaveCount(30);
  await page.getByTestId('player-end').scrollIntoViewIfNeeded();
  await expect(page.locator('.recommendation')).toHaveCount(60);
  await page.getByText('Рекомендация 129', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('Рекомендация 129', { exact: true })).toBeVisible();
});
test('подписки продолжаются за пределами первых 50 видео без кнопок', async ({ page }) => {
  await base(page);
  await page.route('**/api/search?**', route => route.fulfill({ json: { items: [], statuses: {} } }));
  await page.route('**/api/youtube/recommendations*', route => {
    const second = new URL(route.request().url()).searchParams.has('cursor');
    return route.fulfill({ json: { connected: true, channels: [], items: second ? [video('yt-51', 'Видео 51')] : Array.from({ length: 50 }, (_, i) => video(`yt-${i}`, `Видео ${i}`)), nextCursor: second ? '' : 'next' } });
  });
  await page.goto('/');
  await expect(page.locator('.video-card')).toHaveCount(50);
  await page.getByTestId('feed-end').scrollIntoViewIfNeeded();
  await expect(page.locator('.video-title', { hasText: 'Видео 51' })).toBeVisible();
  await expect(page.locator('.video-card')).toHaveCount(51);
});
test('отсутствующие ключи Twitch показаны пользователю, а не как подключённая платформа', async ({ page }) => {
  await base(page);
  await page.route('**/api/search?**', route => route.fulfill({ json: { items: [], statuses: { Twitch: { configured: false, message: 'Добавь TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET в .env.local' } } } }));
  await page.goto('/');
  await page.locator('.platform-row').filter({ hasText: 'Twitch' }).click();
  await expect(page.getByText(/Twitch: Добавь TWITCH_CLIENT_ID/)).toBeVisible();
  await expect(page.locator('.platform-row').filter({ hasText: 'Twitch' }).locator('.connection-dot')).toHaveClass(/unconfigured/);
});
