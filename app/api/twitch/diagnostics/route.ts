import { NextRequest, NextResponse } from 'next/server';
import { twitchOrigin, twitchRedirect, twitchOAuthVersion } from '@/lib/twitch-oauth';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  let redirectUri: string | null = null;
  try { redirectUri = twitchRedirect(request).href; } catch { /* Report invalid configuration without echoing its contents. */ }
  const requestOrigin = twitchOrigin(request);
  return NextResponse.json({
    version: twitchOAuthVersion,
    clientIdPresent: Boolean(process.env.TWITCH_CLIENT_ID?.trim()),
    clientSecretPresent: Boolean(process.env.TWITCH_CLIENT_SECRET?.trim()),
    redirectUri,
    requestOrigin,
    sameOrigin: redirectUri ? new URL(redirectUri).origin === requestOrigin : null,
    scope: 'user:read:follows',
    responseType: 'code',
    action: redirectUri ? `В OAuth Redirect URLs приложения Twitch должен быть этот точный адрес: ${redirectUri}` : 'Исправь TWITCH_REDIRECT_URI: ожидается полный адрес /api/twitch/callback.',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
