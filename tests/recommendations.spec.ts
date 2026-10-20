import { test, expect } from '@playwright/test';
import { NextRequest } from 'next/server';
import { POST } from '../app/api/recommendations/route';
import { interestTopics, rankRecommendations } from '../lib/recommendations';
const fetchOriginal = globalThis.fetch;
const keyOriginal = process.env.YOUTUBE_API_KEY;
test.afterEach(() => { globalThis.fetch = fetchOriginal; if (keyOriginal === undefined) delete process.env.YOUTUBE_API_KEY; else process.env.YOUTUBE_API_KEY = keyOriginal; });
test('темы включают явные интересы, историю и новые направления', () => {
  const topics = interestTopics(['Космос'], [{ id: '1', title: 'Роботы и космос' }]);
  expect(topics).toContain('Космос'); expect(topics).toContain('роботы'); expect(topics).toContain('путешествия');
});
test('рекомендации исключают просмотренное, удаляют дубли и повышают новых авторов', () => {
  const items = [{ id: 'seen', title: 'Космос', channelId: 'known' }, { id: 'known', title: 'Космос', channelId: 'known' }, { id: 'new', title: 'Космос', channelId: 'new' }, { id: 'new', title: 'Космос', channelId: 'new' }];
  const result = rankRecommendations(items, [{ id: 'seen', title: 'Космос' }], ['known'], 'Космос');
  expect(result.map(x => x.id)).toEqual(['new', 'known']);
  expect(result[0].reason).toContain('Новый автор');
});
test('сервер ищет кандидатов по интересу вне подписок и продолжает следующие темы', async () => {
  process.env.YOUTUBE_API_KEY = 'test-key';
  const queries: string[] = [];
  globalThis.fetch = (async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/videos')) return Response.json({ items: [] });
    queries.push(url.searchParams.get('q')!);
    return Response.json({ items: [{ id: { videoId: 'new-author' }, snippet: { title: 'Космос', channelId: 'outside-subscriptions' } }] });
  }) as typeof fetch;
  const request = (cursor = '') => new NextRequest('http://localhost/api/recommendations', { method: 'POST', body: JSON.stringify({ interests: ['Космос'], subscribed: ['my-channel'], platform: 'YouTube', cursor }) });
  const first = await (await POST(request())).json();
  expect(queries[0]).toBe('Космос'); expect(first.items[0].channelId).toBe('outside-subscriptions');
  expect(first.nextCursor).toBeTruthy();
  await POST(request(first.nextCursor));
  expect(queries[1]).not.toBe(queries[0]);
});
test('невалидный курсор отклоняется без запросов к платформам', async () => {
  const response = await POST(new NextRequest('http://localhost/api/recommendations', { method: 'POST', body: JSON.stringify({ cursor: 'invalid' }) }));
  expect(response.status).toBe(400);
});
