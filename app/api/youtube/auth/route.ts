import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: "Добавь YOUTUBE_CLIENT_ID и YOUTUBE_CLIENT_SECRET в .env.local для входа через YouTube." }, { status: 503 });
  const state = randomBytes(24).toString("hex");
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${request.nextUrl.origin}/api/youtube/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "https://www.googleapis.com/auth/youtube.readonly", access_type: "offline", include_granted_scopes: "true", prompt: "consent", state }).toString();
  const response = NextResponse.redirect(url);
  response.cookies.set("streamly_yt_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 600, path: "/" });
  return response;
}
