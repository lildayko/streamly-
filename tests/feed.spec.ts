import { test, expect, Page } from '@playwright/test';
const video = (id: string, title: string, duration = '10:00') => ({ id, title, duration, creator: 'Автор', channelId: 'channel', platform: 'YouTube', category: 'Видео', views: '', age: '', image: '', url: `https://youtube.com/watch?v=${id.slice(3)}` });
const long = video('yt-long', 'Видео подписки');
const short = video('yt-short', 'Короткое из подписки', '1:20');
const unknown = video('yt-unknown', 'Без длительности', '');
async function setup(page: Page) {
  await page.route('https://**/*', route => route.abort());
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ json: { connected: true, channels: [{ id: 'channel', title: 'Автор' }], items: [long, short, unknown] } }));
  await page.route('**/api/search?**', async route => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get('q');
    if (q === 'slow') await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: { items: q ? [video('yt-result', `Результат ${q}`), ...(url.searchParams.has('cursor') ? [video('yt-page2', 'Вторая страница')] : [])] : [video('yt-public', 'Общая лента')], statuses: { YouTube: { configured: true, message: 'Подключено' } }, nextCursor: url.searchParams.has('cursor') ? '' : 'next' } });
  });
  await page.goto('/');
  await expect(page.locator('.video-title', { hasText: long.title })).toBeVisible();
}
async function search(page: Page, q: string) {
  await page.getByPlaceholder('Найти видео, автора...').fill(q);
  await page.getByPlaceholder('Найти видео, автора...').press('Enter');
}
test('поиск показывает серверные результаты вместо подписок; пагинация добавляет без дублей', async ({ page }) => {
  await setup(page);
  await search(page, 'котики');
  await expect(page.locator('.video-title', { hasText: 'Результат котики' })).toBeVisible();
  await expect(page.locator('.video-title', { hasText: long.title })).toHaveCount(0);
  await page.getByRole('button', { name: 'Загрузить ещё' }).click();
  await expect(page.locator('.video-title')).toHaveCount(2);
  await expect(page.locator('.video-title', { hasText: 'Вторая страница' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Загрузить ещё' })).toHaveCount(0);
});
test('сохранённое переживает смену выдачи и перезагрузку', async ({ page }) => {
  await setup(page);
  await page.locator('.video-card').filter({ hasText: long.title }).getByRole('button', { name: 'Сохранить видео' }).click();
  await search(page, 'другая выдача');
  await expect(page.locator('.video-title', { hasText: 'Результат другая выдача' })).toBeVisible();
  await page.getByRole('button', { name: 'Сохранённое', exact: true }).click();
  await expect(page.locator('.video-title', { hasText: long.title })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Сохранённое', exact: true }).click();
  await expect(page.locator('.video-title', { hasText: long.title })).toBeVisible();
});
test('Shorts использует подписки; неизвестная длительность остаётся в основной ленте', async ({ page }) => {
  await setup(page);
  await expect(page.locator('.video-title', { hasText: unknown.title })).toBeVisible();
  await expect(page.locator('.video-title', { hasText: short.title })).toHaveCount(0);
  await page.getByRole('button', { name: 'Shorts', exact: true }).click();
  await expect(page.locator('.video-title', { hasText: short.title })).toBeVisible();
  await expect(page.locator('.video-title')).toHaveCount(1);
});
test('медленный старый поиск не заменяет новый', async ({ page }) => {
  await setup(page);
  await search(page, 'slow');
  await search(page, 'fast');
  await expect(page.locator('.video-title', { hasText: 'Результат fast' })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.locator('.video-title', { hasText: 'Результат fast' })).toBeVisible();
});
test('временная ошибка подписок не удаляет ранее загруженную ленту', async ({ page }) => {
  await setup(page);
  await page.getByRole('button', { name: 'Подписки', exact: true }).click();
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 502, json: { message: 'Временная ошибка' } }));
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.getByText('Временная ошибка', { exact: true })).toBeVisible();
  await expect(page.locator('.video-title', { hasText: long.title })).toBeVisible();
});
test('некорректный курсор API отклоняется', async ({ request }) => {
  const response = await request.get('/api/search?q=test&cursor=invalid');
  expect(response.status()).toBe(400);
});
