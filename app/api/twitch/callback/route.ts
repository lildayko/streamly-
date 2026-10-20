import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchSession, twitchApi, TwitchAccountError } from '@/lib/twitch-account';
import { twitchOrigin, twitchRedirect } from '@/lib/twitch-oauth';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const home = new URL('/', twitchOrigin(request));
  function failure(reason: string) {
    home.searchParams.set('twitch', reason);
    const response = NextResponse.redirect(home);
    response.cookies.delete('streamly_tw_oauth_state');
    response.cookies.delete('streamly_tw_oauth_redirect');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  if (request.nextUrl.searchParams.has('error')) return failure(request.nextUrl.searchParams.get('error') === 'access_denied' ? 'access_denied' : 'connect_error');
  const state = request.nextUrl.searchParams.get('state'), code = request.nextUrl.searchParams.get('code');
  if (!request.cookies.get('streamly_tw_oauth_state')?.value) return failure('state_missing');
  if (!state || state !== request.cookies.get('streamly_tw_oauth_state')?.value) return failure('state_mismatch');
  if (!code) return failure('missing_code');
  const clientId = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !secret) return failure('missing_config');
  let redirectUri: string;
  try { redirectUri = request.cookies.get('streamly_tw_oauth_redirect')?.value || twitchRedirect(request).href; }
  catch { return failure('redirect_config'); }
  try {
    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const token = await response.json();
    if (!response.ok || !token.access_token) {
      const message = String(token.message || token.error || '').toLowerCase();
      if (message.includes('redirect')) return failure('redirect_mismatch');
      if (message.includes('client')) return failure('invalid_client');
      if (message.includes('code') || message.includes('grant')) return failure('code_expired');
      return failure('token_error');
    }
    const profile = await twitchApi('users', token.access_token);
    if (!profile.data?.[0]?.id) return failure('profile_error');
    home.searchParams.set('twitch', 'connected');
    const result = NextResponse.redirect(home);
    result.headers.set('Cache-Control', 'no-store');
    result.cookies.delete('streamly_tw_oauth_state');
    result.cookies.delete('streamly_tw_oauth_redirect');
    return saveTwitchSession(result, { access: token.access_token, refresh: token.refresh_token, expires: Number(token.expires_in) || 3600, user: profile.data[0] }, request);
  } catch (error) { return failure(error instanceof TwitchAccountError ? 'profile_error' : 'network_error'); }
}
