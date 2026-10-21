import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { GET as comments } from '../app/api/youtube/comments/route';
import { GET as avatars } from '../app/api/youtube/avatars/route';
import { validateImported } from '../lib/youtube-bridge';
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
test.beforeEach(() => { process.env.YOUTUBE_API_KEY = 'test-key'; });
test.afterEach(() => { globalThis.fetch = originalFetch; process.env = { ...originalEnv }; });
const request = (query = '') => new NextRequest(`http://localhost:3000/api/youtube/comments?videoId=abcdefghijk${query}`);
test('комментарии и ответы передают pageToken, текст запрашивается без HTML', async () => {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input)); calls.push(url);
    const snippet = { authorDisplayName: 'Автор', textDisplay: '<b>Обычный текст</b>', authorProfileImageUrl: 'https://yt3.ggpht.com/avatar', likeCount: 7 };
    return Response.json({ nextPageToken: 'next', items: [{ id: 'reply', snippet: url.pathname.endsWith('/comments') ? snippet : { topLevelComment: { id: 'comment', snippet }, totalReplyCount: 12 } }] });
  }) as typeof fetch;
  const first = await (await comments(request('&cursor=page2&order=time'))).json();
  expect(calls[0].searchParams.get('pageToken')).toBe('page2');
  expect(calls[0].searchParams.get('textFormat')).toBe('plainText');
  expect(calls[0].searchParams.get('order')).toBe('time');
  expect(first.items[0]).toMatchObject({ id: 'comment', replies: 12, likes: 7, text: '<b>Обычный текст</b>' });
  expect(first.nextCursor).toBe('next');
  const second = await (await comments(request('&parentId=comment&cursor=replies2'))).json();
  expect(calls[1].pathname).toMatch(/\/comments$/);
  expect(calls[1].searchParams.get('parentId')).toBe('comment');
  expect(second.items[0].id).toBe('reply');
});
test('отключённые комментарии и отсутствие доступа отличаются от пустого списка', async () => {
  globalThis.fetch = (async () => Response.json({ error: { errors: [{ reason: 'commentsDisabled' }] } }, { status: 403 })) as typeof fetch;
  const disabled = await comments(request());
  expect(disabled.status).toBe(403);
  expect((await disabled.json()).reason).toBe('commentsDisabled');
  delete process.env.YOUTUBE_API_KEY;
  const missing = await comments(request());
  expect(missing.status).toBe(401);
});
test('аватарки загружаются пакетно по каналам, а не из превью роликов', async () => {
  const calls: URL[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input)); calls.push(url);
    return Response.json({ items: url.pathname.endsWith('/videos') ? [{ id: 'abcdefghijk', snippet: { channelId: 'channel' } }, { id: 'lmnopqrstuv', snippet: { channelId: 'channel' } }] : [{ id: 'channel', snippet: { thumbnails: { default: { url: 'https://yt3.ggpht.com/avatar' } } } }] });
  }) as typeof fetch;
  const body = await (await avatars(new NextRequest('http://localhost/api/youtube/avatars?ids=abcdefghijk,lmnopqrstuv'))).json();
  expect(calls).toHaveLength(2);
  expect(calls[1].searchParams.get('id')).toBe('channel');
  expect(body.avatars['yt-abcdefghijk']).toBe('https://yt3.ggpht.com/avatar');
  expect(body.avatars['yt-lmnopqrstuv']).toBe(body.avatars['yt-abcdefghijk']);
});
test('обновлённый OAuth-токен сохраняется HttpOnly и не попадает в JSON', async () => {
  delete process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_CLIENT_ID = 'id'; process.env.YOUTUBE_CLIENT_SECRET = 'secret';
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    if (String(input).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'rotated-token' });
    expect(init?.headers).toEqual({ Authorization: 'Bearer rotated-token' });
    return Response.json({ items: [] });
  }) as typeof fetch;
  const result = await comments(new NextRequest(request().url, { headers: { cookie: 'streamly_yt_refresh=refresh' } }));
  expect(result.headers.get('set-cookie')).toContain('HttpOnly');
  expect(result.headers.get('Cache-Control')).toBe('private, no-store');
  expect(await result.text()).not.toContain('rotated-token');
});
test('импорт не принимает чужие ссылки, HTML и сторонние трекеры в изображениях', () => {
  const rows = validateImported([{ id: 'yt-abcdefghijk', title: '<script>text</script>', creator: 'Автор', url: 'javascript:alert(1)', image: 'https://tracker.example/image', channelAvatar: 'https://yt3.ggpht.com/avatar' }, { id: 'bad', title: 'bad', creator: 'bad' }]);
  expect(rows).toHaveLength(1);
  expect(rows[0].url).toBe('https://www.youtube.com/watch?v=abcdefghijk');
  expect(rows[0].image).toBe('');
  expect(rows[0].channelAvatar).toBe('https://yt3.ggpht.com/avatar');
});
