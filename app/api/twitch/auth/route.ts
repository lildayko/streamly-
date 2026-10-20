import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { twitchOrigin, twitchRedirect } from '@/lib/twitch-oauth';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId || !process.env.TWITCH_CLIENT_SECRET) return NextResponse.redirect(new URL('/?twitch=missing_config', request.url));
  let redirect: URL;
  try { redirect = twitchRedirect(request); }
  catch { return NextResponse.redirect(new URL('/?twitch=redirect_config', request.url)); }
  // Establish the state cookie on the same origin Twitch will return to.
  if (redirect.origin !== twitchOrigin(request)) return NextResponse.redirect(new URL('/api/twitch/auth', redirect.origin));
  const state = randomBytes(32).toString('hex');
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect.href, response_type: 'code', scope: 'user:read:follows', state, force_verify: 'true' }).toString();
  const response = NextResponse.redirect(url);
  response.headers.set('Cache-Control', 'no-store');
  const options = { httpOnly: true, secure: redirect.protocol === 'https:', sameSite: 'lax' as const, maxAge: 600, path: '/' };
  response.cookies.set('streamly_tw_oauth_state', state, options);
  response.cookies.set('streamly_tw_oauth_redirect', redirect.href, options);
  return response;
}
