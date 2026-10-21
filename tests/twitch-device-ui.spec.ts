import { test, expect } from '@playwright/test';

test('вход по коду подключает профиль без перехода на callback и без смены страницы', async ({ page }) => {
  await page.clock.install();
  let connected = false;
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/twitch/account', route => route.fulfill(connected ? { json: { connected: true, user: { id: 'me', login: 'me', displayName: 'Аккаунт по коду' } } } : { status: 401, json: {} }));
  await page.route('**/api/twitch/following*', route => route.fulfill({ json: { connected: true, items: [], nextCursor: '' } }));
  await page.route('**/api/twitch/device', route => {
    const { action } = route.request().postDataJSON();
    if (action === 'poll') { connected = true; return route.fulfill({ json: { status: 'connected' } }); }
    return route.fulfill({ json: { status: 'pending', userCode: 'ABCD-EFGH', verificationUri: 'https://www.twitch.tv/activate', expiresAt: Date.now() + 600000, interval: 5 } });
  });
  await page.goto('/?twitch=redirect_mismatch&twitch_stage=authorization');
  await page.getByRole('button', { name: 'Подключить Twitch', exact: true }).click();
  await page.getByRole('button', { name: 'Получить код Twitch' }).click();
  await expect(page.getByText('ABCD-EFGH', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть страницу подтверждения Twitch ↗' })).toHaveAttribute('href', 'https://www.twitch.tv/activate');
  await page.clock.fastForward(5000);
  await expect(page.getByText('Twitch · Аккаунт по коду')).toBeVisible();
  await expect(page.locator('.login-error')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Подключение Twitch по коду' })).toHaveCount(0);
  await expect(page).not.toHaveURL(/callback/);
});
test('при redirect_mismatch доступен вход по коду и отмена попытки', async ({ page }) => {
  let cancelled = false;
  await page.route('**/api/youtube/recommendations*', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/twitch/account', route => route.fulfill({ status: 401, json: {} }));
  await page.route('**/api/twitch/device', route => { cancelled = route.request().postDataJSON().action === 'cancel'; return route.fulfill({ json: { status: 'cancelled' } }); });
  await page.goto('/?twitch=redirect_mismatch&twitch_stage=authorization');
  await page.getByRole('button', { name: 'Войти по коду Twitch' }).click();
  await expect(page.getByRole('button', { name: 'Получить код Twitch' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить вход по коду' }).click();
  await expect(page.getByRole('region', { name: 'Подключение Twitch по коду' })).toHaveCount(0);
  expect(cancelled).toBe(true);
});
