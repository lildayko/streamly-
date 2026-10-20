import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/search/route';
import { cachedSearch, SearchBusyError } from '../lib/search-cache';

const originalFetch = globalThis.fetch;
const originalKey = process.env.YOUTUBE_API_KEY;
test.afterEach(() => { globalThis.fetch = originalFetch; if (originalKey === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = originalKey; });

test('YouTube прокидывает курсор, возвращает следующий и сохраняет неизвестную длительность', async () => {
  process.env.YOUTUBE_API_KEY = 'test-placeholder';
  const calls: URL[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input)); calls.push(url);
    if (url.pathname.endsWith('/videos')) return Response.json({ error: 'unavailable' }, { status: 503 });
    return Response.json({ nextPageToken: 'page-three', items: [{ id: { videoId: 'a' }, snippet: { title: 'Видео' } }] });
  }) as typeof fetch;
  const cursor = Buffer.from(JSON.stringify({ q: 'pagination-test', selected: 'YouTube', pages: { YouTube: 'page-two' } })).toString('base64url');
  const result = await GET(new NextRequest(`http://localhost/api/search?q=pagination-test&platform=YouTube&cursor=${cursor}`));
  const body = await result.json();
  expect(calls[0].searchParams.get('pageToken')).toBe('page-two');
  expect(body.items).toHaveLength(1);
  expect(body.items[0].duration).toBe('Видео');
  expect(JSON.parse(Buffer.from(body.nextCursor, 'base64url').toString()).pages.YouTube).toBe('page-three');
});
test('одинаковые параллельные поиски используют один запрос к платформе', async () => {
  process.env.YOUTUBE_API_KEY = 'test-placeholder';
  let calls = 0;
  globalThis.fetch = (async () => { calls++; await new Promise(resolve => setTimeout(resolve, 20)); return Response.json({ items: [] }); }) as typeof fetch;
  const url = 'http://localhost/api/search?q=deduplicate-test&platform=YouTube';
  const [a, b] = await Promise.all([GET(new NextRequest(url)), GET(new NextRequest(url))]);
  expect(a.status).toBe(200); expect(b.status).toBe(200); expect(calls).toBe(1);
});
test('ошибка платформы отличается от успешной пустой выдачи', async () => {
  process.env.YOUTUBE_API_KEY = 'test-placeholder';
  globalThis.fetch = (async () => Response.json({ error: { message: 'Quota exceeded' } }, { status: 403 })) as typeof fetch;
  const body = await (await GET(new NextRequest('http://localhost/api/search?q=quota-test&platform=YouTube'))).json();
  expect(body.statuses.YouTube.message).toBe('Quota exceeded');
  expect(body.items).toEqual([]);
});
test('ограничитель не допускает больше восьми одновременных обращений', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = Array.from({ length: 8 }, (_, i) => cachedSearch(`busy-${i}`, async () => { await gate; return i; }));
  try { await expect(cachedSearch('busy-overflow', async () => 9)).rejects.toBeInstanceOf(SearchBusyError); }
  finally { release(); await Promise.all(pending); }
});

test('сетевой сбой при чтении длительности не скрывает найденные видео', async () => {
  process.env.YOUTUBE_API_KEY = 'test-placeholder';
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    if (new URL(String(input)).pathname.endsWith('/videos')) throw new Error('Timeout');
    return Response.json({ items: [{ id: { videoId: 'network-fallback' }, snippet: { title: 'Найденное видео' } }] });
  }) as typeof fetch;
  const body = await (await GET(new NextRequest('http://localhost/api/search?q=network-fallback&platform=YouTube'))).json();
  expect(body.items[0].title).toBe('Найденное видео');
  expect(body.statuses.YouTube.message).toBe('Подключено');
});

test('YouTube в режиме эфиров запрашивает live и помечает карточки трансляциями', async () => {
  process.env.YOUTUBE_API_KEY = 'test-placeholder';
  let upstream: URL | undefined;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    upstream = new URL(String(input));
    return Response.json({ items: [{ id: { videoId: 'live-test' }, snippet: { title: 'Прямой эфир' } }] });
  }) as typeof fetch;
  const body = await (await GET(new NextRequest('http://localhost/api/search?discover=1&live=1&platform=YouTube'))).json();
  expect(upstream!.searchParams.get('eventType')).toBe('live');
  expect(body.items[0].live).toBe(true);
  expect(body.items[0].duration).toBe('LIVE');
});
test('Twitch discovery использует streams, login и курсор вместо поиска по популярным видео', async () => {
  const originalId = process.env.TWITCH_CLIENT_ID, originalSecret = process.env.TWITCH_CLIENT_SECRET;
  process.env.TWITCH_CLIENT_ID = 'test-id'; process.env.TWITCH_CLIENT_SECRET = 'test-secret';
  const calls: URL[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input)); calls.push(url);
    if (url.hostname === 'id.twitch.tv') return Response.json({ access_token: 'mock-token' });
    return Response.json({ data: [{ id: 'session-id', user_id: 'user-id', user_login: 'actual_login', user_name: 'Отображаемое имя', title: 'Эфир', viewer_count: 100 }], pagination: { cursor: 'twitch-next' } });
  }) as typeof fetch;
  try {
    const body = await (await GET(new NextRequest('http://localhost/api/search?discover=1&live=1&platform=Twitch'))).json();
    expect(calls[1].pathname).toBe('/helix/streams');
    expect(calls[1].searchParams.has('query')).toBe(false);
    expect(body.items[0].url).toBe('https://www.twitch.tv/actual_login');
    expect(body.items[0].id).toBe('tw-user-id');
    expect(body.items[0].live).toBe(true);
    const next = await (await GET(new NextRequest(`http://localhost/api/search?discover=1&live=1&platform=Twitch&cursor=${body.nextCursor}`))).json();
    expect(calls[3].searchParams.get('after')).toBe('twitch-next');
    expect(next.items).toHaveLength(1);
  } finally {
    if (originalId === undefined) delete process.env.TWITCH_CLIENT_ID; else process.env.TWITCH_CLIENT_ID = originalId;
    if (originalSecret === undefined) delete process.env.TWITCH_CLIENT_SECRET; else process.env.TWITCH_CLIENT_SECRET = originalSecret;
  }
});
