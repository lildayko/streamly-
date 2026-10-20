import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/twitch/diagnostics/route';

test('диагностика показывает конфигурацию без значений Client ID, Secret, state и токенов', async () => {
  const oldId = process.env.TWITCH_CLIENT_ID, oldSecret = process.env.TWITCH_CLIENT_SECRET, oldRedirect = process.env.TWITCH_REDIRECT_URI;
  process.env.TWITCH_CLIENT_ID = 'private-client-id'; process.env.TWITCH_CLIENT_SECRET = 'private-secret'; process.env.TWITCH_REDIRECT_URI = 'http://localhost:3000/api/twitch/callback';
  try {
    const response = await GET(new NextRequest('http://localhost:3000/api/twitch/diagnostics', { headers: { host: 'localhost:3000', cookie: 'streamly_tw_access=private-token; streamly_tw_oauth_state=private-state' } }));
    const text = await response.text(), body = JSON.parse(text);
    expect(body.version).toBe('oauth-4');
    expect(body.clientIdPresent).toBe(true); expect(body.clientSecretPresent).toBe(true);
    expect(body.redirectUri).toBe('http://localhost:3000/api/twitch/callback');
    for (const value of ['private-client-id', 'private-secret', 'private-token', 'private-state']) expect(text).not.toContain(value);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  } finally {
    for (const [name, value] of [['TWITCH_CLIENT_ID', oldId], ['TWITCH_CLIENT_SECRET', oldSecret], ['TWITCH_REDIRECT_URI', oldRedirect]]) { if (value === undefined) delete process.env[name!]; else process.env[name!] = value; }
  }
});
