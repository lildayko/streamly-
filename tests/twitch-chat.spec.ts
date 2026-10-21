import { test, expect, Page } from '@playwright/test';
import { twitchChannel, twitchChatUrl } from '../lib/twitch-embed';
const twitch = (login: string) => ({ id: `tw-${login}`, title: `Эфир ${login}`, creator: 'Отображаемое имя', platform: 'Twitch', channelId: login, category: 'Игры', live: true, duration: 'LIVE', age: '', views: '', image: '', url: `https://www.twitch.tv/${login}` });
async function setup(page: Page) {
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ json: { connected: true, channels: [], items: [{ id: 'yt-example', title: 'Видео YouTube', creator: 'Автор', platform: 'YouTube', duration: '12:00', category: '', views: '', age: '', image: '' }] } }));
  let playerSearches = 0;
  await page.route('**/api/search?**', route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('q')) playerSearches++;
    return route.fulfill({ json: { items: url.searchParams.get('platform') === 'Twitch' ? [twitch('actual_login'), twitch('next_login')] : [], statuses: {}, nextCursor: '' } });
  });
  await page.goto('/');
  const mobile = await page.getByRole('button', { name: 'Открыть меню' }).isVisible();
  if (mobile) await page.getByRole('button', { name: 'Открыть меню' }).click();
  await page.locator('.platform-row').filter({ hasText: 'Twitch' }).click();
  if (mobile) await expect(page.locator('.sidebar')).not.toHaveClass(/sidebar-open/);
  await page.locator('.video-title', { hasText: 'Эфир actual_login' }).click();
  return () => playerSearches;
}
test('Twitch заменяет рекомендации официальным чатом выбранного канала и не ищет похожие ролики', async ({ page }) => {
  const searches = await setup(page);
  const frame = page.locator('.twitch-chat-frame');
  await expect(frame).toBeVisible();
  const url = new URL((await frame.getAttribute('src'))!);
  expect(url.origin).toBe('https://www.twitch.tv');
  expect(url.pathname).toBe('/embed/actual_login/chat');
  expect(url.searchParams.get('parent')).toBe('127.0.0.1');
  expect(url.searchParams.has('darkpopout')).toBe(true);
  expect(url.searchParams.has('token')).toBe(false);
  await expect(page.locator('.recommendations')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Открыть отдельно ↗' })).toHaveAttribute('href', 'https://www.twitch.tv/popout/actual_login/chat?popout=');
  expect(searches()).toBe(0);
  const chat = await page.locator('.twitch-chat').boundingBox(), player = await page.locator('.player-frame').boundingBox();
  expect(chat!.x).toBeGreaterThan(player!.x + player!.width);
  expect(chat!.height).toBeGreaterThan(400);
});
test('при смене канала чат меняется, а YouTube возвращает похожие видео', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Закрыть плеер' }).click();
  await page.locator('.video-title', { hasText: 'Эфир next_login' }).click();
  await expect(page.locator('.twitch-chat-frame')).toHaveAttribute('src', /\/embed\/next_login\/chat/);
  await page.getByRole('button', { name: 'Закрыть плеер' }).click();
  await page.locator('.platform-row').filter({ hasText: 'YouTube' }).click();
  await page.getByRole('button', { name: 'Подписки', exact: true }).click();
  await page.locator('.video-title', { hasText: 'Видео YouTube' }).click();
  await expect(page.locator('.recommendations')).toBeVisible();
  await expect(page.locator('.twitch-chat')).toHaveCount(0);
});
test('на узком экране чат располагается под видео и остаётся достаточно высоким для прокрутки', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const chat = await page.locator('.twitch-chat-frame').boundingBox(), player = await page.locator('.player-frame').boundingBox();
  expect(chat!.y).toBeGreaterThan(player!.y + player!.height);
  expect(chat!.height).toBeGreaterThan(300);
  const overflow = await page.locator('.player-modal').evaluate(element => element.scrollWidth > element.clientWidth + 1);
  expect(overflow).toBe(false);
});
test('канал извлекается из настоящего Twitch URL, не из отображаемого имени или чужого домена', () => {
  expect(twitchChannel('https://www.twitch.tv/Actual_Login?ref=home')).toBe('actual_login');
  expect(twitchChannel('https://evil.example/actual_login')).toBeNull();
  expect(twitchChannel('https://www.twitch.tv/videos/123')).toBeNull();
  expect(twitchChannel('https://www.twitch.tv/')).toBeNull();
  expect(new URL(twitchChatUrl('actual_login', 'streamly.example')).searchParams.get('parent')).toBe('streamly.example');
});
