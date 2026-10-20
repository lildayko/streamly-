import { NextRequest, NextResponse } from 'next/server';
import { saveTwitchSession, twitchError, twitchSession } from '@/lib/twitch-account';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  try {
    const session = await twitchSession(request);
    const { id, login, display_name, profile_image_url } = session.user;
    return saveTwitchSession(NextResponse.json({ connected: true, user: { id, login, displayName: display_name, avatar: profile_image_url } }, { headers: { 'Cache-Control': 'private, no-store' } }), session, request);
  } catch (error) { return twitchError(error); }
}
