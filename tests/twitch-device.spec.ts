import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/twitch/device/route';
import { twitchSession } from '../lib/twitch-account';
const originalFetch = globalThis.fetch, originalNow = Date.now;
const oldId = process.env.TWITCH_CLIENT_ID, oldSecret = process.env.TWITCH_CLIENT_SECRET;
let now: number;
test.beforeEach(() => { now = originalNow(); Date.now = () => now; process.env.TWITCH_CLIENT_ID = 'test-client'; });
test.afterEach(() => {
  globalThis.fetch = originalFetch; Date.now = originalNow;
  if (oldId === undefined) delete process.env.TWITCH_CLIENT_ID; else process.env.TWITCH_CLIENT_ID = oldId;
  if (oldSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET; else process.env.TWITCH_CLIENT_SECRET = oldSecret;
});
const req = (action: string, id = '', origin = 'http://localhost') => new NextRequest('http://localhost/api/twitch/device', { method: 'POST', headers: { origin, 'Content-Type': 'application/json', cookie: id ? `streamly_tw_device=${id}` : '' }, body: JSON.stringify({ action }) });
const device = { device_code: 'private-device-code', user_code: 'ABCD-EFGH', verification_uri: 'https://www.twitch.tv/activate', expires_in: 600, interval: 5 };
const profile = { data: [{ id: 'me', login: 'me', display_name: 'Мой Twitch' }] };
async function start() { return POST(req('start')); }

test('вход по коду не отправляет redirect URI и не отдаёт device_code браузеру', async () => {
  let form: URLSearchParams | undefined;
  globalThis.fetch = (async (_input, options) => { form = new URLSearchParams(String(options?.body)); return Response.json(device); }) as typeof fetch;
  const response = await start(), body = await response.json();
  expect(form!.get('scopes')).toBe('user:read:follows');
  expect(form!.has('redirect_uri')).toBe(false); expect(form!.has('client_secret')).toBe(false);
  expect(body.userCode).toBe('ABCD-EFGH'); expect(JSON.stringify(body)).not.toContain('private-device-code');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
});
test('poll соблюдает интервал Twitch; pending и slow_down не превращаются в ошибку', async () => {
  let tokens = 0;
  globalThis.fetch = (async input => {
    if (String(input).endsWith('/device')) return Response.json(device);
    tokens++; return Response.json({ message: tokens === 1 ? 'authorization_pending' : 'slow_down' }, { status: 400 });
  }) as typeof fetch;
  const id = (await start()).cookies.get('streamly_tw_device')!.value;
  expect((await (await POST(req('poll', id))).json()).status).toBe('pending'); expect(tokens).toBe(0);
  now += 5000;
  expect((await (await POST(req('poll', id))).json()).interval).toBe(5);
  now += 5000;
  expect((await (await POST(req('poll', id))).json()).interval).toBe(10);
  await POST(req('poll', id)); expect(tokens).toBe(2);
});
test('подтверждённый код создаёт сессию; токены не попадают в JSON, попытка расходуется', async () => {
  let tokenForm: URLSearchParams | undefined;
  globalThis.fetch = (async (input, options) => {
    if (String(input).endsWith('/device')) return Response.json(device);
    if (String(input).includes('/token')) { tokenForm = new URLSearchParams(String(options?.body)); return Response.json({ access_token: 'private-access', refresh_token: 'private-refresh', expires_in: 3600 }); }
    return Response.json(profile);
  }) as typeof fetch;
  const id = (await start()).cookies.get('streamly_tw_device')!.value; now += 5000;
  const response = await POST(req('poll', id)), body = await response.json();
  expect(body.status).toBe('connected'); expect(JSON.stringify(body)).not.toContain('private');
  expect(tokenForm!.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:device_code');
  expect(tokenForm!.get('device_code')).toBe('private-device-code');
  expect(response.cookies.get('streamly_tw_access')?.value).toBe('private-access');
  expect(response.cookies.get('streamly_tw_refresh')?.value).toBe('private-refresh');
  expect((await POST(req('poll', id))).status).toBe(410);
});
test('отмена и истечение кода прекращают попытку без нового обращения к Twitch', async () => {
  let requests = 0;
  globalThis.fetch = (async () => { requests++; return Response.json(device); }) as typeof fetch;
  const first = (await start()).cookies.get('streamly_tw_device')!.value;
  await POST(req('cancel', first)); expect((await POST(req('poll', first))).status).toBe(410);
  const second = (await start()).cookies.get('streamly_tw_device')!.value; now += 601000;
  expect((await POST(req('poll', second))).status).toBe(410); expect(requests).toBe(2);
});
test('отказ в доступе удаляет попытку и не создаёт сессию', async () => {
  globalThis.fetch = (async input => String(input).endsWith('/device') ? Response.json(device) : Response.json({ message: 'access_denied' }, { status: 400 })) as typeof fetch;
  const id = (await start()).cookies.get('streamly_tw_device')!.value; now += 5000;
  const result = await POST(req('poll', id)); expect(result.status).toBe(403);
  expect(result.cookies.get('streamly_tw_access')).toBeUndefined();
  expect((await POST(req('poll', id))).status).toBe(410);
});
test('чужой origin и поддельный адрес подтверждения отклоняются', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ ...device, verification_uri: 'https://evil.example/activate' }); }) as typeof fetch;
  expect((await POST(req('start', '', 'https://evil.example'))).status).toBe(403); expect(calls).toBe(0);
  expect((await start()).status).toBe(502);
});
test('временная ошибка профиля позволяет повторить проверку без повторного обмена device_code', async () => {
  let exchanges = 0, profiles = 0;
  globalThis.fetch = (async input => {
    if (String(input).endsWith('/device')) return Response.json(device);
    if (String(input).includes('/token')) { exchanges++; return Response.json({ access_token: 'private-access', expires_in: 3600 }); }
    profiles++; return profiles === 1 ? Response.json({}, { status: 503 }) : Response.json(profile);
  }) as typeof fetch;
  const id = (await start()).cookies.get('streamly_tw_device')!.value; now += 5000;
  expect((await POST(req('poll', id))).status).toBe(502); now += 5000;
  expect((await (await POST(req('poll', id))).json()).status).toBe('connected'); expect(exchanges).toBe(1);
});
test('отмена во время проверки не позволяет позднему ответу подключить аккаунт', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = (async input => {
    if (String(input).endsWith('/device')) return Response.json(device);
    if (String(input).includes('/token')) { await gate; return Response.json({ access_token: 'private-access', expires_in: 3600 }); }
    return Response.json(profile);
  }) as typeof fetch;
  const id = (await start()).cookies.get('streamly_tw_device')!.value; now += 5000;
  const pending = POST(req('poll', id));
  // Let request parsing enter the in-flight exchange before cancellation.
  await new Promise(resolve => setTimeout(resolve, 0));
  await POST(req('cancel', id)); release();
  const result = await pending; expect(result.status).toBe(410); expect(result.cookies.get('streamly_tw_access')).toBeUndefined();
});
test('сессия публичного device-клиента обновляется без Client Secret', async () => {
  delete process.env.TWITCH_CLIENT_SECRET;
  let secretSent = false;
  globalThis.fetch = (async (input, options) => {
    if (String(input).includes('/token')) { secretSent = new URLSearchParams(String(options?.body)).has('client_secret'); return Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }); }
    return Response.json(profile);
  }) as typeof fetch;
  const session = await twitchSession(new NextRequest('http://localhost/api/twitch/account', { headers: { cookie: 'streamly_tw_refresh=private-refresh' } }));
  expect(session.user.id).toBe('me'); expect(secretSent).toBe(false);
});
