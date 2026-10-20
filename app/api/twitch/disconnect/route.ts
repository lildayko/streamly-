import { NextRequest, NextResponse } from 'next/server';
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin) return NextResponse.json({ error: 'Недопустимый источник запроса.' }, { status: 403 });
  const response = NextResponse.json({ connected: false });
  for (const name of ['streamly_tw_access', 'streamly_tw_refresh', 'streamly_tw_oauth_state']) response.cookies.delete(name);
  return response;
}
