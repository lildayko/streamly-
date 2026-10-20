import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchSession, twitchApi, twitchError, twitchSession } from '@/lib/twitch-account';
export const runtime = 'nodejs';
type Stream = { user_id: string; user_login: string; user_name: string; title: string; game_name: string; viewer_count: number; thumbnail_url: string };
export async function GET(request: NextRequest) {
  try {
    const session = await twitchSession(request);
    const params = new URLSearchParams({ user_id: session.user.id, first: '50' });
    const cursor = request.nextUrl.searchParams.get('cursor');
    if (cursor) { if (cursor.length > 2000) return NextResponse.json({ message: 'Некорректная страница Twitch.' }, { status: 400 }); params.set('after', cursor); }
    const body = await twitchApi(`streams/followed?${params}`, session.access);
    const items = (body.data || []).map((v: Stream) => ({ id: `tw-${v.user_id}`, channelId: v.user_id, title: v.title, creator: v.user_name, platform: 'Twitch', category: v.game_name || 'Стримы', views: `${v.viewer_count} зрителей`, age: 'В эфире', duration: 'LIVE', live: true, image: v.thumbnail_url.replace('{width}', '640').replace('{height}', '360'), url: `https://www.twitch.tv/${v.user_login}` }));
    return saveTwitchSession(NextResponse.json({ connected: true, items, nextCursor: body.pagination?.cursor || '' }, { headers: { 'Cache-Control': 'private, no-store' } }), session, request);
  } catch (error) { return twitchError(error); }
}
