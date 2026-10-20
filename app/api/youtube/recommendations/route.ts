import { NextRequest, NextResponse } from "next/server";

import { getSubscriptions, sessionKey, storeSubscriptions } from "@/lib/subscription-cache";

export const runtime = "nodejs";

type YTRow = { id: string; snippet?: { resourceId?: { channelId?: string; videoId?: string }; title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> }; contentDetails?: { relatedPlaylists?: { uploads?: string }; videoId?: string; duration?: string }; statistics?: { subscriberCount?: string } };
type YTChannel = { id: string; title: string; uploadsPlaylistId?: string; thumbnail?: string; description?: string; subscriberCount?: string };
type Video = { id: string; title: string; creator: string; channelId: string; platform: string; category: string; views: string; age: string; duration: string; image: string; url: string };

async function yt(path: string, accessToken: string, params: Record<string, string>) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(25000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `YouTube API ${response.status}`);
  return body;
}

async function getAllSubscriptions(accessToken: string): Promise<YTChannel[]> {
  const channels: YTChannel[] = [];
  let pageToken = "";
  // YouTube returns at most 50 subscriptions per page. Follow every page.
  for (let page = 0; page < 100; page++) {
    const params: Record<string, string> = { part: "snippet", mine: "true", maxResults: "50", order: "alphabetical" };
    if (pageToken) params.pageToken = pageToken;
    const body = await yt("subscriptions", accessToken, params);
    channels.push(...(body.items || []).map((s: YTRow) => ({
      id: String(s.snippet?.resourceId?.channelId || ""),
      title: String(s.snippet?.title || "YouTube"),
      thumbnail: String(s.snippet?.thumbnails?.default?.url || ""),
    })).filter((c: YTChannel) => c.id));
    pageToken = String(body.nextPageToken || "");
    if (!pageToken) break;
  }
  return channels;
}

async function getChannelDetails(accessToken: string, channels: YTChannel[]) {
  const details: YTChannel[] = [];
  for (let i = 0; i < channels.length; i += 50) {
    const ids = channels.slice(i, i + 50).map(c => c.id).join(",");
    const body = await yt("channels", accessToken, { part: "contentDetails,snippet,statistics", id: ids, maxResults: "50" });
    details.push(...(body.items || []).map((item: YTRow) => ({
      id: String(item.id),
      title: String(item.snippet?.title || "YouTube"),
      thumbnail: String(item.snippet?.thumbnails?.default?.url || ""),
      description: String(item.snippet?.description || ""),
      subscriberCount: String(item.statistics?.subscriberCount || ""),
      uploadsPlaylistId: String(item.contentDetails?.relatedPlaylists?.uploads || ""),
    })));
  }
  return details;
}

async function getChannelVideos(accessToken: string, channel: YTChannel, pages: Record<string, string>, cursor = ""): Promise<Video[]> {
  if (!channel.uploadsPlaylistId) return [];
  const body = await yt("playlistItems", accessToken, { part: "snippet,contentDetails", playlistId: channel.uploadsPlaylistId, maxResults: "50", ...(cursor ? { pageToken: cursor } : {}) });
  if (body.nextPageToken) pages[channel.id] = String(body.nextPageToken);
  const rows = (body.items || []).map((v: YTRow) => {
    const snippet = v.snippet || {};
    const videoId = String(v.contentDetails?.videoId || snippet.resourceId?.videoId || "");
    if (!videoId) return null;
    return {
      rawId: videoId,
      item: {
        id: `yt-${videoId}`, title: String(snippet.title || "Видео YouTube"), creator: channel.title,
        channelId: channel.id, platform: "YouTube", category: "Подписки", views: "YouTube",
        age: String(snippet.publishedAt || ""), duration: "",
        image: String(snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || channel.thumbnail || ""),
        url: `https://www.youtube.com/watch?v=${videoId}`,
      } as Video,
    };
  }).filter(Boolean) as { rawId: string; item: Video }[];
  const durations = new Map<string, string>();
  for (let i = 0; i < rows.length; i += 50) {
    try {
      const details = await yt("videos", accessToken, { part: "contentDetails", id: rows.slice(i, i + 50).map(row => row.rawId).join(","), maxResults: "50" });
      for (const video of details.items || []) {
        const iso = String(video.contentDetails?.duration || "");
        const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
        if (!match) continue;
        const seconds = Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
        const minutes = Math.floor(seconds / 60);
        durations.set(String(video.id), `${minutes}:${String(seconds % 60).padStart(2, "0")}`);
      }
    } catch { /* Unknown duration remains visible in the standard feed. */ }
  }
  return rows.map(row => ({ ...row.item, duration: durations.get(row.rawId) || "" }));
}

