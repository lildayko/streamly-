"use client";
import { twitchChatUrl } from '@/lib/twitch-embed';

export function TwitchChat({ channel }: { channel: string }) {
  const parent = typeof window === 'undefined' ? 'localhost' : window.location.hostname;
  const popout = `https://www.twitch.tv/popout/${encodeURIComponent(channel)}/chat?popout=`;
  return <aside className="twitch-chat" aria-label={`Чат Twitch: ${channel}`}>
    <header className="twitch-chat-heading"><h3>Чат эфира</h3><a href={popout} target="_blank" rel="noreferrer">Открыть отдельно ↗</a></header>
    <iframe key={channel} className="twitch-chat-frame" src={twitchChatUrl(channel, parent)} title={`Чат Twitch — ${channel}`} allow="clipboard-write" />
    <p className="twitch-chat-help">Чтобы писать, войди в Twitch в самом чате. Если вход недоступен в этом окне, открой чат отдельно.</p>
  </aside>;
}
