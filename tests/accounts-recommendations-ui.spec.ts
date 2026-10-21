import { test, expect } from '@playwright/test';
const video = (id: string, title: string, channelId: string) => ({ id, title, channelId, creator: channelId, platform: 'YouTube', category: 'Наука', duration: '10:00', image: '', views: '', age: '' });
test('главная предлагает импорт персональной ленты без публичной подмены; теги и Plus отсутствуют', async ({ page }) => {
  let recommendationRequests = 0;
  await page.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ json: { connected: true, items: [video('yt-own', 'Мой канал', 'own')], channels: [] } }));
  await page.route('**/api/recommendations', route => { recommendationRequests++; return route.fulfill({ json: { items: [] } }); });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Импортировать мою ленту' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Скачай расширение' })).toHaveAttribute('href', '/streamly-youtube-bridge.zip');
  expect(recommendationRequests).toBe(0);
  await expect(page.locator('.video-title')).toHaveCount(0);
  await expect(page.locator('.upgrade-card')).toHaveCount(0);
  await expect(page.locator('.filter-chip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Подписки', exact: true }).click();
  await expect(page.locator('.video-title', { hasText: 'Мой канал' })).toBeVisible();
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

test('ошибка входа Twitch остаётся видимой и объясняет причину вместо общего совета про Redirect URL', async ({ page }) => {
  await page.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/?twitch=invalid_client');
  await expect(page.locator('.login-error[role=alert]')).toContainText('Client ID или Client Secret');
  await expect(page.getByRole('link', { name: 'Повторить обычный вход' })).toHaveAttribute('href', '/api/twitch/auth');
});

test('мгновенный отказ authorize показывает код и ссылку на диагностику, скрывая сырые параметры', async ({ page }) => {
  await page.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: {} }));
  await page.goto('/?twitch=invalid_scope&twitch_stage=authorization');
  await expect(page.locator('.login-error')).toContainText('oauth-4 · authorization · invalid_scope');
  await expect(page.getByRole('link', { name: 'Диагностика без ключей ↗' })).toHaveAttribute('href', '/api/twitch/diagnostics');
  await expect(page).not.toHaveURL(/twitch_stage/);
});
