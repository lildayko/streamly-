import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { GET as search } from '../search/route';
import { interestTopics, rankRecommendations, Signal, Candidate } from '@/lib/recommendations';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > 64000) return NextResponse.json({ error: 'Слишком большой профиль интересов.' }, { status: 413 });
  try {
    const input = JSON.parse(raw);
    const interests: string[] = Array.isArray(input.interests) ? input.interests.filter((x: unknown) => typeof x === 'string').slice(0, 8).map((x: string) => x.slice(0, 60)) : [];
    const history: Signal[] = Array.isArray(input.history) ? input.history.filter((x: Signal) => x && typeof x.title === 'string' && (typeof x.id === 'string' || typeof x.id === 'number')).slice(0, 100).map((x: Signal) => ({ id: x.id, title: x.title.slice(0, 200), category: typeof x.category === 'string' ? x.category.slice(0, 100) : '', platform: typeof x.platform === 'string' ? x.platform : '' })) : [];
    const subscribed: string[] = Array.isArray(input.subscribed) ? input.subscribed.filter((x: unknown) => typeof x === 'string').slice(0, 500) : [];
    const platform = ['YouTube', 'Twitch', 'VK Видео'].includes(input.platform) ? input.platform : 'Все платформы';
    const topics = interestTopics(interests, history);
    const fingerprint = createHash('sha256').update(JSON.stringify({ topics, platform })).digest('hex').slice(0, 16);
    let state: { fingerprint: string; index: number; cursors: Record<string, string>; done: number[] } = { fingerprint, index: 0, cursors: {}, done: [] };
    if (input.cursor) {
      if (typeof input.cursor !== 'string' || input.cursor.length > 20000) throw new Error('cursor');
      state = JSON.parse(Buffer.from(input.cursor, 'base64url').toString());
      if (state.fingerprint !== fingerprint || !Number.isInteger(state.index) || state.index < 0 || !state.cursors || typeof state.cursors !== 'object' || Object.values(state.cursors).some(x => typeof x !== 'string') || !Array.isArray(state.done) || state.done.some(x => !Number.isInteger(x))) throw new Error('cursor');
    }
    const index = Array.from({ length: topics.length }, (_, offset) => (state.index + offset) % topics.length).find(i => !state.done.includes(i));
    if (index === undefined) return NextResponse.json({ items: [], nextCursor: '', topics });
    const params = new URLSearchParams({ q: topics[index], platform, topic: '1' });
    if (state.cursors[index]) params.set('cursor', state.cursors[index]);
    const result = await search(new NextRequest(new URL(`/api/search?${params}`, request.url)));
    const body = await result.json();
    if (!result.ok) return NextResponse.json(body, { status: result.status, headers: result.status === 429 ? { 'Retry-After': '60' } : {} });
    const failed = Object.values(body.statuses || {}).some((x: unknown) => (x as { message: string }).message !== 'Подключено');
    if (!body.items?.length && failed) return NextResponse.json({ error: 'Не удалось получить рекомендации. Проверь подключение платформ.', statuses: body.statuses }, { status: 503 });
    if (body.nextCursor && body.nextCursor !== state.cursors[index]) state.cursors[index] = body.nextCursor;
    else { state.done.push(index); delete state.cursors[index]; }
    state.index = (index + 1) % topics.length;
    const nextCursor = state.done.length < topics.length ? Buffer.from(JSON.stringify(state)).toString('base64url') : '';
    const items = rankRecommendations(body.items as Candidate[], history, subscribed, topics[index]);
    return NextResponse.json({ items, nextCursor, statuses: body.statuses, topics }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch { return NextResponse.json({ error: 'Некорректный профиль или устаревшая страница рекомендаций.' }, { status: 400 }); }
}
