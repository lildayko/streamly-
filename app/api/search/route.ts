import { NextRequest, NextResponse } from "next/server";

import { cachedSearch, SearchBusyError } from "@/lib/search-cache";

export const runtime = "nodejs";

type Platform = "YouTube" | "Twitch" | "VK Видео";
type Item = {
  id: string;
  title: string;
  creator: string;
  channelId?: string;
  platform: Platform;
  category: string;
  views: string;
  age: string;
  duration: string;
  image: string;
  live?: boolean;
  url: string;
};

type ApiRow = {
  id?: string | { videoId?: string }; snippet?: { title?: string; channelTitle?: string; channelId?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
  contentDetails?: { duration?: string }; user_id?: string; user_login?: string; user_name?: string; broadcaster_login?: string; display_name?: string; title?: string;
  game_name?: string; viewer_count?: number; thumbnail_url?: string; owner_id?: number; access_key?: string;
  owner_name?: string; views?: number; duration?: number; photo_320?: string; photo_800?: string; photo_640?: string; photo_130?: string;
};
type IntegrationStatus = { configured: boolean; message: string };

const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
const text = (value: unknown) => typeof value === "string" ? value : "";
const number = (value: unknown) => typeof value === "number" ? value : Number(value ?? 0);
const compact = (value: unknown) => {
  const n = number(value);
  if (!n) return "";
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(n);
};
const safeDate = (value: unknown) => {
  const date = new Date(text(value));
  if (!text(value) || Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Сегодня";
  if (days === 1) return "Вчера";
  return `${days} дн. назад`;
};

async function youtubeSearch(q: string, cursor: string, pages: Record<string, string>, live = false): Promise<Item[]> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("YOUTUBE_API_KEY не задан");
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.search = new URLSearchParams({ part: "snippet", type: "video", maxResults: "50", q, key, safeSearch: "moderate" }).toString();
  if (live) url.searchParams.set("eventType", "live");
  if (cursor) url.searchParams.set("pageToken", cursor);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), next: { revalidate: 60 } });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.message || "Ошибка YouTube API");
  pages.YouTube = text(body.nextPageToken);
  const found = ((body.items ?? []) as ApiRow[]).flatMap((v: ApiRow) => {
    const id = text(typeof v.id === "object" ? v.id.videoId : "");
    if (!id) return [];
    const s = v.snippet ?? {};
    return [{ id: `yt-${id}`, title: text(s.title), creator: text(s.channelTitle) || "YouTube", channelId: text(s.channelId), platform: "YouTube" as const,
      category: "Видео", views: "YouTube", age: safeDate(s.publishedAt), duration: live ? "LIVE" : "Видео", live,
      image: text(s.thumbnails?.high?.url || s.thumbnails?.medium?.url || s.thumbnails?.default?.url), url: `https://www.youtube.com/watch?v=${id}` }];
  });
  // Search results don't include duration; retrieve it so the UI can identify short clips.
  const ids = found.map(v => v.id.slice(3));
  if (ids.length && !live) {
    try {
    const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    detailsUrl.search = new URLSearchParams({ part: "contentDetails", id: ids.join(","), key }).toString();
    const detailsResponse = await fetch(detailsUrl, { signal: AbortSignal.timeout(15000), next: { revalidate: 60 } });
    const detailsBody = await detailsResponse.json();
    if (detailsResponse.ok) {
      const durations = new Map<string, number>((detailsBody.items ?? []).map((v: ApiRow) => {
        const iso = text(v.contentDetails?.duration);
        const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        return [text(v.id), match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : 0];
      }));
      return found.map((v: typeof found[number]) => {
        const seconds = durations.get(v.id.slice(3)) || 0;
        return { ...v, duration: seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "Видео", tag: seconds > 0 && seconds < 165 ? "Shorts" : undefined };
      });
    }
    } catch { /* Keep search results visible when duration lookup times out. */ }
  }
  return found;
}

async function twitchSearch(q: string, cursor: string, pages: Record<string, string>): Promise<Item[]> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("TWITCH_CLIENT_ID или TWITCH_CLIENT_SECRET не заданы");
  const tokenResponse = await fetch("https://id.twitch.tv/oauth2/token", {
    signal: AbortSignal.timeout(15000), method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }), cache: "no-store",
  });
  const tokenBody = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenBody.access_token) throw new Error("Не удалось получить токен Twitch");
  const url = new URL(q ? "https://api.twitch.tv/helix/search/channels" : "https://api.twitch.tv/helix/streams");
  url.search = new URLSearchParams(q ? { query: q, live_only: "true", first: "50" } : { first: "50" }).toString();
  if (cursor) url.searchParams.set("after", cursor);
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "Client-Id": clientId, Authorization: `Bearer ${tokenBody.access_token}` }, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body?.message || "Ошибка Twitch API");
  pages.Twitch = text(body.pagination?.cursor);
  return (body.data ?? []).map((v: ApiRow) => ({
    id: `tw-${text(v.user_id || v.id || v.broadcaster_login)}`, title: text(v.title) || `${text(v.user_name || v.display_name)} — эфир`,
    creator: text(v.user_name || v.display_name) || text(v.user_login || v.broadcaster_login) || "Twitch", channelId: text(v.user_id || v.id || v.broadcaster_login), platform: "Twitch" as const,
    category: text(v.game_name) || "Стримы", views: v.viewer_count === undefined ? "Прямой эфир" : `${compact(v.viewer_count)} зрителей`, age: "В эфире", duration: "LIVE", live: true,
    image: text(v.thumbnail_url).replace("{width}", "640").replace("{height}", "360"),
    url: `https://www.twitch.tv/${text(v.user_login || v.broadcaster_login)}`,
  }));
}

