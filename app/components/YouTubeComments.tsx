"use client";
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChannelAvatar } from './ChannelAvatar';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
type Comment = { id: string; author: string; avatar: string; text: string; publishedAt: string; likes: number; replies?: number };
function CommentList({ videoId, parentId = '', order = 'relevance' }: { videoId: string; parentId?: string; order?: string }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [disabled, setDisabled] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const requestState = useRef({ flight: false, generation: 0 });
  const load = useCallback(async (page = '', signal?: AbortSignal) => {
    const state = requestState.current;
    if (state.flight) return;
    const version = ++state.generation;
    state.flight = true; setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ videoId, order });
      if (parentId) params.set('parentId', parentId);
      if (page) params.set('cursor', page);
      const response = await fetch(`/api/youtube/comments?${params}`, { signal });
      const body = await response.json();
      if (signal?.aborted || version !== state.generation) return;
      if (!response.ok) { setDisabled(body.reason === 'commentsDisabled'); throw new Error(body.message || 'Комментарии недоступны.'); }
      setItems(old => [...new Map([...(page ? old : []), ...(body.items || [])].map((item: Comment) => [item.id, item])).values()]);
      setCursor(body.nextCursor && body.nextCursor !== page ? body.nextCursor : '');
    } catch (e) { if (!signal?.aborted && version === state.generation) setError(e instanceof Error ? e.message : 'Ошибка загрузки комментариев.'); }
    finally { if (version === state.generation) { state.flight = false; if (!signal?.aborted) setLoading(false); } }
  }, [videoId, parentId, order]);
  useEffect(() => { const state = requestState.current; const controller = new AbortController(); void load('', controller.signal); return () => { controller.abort(); ++state.generation; state.flight = false; }; }, [load]);
  const end = useInfiniteScroll(cursor, loading, !error, () => void load(cursor));
  return <div className={parentId ? 'comment-replies' : 'comment-list'}>
    {items.map(item => <article className="youtube-comment" key={item.id}>
      <ChannelAvatar src={item.avatar} name={item.author}/><div className="comment-body"><strong>{item.author}</strong><time dateTime={item.publishedAt}>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString('ru-RU') : ''}</time><p>{item.text}</p><small>♡ {item.likes.toLocaleString('ru-RU')}</small>
        {Boolean(item.replies) && <button className="comment-replies-toggle" onClick={() => setExpanded(old => old.includes(item.id) ? old.filter(id => id !== item.id) : [...old, item.id])}>{expanded.includes(item.id) ? 'Скрыть ответы' : `Ответы (${item.replies})`}</button>}
        {expanded.includes(item.id) && <CommentList videoId={videoId} parentId={item.id}/>}</div>
    </article>)}
    {loading && <p role="status">Загружаем комментарии…</p>}
    {error && <p role="alert">{error} {!disabled && <button onClick={() => void load(cursor)}>Повторить</button>}</p>}
    {!loading && !error && !items.length && <p>Пока нет комментариев.</p>}
    {cursor && <div ref={end} data-testid={parentId ? 'replies-end' : 'comments-end'}><button disabled={loading} onClick={() => void load(cursor)}>Ещё комментарии</button></div>}
  </div>;
}
export function YouTubeComments({ videoId }: { videoId: string }) {
  const [order, setOrder] = useState('relevance');
  return <section className="youtube-comments"><header><h3>Комментарии YouTube</h3><select aria-label="Порядок комментариев" value={order} onChange={e => setOrder(e.target.value)}><option value="relevance">Сначала популярные</option><option value="time">Сначала новые</option></select></header><CommentList key={`${videoId}:${order}`} videoId={videoId} order={order}/></section>;
}
