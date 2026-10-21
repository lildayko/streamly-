import { NextRequest } from 'next/server';
import { youtubeClient, YouTubeError } from '@/lib/youtube-api';
export const runtime = 'nodejs';
type Row = { id: string; snippet: { authorDisplayName?: string; authorProfileImageUrl?: string; textDisplay?: string; publishedAt?: string; likeCount?: number; topLevelComment?: Row; totalReplyCount?: number } };
const comment = (row: Row) => ({ id: row.id, author: row.snippet.authorDisplayName || 'YouTube', avatar: row.snippet.authorProfileImageUrl || '', text: row.snippet.textDisplay || '', publishedAt: row.snippet.publishedAt || '', likes: row.snippet.likeCount || 0 });
export async function GET(request: NextRequest) {
  const client = youtubeClient(request);
  const videoId = request.nextUrl.searchParams.get('videoId') || '';
  const parentId = request.nextUrl.searchParams.get('parentId') || '';
  const cursor = request.nextUrl.searchParams.get('cursor') || '';
  const order = request.nextUrl.searchParams.get('order') === 'time' ? 'time' : 'relevance';
  if (!/^[\w-]{11}$/.test(videoId) || parentId.length > 256 || cursor.length > 4096) return client.json({ message: 'Некорректный запрос комментариев.' }, 400);
  try {
    const body = await client.get(parentId ? 'comments' : 'commentThreads', { part: 'snippet', maxResults: '50', textFormat: 'plainText', ...(parentId ? { parentId } : { videoId, order }), ...(cursor ? { pageToken: cursor } : {}) });
    const items = (body.items || []).map((row: Row) => parentId ? comment(row) : { ...comment(row.snippet.topLevelComment!), replies: row.snippet.totalReplyCount || 0 });
    return client.json({ items, nextCursor: body.nextPageToken || '' });
  } catch (error) { return client.json({ message: error instanceof Error ? error.message : 'Ошибка загрузки комментариев.', reason: error instanceof YouTubeError ? error.reason : '' }, error instanceof YouTubeError ? error.status : 502); }
}