export async function GET(request: NextRequest) {
  let accessToken = request.cookies.get("streamly_yt_access")?.value || "";
  const refreshToken = request.cookies.get("streamly_yt_refresh")?.value || "";
  let rotatedAccessToken = "";
  if (!accessToken && !refreshToken) return NextResponse.json({ connected: false, items: [], channels: [], message: "Подключи YouTube, чтобы загрузить видео из своих подписок." }, { status: 401 });
  let cursors: Record<string, string> | null = null;
  const encodedCursor = request.nextUrl.searchParams.get("cursor");
  if (encodedCursor) {
    try {
      if (encodedCursor.length > 1000000) throw new Error();
      const parsed = JSON.parse(Buffer.from(encodedCursor, "base64url").toString());
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" || Object.values(parsed).some(v => typeof v !== "string")) throw new Error();
      cursors = parsed;
    } catch { return NextResponse.json({ message: "Некорректная страница подписок" }, { status: 400 }); }
  }
  const pages: Record<string, string> = {};
  const key = sessionKey(refreshToken || accessToken);
  const cached = getSubscriptions(key);
  if (cached && !cursors && request.nextUrl.searchParams.get("refresh") !== "1") return NextResponse.json(cached, { headers: { "Cache-Control": "private, no-store" } });
  try {
    let subscriptions: YTChannel[] = [];
    let channels: YTChannel[] = [];
    try {
      if (!accessToken) throw new Error("Access token expired");
      subscriptions = await getAllSubscriptions(accessToken);
    } catch (error) {
      if (!refreshToken) throw error;
      const clientId = process.env.YOUTUBE_CLIENT_ID;
      const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
      if (!clientId || !clientSecret) return NextResponse.json({ connected: false, items: [], channels: [], message: "Не настроены OAuth-реквизиты YouTube." }, { status: 503 });
      const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }),
        cache: "no-store", signal: AbortSignal.timeout(25000),
      });
      const refreshed = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok || !refreshed.access_token) return NextResponse.json({ connected: false, items: [], channels: [], message: "Не удалось обновить доступ YouTube. Подключи аккаунт заново." }, { status: 401 });
      accessToken = String(refreshed.access_token);
      rotatedAccessToken = accessToken;
      subscriptions = await getAllSubscriptions(accessToken);
    }
    channels = await getChannelDetails(accessToken, subscriptions);
    // Uploads playlists expose more than the five-item search result cap and cost fewer quota units.
    const selectedChannels = cursors ? channels.filter(channel => cursors![channel.id]) : channels;
    const videosByChannel: Video[][] = new Array(selectedChannels.length);
    let next = 0;
    const failedChannelIds: string[] = [];
    // Bound upstream concurrency even for accounts with thousands of subscriptions.
    await Promise.all(Array.from({ length: Math.min(5, selectedChannels.length) }, async () => {
      while (next < selectedChannels.length) {
        const index = next++;
        try { videosByChannel[index] = await getChannelVideos(accessToken, selectedChannels[index], pages, cursors?.[selectedChannels[index].id]); }
        catch { failedChannelIds.push(selectedChannels[index].id); videosByChannel[index] = []; }
      }
    }));
    const items = videosByChannel.flat().sort((a, b) => Date.parse(b.age) - Date.parse(a.age));
    const nextCursor = Object.keys(pages).length ? Buffer.from(JSON.stringify(pages)).toString("base64url") : "";
    const data = { nextCursor, connected: true, items, channels, partial: failedChannelIds.length > 0, failedChannelIds, subscriptionChannels: channels.length };
    if (!cursors && !failedChannelIds.length) storeSubscriptions(key, data);
    const response = NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
    if (rotatedAccessToken) response.cookies.set("streamly_yt_access", rotatedAccessToken, { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", maxAge: 3600, path: "/" });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось связаться с Google.";
    return NextResponse.json({ connected: false, items: [], channels: [], message: message.includes("Google") ? message : "Не удалось загрузить подписки YouTube. Проверь OAuth-доступ и повтори подключение." }, { status: 502 });
  }
}
