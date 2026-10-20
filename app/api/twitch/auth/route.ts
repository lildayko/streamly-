import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId || !process.env.TWITCH_CLIENT_SECRET) return NextResponse.json({ error: 'Настрой TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET для привязки Twitch.' }, { status: 503 });
  const state = randomBytes(32).toString('hex');
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: process.env.TWITCH_REDIRECT_URI || `${request.nextUrl.origin}/api/twitch/callback`, response_type: 'code', scope: 'user:read:follows', state, force_verify: 'true' }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set('streamly_tw_oauth_state', state, { httpOnly: true, secure: request.nextUrl.protocol === 'https:', sameSite: 'lax', maxAge: 600, path: '/' });
  return response;
}
