"use client";
import { useEffect, useRef, useState } from 'react';
import { youtubeBridge, validateImported, ImportedVideo } from '@/lib/youtube-bridge';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import { useChannelAvatars } from '../hooks/useChannelAvatars';
import { ChannelAvatar } from './ChannelAvatar';
export function YouTubeHomeFeed({ onOpen, paused, onCountChange }: { onOpen: (video: ImportedVideo) => void; paused: boolean; onCountChange: (count: number) => void }) {
  const [items, setItems] = useState<ImportedVideo[]>([]);
  const [cursor, setCursor] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [importedAt, setImportedAt] = useState(0);
  const flight = useRef(false);
  const avatars = useChannelAvatars(items);
  useEffect(() => {
    try {
      const cached = JSON.parse(localStorage.getItem('streamly-youtube-home') || '{}');
      setItems(validateImported(cached.items)); setImportedAt(Number(cached.importedAt) || 0);
      if (cached.hasMore) setCursor(`cached:${cached.importedAt}`);
    } catch { /* A broken local snapshot should not prevent a fresh import. */ }
  }, []);
  useEffect(() => onCountChange(items.length), [items.length, onCountChange]);
  async function load(next = false) {
    if (flight.current) return;
    flight.current = true; setLoading(true); setError(''); setMessage('');
    try {
      const result = await youtubeBridge('home', { next, exclude: next ? items.map(v => v.id) : [] });
      const merged = [...new Map([...(next ? items : []), ...(result.items || [])].map(v => [v.id, v])).values()];
      setItems(merged); setCursor(result.hasMore ? String(Date.now()) : '');
      const timestamp = Date.now(); setImportedAt(timestamp); setMessage(result.message || '');
      try { localStorage.setItem('streamly-youtube-home', JSON.stringify({ items: merged, importedAt: timestamp, hasMore: result.hasMore })); } catch { setMessage('Лента загружена. Браузер не смог сохранить её для следующего запуска.'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось импортировать ленту.'); }
    finally { flight.current = false; setLoading(false); }
  }
  const end = useInfiniteScroll(cursor, loading, !paused && !error, () => void load(true));
  return <section className="youtube-import-feed">
    <div className="youtube-import-heading"><div><h3>Твоя главная YouTube</h3><p>{importedAt ? `Импорт из твоей вкладки · ${new Date(importedAt).toLocaleString('ru-RU')}` : 'Рекомендации из аккаунта, выбранного в твоём браузере YouTube.'}</p></div><button className="primary-button" disabled={loading} onClick={() => void load()}>{loading ? 'Импортируем…' : items.length ? 'Обновить мою ленту' : 'Импортировать мою ленту'}</button></div>
    {!items.length && <details className="youtube-import-help" open><summary>Как подключить рекомендации</summary><p>Один раз установи расширение Streamly в Chrome, Chromium, Edge или Яндекс Браузере. Оно читает карточки твоей главной и передаёт их сюда. Пароль и cookies остаются в браузере.</p><ol><li><a href="/streamly-youtube-bridge.zip" download>Скачай расширение</a> и распакуй ZIP.</li><li>Открой <code>chrome://extensions</code>, включи режим разработчика, нажми «Загрузить распакованное расширение» и выбери папку с manifest.json.</li><li>Обнови Streamly и вкладку главной YouTube с нужным аккаунтом. Нажми «Импортировать мою ленту».</li></ol><p>Оставь вкладку YouTube открытой: при прокрутке Streamly расширение загрузит следующую порцию рекомендаций. Для телефона этот способ не поддерживается.</p></details>}
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="video-grid">{items.map(v => <article className="video-card" key={v.id}><button className="thumbnail-button" onClick={() => onOpen({ ...v, channelAvatar: v.channelAvatar || avatars[v.id] })} aria-label={`Открыть ${v.title}`}><img className="thumbnail" src={v.image} alt="" loading="lazy"/><span className="duration">{v.duration}</span></button><div className="video-info"><span className="creator-avatar"><ChannelAvatar src={v.channelAvatar || avatars[v.id]} name={v.creator}/></span><div className="video-copy"><button className="video-title" onClick={() => onOpen({ ...v, channelAvatar: v.channelAvatar || avatars[v.id] })}>{v.title}</button><span className="creator-name">{v.creator}</span><div className="video-meta">{[v.views, v.age].filter(Boolean).join(' · ')}</div></div></div></article>)}</div>
    {cursor && <div className="load-more-wrap" ref={end} data-testid="youtube-home-end"><button className="load-more" disabled={loading} onClick={() => void load(true)}>{loading ? 'Загружаем…' : 'Ещё рекомендации'}</button></div>}
    {!cursor && items.length > 0 && <button className="load-more" disabled={loading} onClick={() => void load(true)}>Проверить новые рекомендации</button>}
  </section>;
}
