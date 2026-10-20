import { NextRequest, NextResponse } from "next/server";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const home = new URL("/", request.nextUrl.origin);
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = request.cookies.get("streamly_yt_oauth_state")?.value;
  const oauthError = request.nextUrl.searchParams.get("error");
  if (oauthError || !code || !state || !savedState || state !== savedState) {
    home.searchParams.set("youtube", "connect_error");
    return NextResponse.redirect(home);
  }
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI || `${request.nextUrl.origin}/api/youtube/callback`;
  if (!clientId || !clientSecret) {
    home.searchParams.set("youtube", "missing_config");
    return NextResponse.redirect(home);
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let tokenResponse: Response;
    try {
      tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
        cache: "no-store", signal: controller.signal
      });
    } finally { clearTimeout(timeout); }
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) {
      home.searchParams.set("youtube", "token_error");
      return NextResponse.redirect(home);
    }
    const response = NextResponse.redirect(new URL("/?youtube=connected", request.nextUrl.origin));
    response.cookies.delete("streamly_yt_oauth_state");
    response.cookies.set("streamly_yt_access", token.access_token, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: Number(token.expires_in || 3600), path: "/" });
    if (token.refresh_token) response.cookies.set("streamly_yt_refresh", token.refresh_token, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 60 * 60 * 24 * 365, path: "/" });
    return response;
  } catch {
    home.searchParams.set("youtube", "network_error");
    return NextResponse.redirect(home);
  }
}
