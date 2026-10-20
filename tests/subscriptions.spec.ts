import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/youtube/recommendations/route';
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
const request = (token: string) => new NextRequest('http://localhost/api/youtube/recommendations', { headers: { cookie: `streamly_yt_access=${token}` } });
test('синхронизация ограничивает параллелизм и сообщает о недоступном канале', async () => {
  let active = 0, peak = 0;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/subscriptions')) return Response.json({ items: Array.from({ length: 12 }, (_, i) => ({ snippet: { resourceId: { channelId: `c${i}` } } })) });
    if (url.pathname.endsWith('/channels')) return Response.json({ items: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, contentDetails: { relatedPlaylists: { uploads: `p${i}` } } })) });
    if (url.pathname.endsWith('/playlistItems')) {
      active++; peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 20)); active--;
      if (url.searchParams.get('playlistId') === 'p0') return Response.json({ error: { message: 'Unavailable' } }, { status: 403 });
      return Response.json({ items: [] });
    }
    throw new Error('Unexpected URL');
  }) as typeof fetch;
  const body = await (await GET(request('test-partial'))).json();
  expect(peak).toBeLessThanOrEqual(5);
  expect(peak).toBeGreaterThan(1);
  expect(body.connected).toBe(true);
  expect(body.partial).toBe(true);
  expect(body.failedChannelIds).toEqual(['c0']);
  expect(body.channels).toHaveLength(12);
});
test('кэш подписок изолирован по сессии и не запрашивает платформу повторно', async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ items: [] }); }) as typeof fetch;
  await GET(request('test-cache-a'));
  const firstCalls = calls;
  const hit = await GET(request('test-cache-a'));
  expect(calls).toBe(firstCalls);
  expect(hit.headers.get('Cache-Control')).toBe('private, no-store');
  await GET(request('test-cache-b'));
  expect(calls).toBeGreaterThan(firstCalls);
});
