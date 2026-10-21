"use client";
import { useCallback, useEffect, useRef, useState } from 'react';

type Device = { userCode: string; verificationUri: string; expiresAt: number; interval: number };
export function TwitchDeviceLogin({ onConnected, onClose }: { onConnected: () => Promise<void>; onClose: () => void }) {
  const [device, setDevice] = useState<Device | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  const send = (action: string) => fetch('/api/twitch/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
  async function start() {
    const id = ++generation.current;
    setBusy(true); setError(''); setDevice(null);
    try {
      const response = await send('start'); const body = await response.json();
      if (id !== generation.current) return;
      if (!response.ok) throw new Error(body.error || 'Не удалось получить код Twitch.');
      setDevice(body);
    } catch (err) { if (id === generation.current) setError(err instanceof Error ? err.message : 'Ошибка соединения с Twitch.'); }
    finally { if (id === generation.current) setBusy(false); }
  }
  const poll = useCallback(async () => {
    const id = generation.current;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/twitch/device', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'poll' }) });
      const body = await response.json();
      if (id !== generation.current) return;
      if (!response.ok) {
        if (response.status === 410 || response.status === 403) setDevice(null);
        throw new Error(body.error || 'Не удалось проверить подключение.');
      }
      if (body.status === 'connected') { setDevice(null); await onConnected(); if (id === generation.current) onClose(); }
      else setDevice(old => old ? { ...old, interval: Number(body.interval) || old.interval } : old);
    } catch (err) { if (id === generation.current) setError(err instanceof Error ? err.message : 'Ошибка проверки Twitch.'); }
    finally { if (id === generation.current) setBusy(false); }
  }, [onConnected, onClose]);
  useEffect(() => {
    if (!device || busy || error) return;
    const timer = setTimeout(() => {
      if (Date.now() >= device.expiresAt) { setDevice(null); setError('Код истёк. Получи новый код.'); }
      else void poll();
    }, device.interval * 1000);
    return () => clearTimeout(timer);
  }, [device, busy, error, poll]);
  async function cancel() {
    generation.current++;
    try { await send('cancel'); } catch { /* Local dialog still closes if the server is unavailable. */ } finally { onClose(); }
  }
  return <section className="twitch-device-panel" aria-label="Подключение Twitch по коду">
    <button className="device-close" onClick={() => void cancel()} aria-label="Отменить вход по коду">×</button>
    <h3>Подключить Twitch по коду</h3>
    <p>Подтверди подключение на сайте Twitch. Эта возможность не использует адрес возврата приложения.</p>
    {device ? <>
      <p>Твой одноразовый код:</p><strong className="device-user-code">{device.userCode}</strong>
      <p><a className="primary-button" href={device.verificationUri} target="_blank" rel="noreferrer">Открыть страницу подтверждения Twitch ↗</a></p>
      <p>Введи код на странице Twitch и разреши доступ. Здесь подключение проверится автоматически.</p>
      <button disabled={busy} onClick={() => void poll()}>{busy ? 'Проверяем…' : 'Проверить подключение'}</button>
    </> : <button className="primary-button" disabled={busy} onClick={() => void start()}>{busy ? 'Получаем код…' : 'Получить код Twitch'}</button>}
    {error && <p role="alert">{error}</p>}
    <p><a href="/api/twitch/auth">Обычный вход через Twitch</a></p>
  </section>;
}
