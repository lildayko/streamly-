import { NextRequest, NextResponse } from 'next/server';
export class TwitchAccountError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}
export type TwitchSession = { access: string; refresh?: string; expires?: number; user: { id: string; login: string; display_name: string; profile_image_url: string } };
export async function twitchApi(path: string, access: string) {
  const response = await fetch(`https://api.twitch.tv/helix/${path}`, { headers: { 'Client-Id': process.env.TWITCH_CLIENT_ID || '', Authorization: `Bearer ${access}` }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok) throw new TwitchAccountError(response.status === 401 ? 'Подключи Twitch заново.' : 'Twitch временно не смог загрузить данные.', response.status === 401 ? 401 : 502);
  return body;
}
export async function twitchSession(request: NextRequest): Promise<TwitchSession> {
  let access = request.cookies.get('streamly_tw_access')?.value || '';
  const refresh = request.cookies.get('streamly_tw_refresh')?.value;
  if (!access && !refresh) throw new TwitchAccountError('Подключи аккаунт Twitch.', 401);
  let rotated: { refresh?: string; expires?: number } = {};
  try {
    if (!access) throw new TwitchAccountError('Token expired', 401);
    const body = await twitchApi('users', access);
    if (!body.data?.[0]?.id) throw new TwitchAccountError('Не удалось определить пользователя Twitch.', 401);
    return { access, user: body.data[0] };
  } catch (error) {
    if (!(error instanceof TwitchAccountError) || error.status !== 401 || !refresh) throw error;
    const clientId = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
    if (!clientId || !secret) throw new TwitchAccountError('Настрой TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET.', 503);
    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'refresh_token', refresh_token: refresh }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    if (!response.ok || !body.access_token) throw new TwitchAccountError('Не удалось обновить доступ. Подключи Twitch заново.', response.status >= 500 ? 502 : 401);
    access = body.access_token;
    rotated = { refresh: body.refresh_token || refresh, expires: Number(body.expires_in) || 3600 };
    const profile = await twitchApi('users', access);
    if (!profile.data?.[0]?.id) throw new TwitchAccountError('Не удалось определить пользователя Twitch.', 401);
    return { access, ...rotated, user: profile.data[0] };
  }
}
export function saveTwitchSession(response: NextResponse, session: TwitchSession, request: NextRequest) {
  if (!session.expires) return response;
  const options = { httpOnly: true, sameSite: 'lax' as const, secure: request.nextUrl.protocol === 'https:', path: '/' };
  response.cookies.set('streamly_tw_access', session.access, { ...options, maxAge: session.expires });
  if (session.refresh) response.cookies.set('streamly_tw_refresh', session.refresh, { ...options, maxAge: 60 * 60 * 24 * 365 });
  return response;
}
export function twitchError(error: unknown) {
  return NextResponse.json({ connected: false, message: error instanceof TwitchAccountError ? error.message : 'Не удалось связаться с Twitch.' }, { status: error instanceof TwitchAccountError ? error.status : 502, headers: { 'Cache-Control': 'private, no-store' } });
}
