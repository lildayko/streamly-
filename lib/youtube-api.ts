import { NextRequest, NextResponse } from 'next/server';

export class YouTubeError extends Error {
  constructor(message: string, public status = 502, public reason = '') { super(message); }
}
// Public video data can use an API key or the existing read-only account session.
export function youtubeClient(request: NextRequest) {
  let token = request.cookies.get('streamly_yt_access')?.value || '';
  let rotated = '';
  const key = process.env.YOUTUBE_API_KEY;
  async function refresh() {
    const refreshToken = request.cookies.get('streamly_yt_refresh')?.value;
    if (!refreshToken || !process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_CLIENT_SECRET) return false;
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: process.env.YOUTUBE_CLIENT_ID, client_secret: process.env.YOUTUBE_CLIENT_SECRET }),
      cache: 'no-store', signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.access_token) return false;
    token = rotated = body.access_token;
    return true;
  }
  async function get(path: string, params: Record<string, string>) {
    if (!key && !token && !await refresh()) throw new YouTubeError('Подключи YouTube или добавь YOUTUBE_API_KEY для загрузки комментариев и аватарок.', 401);
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    url.search = new URLSearchParams({ ...params, ...(key ? { key } : {}) }).toString();
    const run = () => fetch(url, { headers: !key ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store', signal: AbortSignal.timeout(15000) });
    let response = await run();
    if (response.status === 401 && !key && await refresh()) response = await run();
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = body.error?.errors?.[0]?.reason || '';
      const message = reason === 'commentsDisabled' ? 'Автор отключил комментарии к этому видео.' : reason === 'quotaExceeded' ? 'Квота YouTube API исчерпана. Попробуй позже.' : response.status === 404 ? 'Видео или комментарий недоступен.' : 'Не удалось загрузить данные YouTube. Проверь доступ и повтори попытку.';
      throw new YouTubeError(message, response.status, reason);
    }
    return body;
  }
  function json(body: unknown, status = 200) {
    const response = NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
    if (rotated) response.cookies.set('streamly_yt_access', rotated, { httpOnly: true, sameSite: 'lax', secure: request.nextUrl.protocol === 'https:', maxAge: 3600, path: '/' });
    return response;
  }
  return { get, json };
}
