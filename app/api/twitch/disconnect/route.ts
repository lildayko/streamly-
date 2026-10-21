import { NextRequest, NextResponse } from 'next/server';
import { cancelTwitchDevice } from '@/lib/twitch-device';
import { twitchOrigin } from '@/lib/twitch-oauth';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== twitchOrigin(request)) return NextResponse.json({ error: 'Недопустимый источник запроса.' }, { status: 403 });
  cancelTwitchDevice(request);
  const response = NextResponse.json({ connected: false });
  for (const name of ['streamly_tw_access', 'streamly_tw_refresh', 'streamly_tw_oauth_state', 'streamly_tw_oauth_redirect', 'streamly_tw_device']) response.cookies.delete(name);
  return response;
}