async function vkSearch(q: string, cursor: string, pages: Record<string, string>): Promise<Item[]> {
  const token = process.env.VK_ACCESS_TOKEN;
  if (!token) throw new Error("VK_ACCESS_TOKEN не задан");
  const url = new URL("https://api.vk.com/method/video.search");
  url.search = new URLSearchParams({ access_token: token, v: process.env.VK_API_VERSION || "5.199", q, count: "50", adult: "0", sort: "2" }).toString();
  const offset = /^\d+$/.test(cursor) ? Number(cursor) : 0;
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), cache: "no-store" });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(body?.error?.error_msg || "Ошибка VK API");
  const videos = body.response?.items ?? [];
  pages["VK Видео"] = videos.length && offset + videos.length < Number(body.response?.count) ? String(offset + videos.length) : "";
  return videos.map((v: ApiRow) => {
    const owner = number(v.owner_id);
    const id = number(v.id);
    const accessKey = text(v.access_key);
    const url = `https://vk.com/video${owner}_${id}${accessKey ? `?access_key=${encodeURIComponent(accessKey)}` : ""}`;
    return { id: `vk-${owner}-${id}`, title: text(v.title) || "Видео VK", creator: text(v.owner_name) || "VK Видео", channelId: String(owner),
      platform: "VK Видео" as const, category: "Видео", views: `${compact(v.views)} просмотров`, age: "VK Видео",
      duration: number(v.duration) ? `${Math.floor(number(v.duration) / 60)}:${String(number(v.duration) % 60).padStart(2, "0")}` : "Видео",
      image: text(v.photo_320 || v.photo_800 || v.photo_640 || v.photo_130), url };
  });
}

export async function GET(request: NextRequest) {
  const discover = request.nextUrl.searchParams.get("discover") === "1";
  const live = request.nextUrl.searchParams.get("live") === "1";
  const q = (request.nextUrl.searchParams.get("q") || (discover && !live ? "популярные видео" : "")).trim().slice(0, 150);
  const selected = request.nextUrl.searchParams.get("platform") || "Все платформы";
  if (!q && !discover && !live) return json({ items: [], statuses: {}, configuredCount: 0 });

  let cursors: Record<string, string> = {};
  const encodedCursor = request.nextUrl.searchParams.get("cursor");
  if (encodedCursor) {
    try {
      if (encodedCursor.length > 4096) throw new Error();
      const decoded = JSON.parse(Buffer.from(encodedCursor, "base64url").toString());
      if (Boolean(decoded.live) !== live || decoded.q !== q || decoded.selected !== selected || !decoded.pages || typeof decoded.pages !== "object" || Object.values(decoded.pages).some(x => typeof x !== "string")) throw new Error();
      cursors = decoded.pages;
    } catch { return json({ error: "Некорректная страница поиска" }, 400); }
  }
  const pages: Record<string, string> = {};
  const sources: { label: Platform; run: () => Promise<Item[]>; configured: boolean; missing: string }[] = [
    { label: "YouTube", run: () => youtubeSearch(q, cursors.YouTube || "", pages, live), configured: Boolean(process.env.YOUTUBE_API_KEY), missing: "Добавь YOUTUBE_API_KEY в .env.local" },
    { label: "Twitch", run: () => twitchSearch(discover ? "" : q, cursors.Twitch || "", pages), configured: Boolean(process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET), missing: "Добавь TWITCH_CLIENT_ID и TWITCH_CLIENT_SECRET в .env.local" },
    { label: "VK Видео", run: () => vkSearch(q, cursors["VK Видео"] || "", pages), configured: Boolean(process.env.VK_ACCESS_TOKEN), missing: "Добавь VK_ACCESS_TOKEN в .env.local" },
  ];
  const chosen = sources.filter((source) => (!live || source.label !== "VK Видео") && (selected === "Все платформы" || selected === source.label) && (!encodedCursor || Boolean(cursors[source.label])));
  let settled;
  try { settled = await Promise.all(chosen.map(async (source) => {
    if (!source.configured) return { label: source.label, items: [] as Item[], status: { configured: false, message: source.missing } };
    try {
      const result = await cachedSearch(JSON.stringify([q, discover, live, source.label, cursors[source.label] || ""]), async () => {
        const items = await source.run();
        return { items, next: pages[source.label] || "" };
      });
      const items = result.items;
      pages[source.label] = result.next;
      return { label: source.label, items, status: { configured: true, message: "Подключено" } };
    } catch (error) {
      if (error instanceof SearchBusyError) throw error;
      return { label: source.label, items: [] as Item[], status: { configured: true, message: error instanceof Error ? error.message : "Ошибка API" } };
    }
  })); } catch (error) {
    if (error instanceof SearchBusyError) return NextResponse.json({ error: error.message }, { status: 429, headers: { "Retry-After": "60" } });
    throw error;
  }
  const statuses = Object.fromEntries(settled.map(({ label, status }) => [label, status as IntegrationStatus]));
  const items = settled.flatMap((result) => result.items);
  const nextCursor = Object.values(pages).some(Boolean) ? Buffer.from(JSON.stringify({ q, selected, pages, live })).toString("base64url") : "";
  return json({ items, statuses, nextCursor, configuredCount: Object.values(statuses).filter((s) => s.configured).length });
}
