import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET as auth } from '../app/api/twitch/auth/route';
import { GET as callback } from '../app/api/twitch/callback/route';
import { GET as account } from '../app/api/twitch/account/route';
import { GET as following } from '../app/api/twitch/following/route';
import { POST as disconnect } from '../app/api/twitch/disconnect/route';
const fetchOriginal = globalThis.fetch;
const oldId = process.env.TWITCH_CLIENT_ID, oldSecret = process.env.TWITCH_CLIENT_SECRET;
test.beforeEach(() => { process.env.TWITCH_CLIENT_ID = 'test-client'; process.env.TWITCH_CLIENT_SECRET = 'test-secret'; });
test.afterEach(() => {
  globalThis.fetch = fetchOriginal;
  if (oldId === undefined) delete process.env.TWITCH_CLIENT_ID; else process.env.TWITCH_CLIENT_ID = oldId;
  if (oldSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET; else process.env.TWITCH_CLIENT_SECRET = oldSecret;
});
const user = { id: 'user1', login: 'login', display_name: 'Мой Twitch', profile_image_url: '' };
test('OAuth запрашивает минимальное разрешение и сохраняет случайный state', async () => {
  const response = await auth(new NextRequest('http://localhost/api/twitch/auth'));
  const url = new URL(response.headers.get('location')!);
  expect(url.origin).toBe('https://id.twitch.tv');
  expect(url.searchParams.get('scope')).toBe('user:read:follows');
  expect(url.searchParams.get('state')).toHaveLength(64);
  expect(response.cookies.get('streamly_tw_oauth_state')?.value).toBe(url.searchParams.get('state'));
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
});
test('callback с неправильным state не обращается к платформе', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error(); }) as typeof fetch;
  const response = await callback(new NextRequest('http://localhost/api/twitch/callback?code=code&state=wrong', { headers: { cookie: 'streamly_tw_oauth_state=expected' } }));
  expect(response.headers.get('location')).toContain('connect_error');
  expect(calls).toBe(0);
});
test('callback обменивает code и сохраняет токены только в HttpOnly cookies', async () => {
  globalThis.fetch = (async input => String(input).includes('/oauth2/token') ? Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 1000 }) : Response.json({ data: [user] })) as typeof fetch;
  const response = await callback(new NextRequest('https://example.com/api/twitch/callback?code=code&state=expected', { headers: { cookie: 'streamly_tw_oauth_state=expected' } }));
  expect(response.headers.get('location')).toContain('twitch=connected');
  expect(response.cookies.get('streamly_tw_access')?.value).toBe('private-access');
  expect(response.headers.get('set-cookie')).toContain('Secure');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('location')).not.toContain('private-access');
});
test('истёкший access обновляется, включая refresh token, без утечки в JSON', async () => {
  globalThis.fetch = (async input => String(input).includes('/oauth2/token') ? Response.json({ access_token: 'new-private-access', refresh_token: 'new-private-refresh', expires_in: 1000 }) : Response.json({ data: [user] })) as typeof fetch;
  const response = await account(new NextRequest('http://localhost/api/twitch/account', { headers: { cookie: 'streamly_tw_refresh=old-refresh' } }));
  const body = await response.json();
  expect(body.user.login).toBe('login');
  expect(JSON.stringify(body)).not.toContain('private');
  expect(response.cookies.get('streamly_tw_refresh')?.value).toBe('new-private-refresh');
});
test('отслеживаемые эфиры используют user ID авторизованного аккаунта и пагинацию', async () => {
  let followingUrl = '';
  globalThis.fetch = (async input => {
    if (String(input).includes('/users')) return Response.json({ data: [user] });
    followingUrl = String(input);
    return Response.json({ data: [{ user_id: 'channel', user_login: 'actual_login', user_name: 'Автор', title: 'Эфир', game_name: 'Игра', viewer_count: 5, thumbnail_url: 'https://example.com/{width}/{height}' }], pagination: { cursor: 'next' } });
  }) as typeof fetch;
  const response = await following(new NextRequest('http://localhost/api/twitch/following?cursor=second', { headers: { cookie: 'streamly_tw_access=access' } }));
  const body = await response.json();
  expect(followingUrl).toContain('user_id=user1');
  expect(followingUrl).toContain('after=second');
  expect(body.items[0].url).toBe('https://www.twitch.tv/actual_login');
  expect(body.nextCursor).toBe('next');
});
test('временный сбой Twitch не требует повторной авторизации и не обновляет токен', async () => {
  let refreshCalls = 0;
  globalThis.fetch = (async input => { if (String(input).includes('/token')) refreshCalls++; return Response.json({}, { status: 503 }); }) as typeof fetch;
  const response = await account(new NextRequest('http://localhost/api/twitch/account', { headers: { cookie: 'streamly_tw_access=access; streamly_tw_refresh=refresh' } }));
  expect(response.status).toBe(502);
  expect(refreshCalls).toBe(0);
});
test('отключение отклоняет чужой origin и удаляет cookies для своего', async () => {
  expect((await disconnect(new NextRequest('http://localhost/api/twitch/disconnect', { method: 'POST', headers: { origin: 'https://evil.example' } }))).status).toBe(403);
  const response = await disconnect(new NextRequest('http://localhost/api/twitch/disconnect', { method: 'POST', headers: { origin: 'http://localhost' } }));
  expect(response.status).toBe(200);
  expect(response.cookies.get('streamly_tw_access')?.value).toBe('');
});
