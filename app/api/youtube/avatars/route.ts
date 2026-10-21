import { NextRequest } from 'next/server';
import { youtubeClient, YouTubeError } from '@/lib/youtube-api';
export const runtime = 'nodejs';
export async function GET(request: NextRequest) {
  const client = youtubeClient(request);
  const ids = (request.nextUrl.searchParams.get('ids') || '').split(',');
  if (!ids.length || ids.length > 50 || ids.some(id => !/^[\w-]{11}$/.test(id))) return client.json({ message: 'Некорректные идентификаторы видео.' }, 400);
  try {
    const videos = await client.get('videos', { part: 'snippet', id: ids.join(',') });
    const channels = [...new Set<string>((videos.items || []).map((v: { snippet: { channelId: string } }) => v.snippet.channelId))];
    if (!channels.length) return client.json({ avatars: {} });
    const body = await client.get('channels', { part: 'snippet', id: channels.join(',') });
    const avatars = Object.fromEntries((body.items || []).map((c: { id: string; snippet: { thumbnails?: Record<string, { url: string }> } }) => [c.id, c.snippet.thumbnails?.default?.url || '']));
    return client.json({ avatars: Object.fromEntries((videos.items || []).map((v: { id: string; snippet: { channelId: string } }) => [`yt-${v.id}`, avatars[v.snippet.channelId] || ''])) });
  } catch (error) { return client.json({ message: error instanceof Error ? error.message : 'Не удалось загрузить аватарки.' }, error instanceof YouTubeError ? error.status : 502); }
}
