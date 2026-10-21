export function twitchChannel(url?: string): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!['www.twitch.tv', 'twitch.tv', 'm.twitch.tv'].includes(parsed.hostname) || parsed.protocol !== 'https:') return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 1 || !/^[a-zA-Z0-9_]{1,25}$/.test(parts[0]) || ['videos', 'directory', 'downloads', 'settings', 'search'].includes(parts[0].toLowerCase())) return null;
    return parts[0].toLowerCase();
  } catch { return null; }
}
export function twitchPlayerUrl(channel: string, parent: string) {
  const url = new URL('https://player.twitch.tv/');
  url.search = new URLSearchParams({ channel, parent, autoplay: 'true' }).toString();
  return url.href;
}
export function twitchChatUrl(channel: string, parent: string) {
  const url = new URL(`https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat`);
  url.search = `${new URLSearchParams({ parent })}&darkpopout`;
  return url.href;
}
