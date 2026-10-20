import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchSession, twitchApi } from '@/lib/twitch-account';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const home = new URL('/', request.nextUrl.origin);
  function failure(reason: string) { home.searchParams.set('twitch', reason); const response = NextResponse.redirect(home); response.cookies.delete('streamly_tw_oauth_state'); return response; }
  const state = request.nextUrl.searchParams.get('state'), code = request.nextUrl.searchParams.get('code');
  if (!code || !state || state !== request.cookies.get('streamly_tw_oauth_state')?.value || request.nextUrl.searchParams.has('error')) return failure('connect_error');
  const clientId = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !secret) return failure('missing_config');
  try {
    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: process.env.TWITCH_REDIRECT_URI || `${request.nextUrl.origin}/api/twitch/callback` }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const token = await response.json();
    if (!response.ok || !token.access_token || !token.refresh_token) return failure('token_error');
    const profile = await twitchApi('users', token.access_token);
    if (!profile.data?.[0]?.id) return failure('token_error');
    home.searchParams.set('twitch', 'connected');
    const result = NextResponse.redirect(home);
    result.cookies.delete('streamly_tw_oauth_state');
    return saveTwitchSession(result, { access: token.access_token, refresh: token.refresh_token, expires: Number(token.expires_in) || 3600, user: profile.data[0] }, request);
  } catch { return failure('network_error'); }
}
