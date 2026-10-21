import { NextRequest } from 'next/server';
import { twitchDevice } from '@/lib/twitch-device';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) { return twitchDevice(request); }
