import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchSession, twitchApi, TwitchAccountError } from '@/lib/twitch-account';
import { twitchOrigin, twitchRedirect, twitchAuthorizationError } from '@/lib/twitch-oauth';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const home = new URL('/', twitchOrigin(request));
  function failure(reason: string, stage = "callback") {
    home.searchParams.set('twitch', reason);
    home.searchParams.set('twitch_stage', stage);
    const response = NextResponse.redirect(home);
    response.cookies.delete('streamly_tw_oauth_state');
    response.cookies.delete('streamly_tw_oauth_redirect');
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }
  if (request.nextUrl.searchParams.has('error')) return failure(twitchAuthorizationError(request.nextUrl.searchParams.get('error'), request.nextUrl.searchParams.get('error_description')), 'authorization');
  const state = request.nextUrl.searchParams.get('state'), code = request.nextUrl.searchParams.get('code');
  if (!request.cookies.get('streamly_tw_oauth_state')?.value) return failure('state_missing');
  if (!state || state !== request.cookies.get('streamly_tw_oauth_state')?.value) return failure('state_mismatch');
  if (!code) return failure('missing_code');
  const clientId = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !secret) return failure('missing_config', 'configuration');
  let redirectUri: string;
  try { redirectUri = request.cookies.get('streamly_tw_oauth_redirect')?.value || twitchRedirect(request).href; }
  catch { return failure('redirect_config', 'configuration'); }
  try {
    const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code', redirect_uri: redirectUri }), cache: 'no-store', signal: AbortSignal.timeout(15000) });
    const token = await response.json();
    if (!response.ok || !token.access_token) {
      const message = String(token.message || token.error || '').toLowerCase();
      if (message.includes('redirect')) return failure('redirect_mismatch', 'token');
      if (message.includes('client')) return failure('invalid_client', 'token');
      if (message.includes('code') || message.includes('grant')) return failure('code_expired', 'token');
      return failure('token_error', 'token');
    }
    const profile = await twitchApi('users', token.access_token);
    if (!profile.data?.[0]?.id) return failure('profile_error', 'profile');
    home.searchParams.set('twitch', 'connected');
    const result = NextResponse.redirect(home);
    result.headers.set('Cache-Control', 'no-store');
    result.cookies.delete('streamly_tw_oauth_state');
    result.cookies.delete('streamly_tw_oauth_redirect');
    return saveTwitchSession(result, { access: token.access_token, refresh: token.refresh_token, expires: Number(token.expires_in) || 3600, user: profile.data[0] }, request);
  } catch (error) { return failure(error instanceof TwitchAccountError ? 'profile_error' : 'network_error', error instanceof TwitchAccountError ? 'profile' : 'network'); }
}
