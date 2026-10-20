import { test, expect } from '@playwright/test';
const video = (id: string, title: string, channelId: string) => ({ id, title, channelId, creator: channelId, platform: 'YouTube', category: 'Наука', duration: '10:00', image: '', views: '', age: '' });
test('Для тебя открывает новых авторов, а Подписки сохраняют свои каналы; интересы сохраняются', async ({ page }) => {
  const profiles: { interests: string[] }[] = [];
  await page.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ json: { connected: true, items: [video('yt-own', 'Мой канал', 'own')], channels: [{ id: 'own', title: 'Мой канал' }] } }));
  await page.route('**/api/search?**', route => route.fulfill({ json: { items: [], statuses: {} } }));
  await page.route('**/api/recommendations', route => {
    profiles.push(route.request().postDataJSON());
    return route.fulfill({ json: { items: [video('yt-new', 'Новый автор', 'outside')], nextCursor: '', statuses: {} } });
  });
  await page.goto('/');
  await expect(page.locator('.video-title', { hasText: 'Новый автор' })).toBeVisible();
  await expect(page.locator('.video-title', { hasText: 'Мой канал' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Наука', exact: true }).click();
  await expect.poll(() => profiles.at(-1)?.interests.includes('Наука')).toBe(true);
  await expect(page.getByRole('button', { name: 'Наука', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Подписки', exact: true }).click();
  await expect(page.locator('.video-title', { hasText: 'Мой канал' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Наука', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('привязанный Twitch показывает имя, эфиры в Подписках и позволяет отключиться', async ({ page }) => {
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/recommendations', route => route.fulfill({ json: { items: [video('yt-discover', 'Рекомендация', 'new')], statuses: {} } }));
  await page.route('**/api/search?**', route => route.fulfill({ json: { items: [], statuses: {} } }));
  await page.route('**/api/twitch/account', route => route.fulfill({ json: { connected: true, user: { id: 'me', displayName: 'Мой Twitch', login: 'me' } } }));
  await page.route('**/api/twitch/following*', route => route.fulfill({ json: { connected: true, items: [{ ...video('tw-followed', 'Эфир друга', 'friend'), platform: 'Twitch', live: true, duration: 'LIVE', url: 'https://twitch.tv/friend' }], nextCursor: '' } }));
  await page.route('**/api/twitch/disconnect', route => route.fulfill({ json: { connected: false } }));
  await page.goto('/?twitch=connected');
  await expect(page.getByText('Twitch · Мой Twitch')).toBeVisible();
  await page.getByRole('button', { name: 'Подписки', exact: true }).click();
  await expect(page.locator('.video-title', { hasText: 'Эфир друга' })).toBeVisible();
  await page.getByRole('button', { name: 'Отключить Twitch' }).click();
  await expect(page.locator('.twitch-account')).toHaveCount(0);
  await expect(page.locator('.video-title', { hasText: 'Эфир друга' })).toHaveCount(0);
});
